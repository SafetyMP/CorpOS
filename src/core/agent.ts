import type {
  AgentDefinition,
  AgentRunResult,
  AgentRunStep,
  ChatMessage,
  Logger,
  LLMProvider,
  Task,
  TaskResult,
  ToolCall,
} from "./types";
import { now } from "./types";
import { EventBus } from "./event-bus";
import type { Store } from "./store";
import type { ToolRegistry } from "./tool";
import type { PolicyEngine } from "./policy";
import type { MemoryStore } from "./memory";

export interface AgentDeps {
  def: AgentDefinition;
  provider: LLMProvider;
  tools: ToolRegistry;
  policy: PolicyEngine;
  memory: MemoryStore;
  store: Store;
  bus: EventBus;
  log: Logger;
}

export interface ResumeHandle {
  approvalId: string;
}

/**
 * An LLM-driven agent. The run loop:
 *   reason → (optional) tool calls, each policy-gated → observe results → repeat
 * It stops when the model returns no tool calls (final answer) or the step
 * cap is hit. Consequential tool calls that require approval pause the run
 * and return an approval id; the orchestrator resumes after a decision.
 */
export class Agent {
  readonly id: string;
  readonly def: AgentDefinition;
  private deps: AgentDeps;

  constructor(deps: AgentDeps) {
    this.deps = deps;
    this.id = deps.def.id;
    this.def = deps.def;
  }

  async run(task: Task, resume?: ResumeHandle): Promise<AgentRunResult> {
    const { provider, tools, policy, memory, store, bus, log, def } = this.deps;
    const tenantId = task.tenantId;
    const steps: AgentRunStep[] = [];
    const logCtx = { agentId: def.id, taskId: task.id, tenantId };

    store.updateTaskState(task.id, {
      state: "running",
      startedAt: task.startedAt ?? now(),
    });
    await bus.emit("agent.started", { agentId: def.id, role: def.role }, { source: def.id, ...logCtx });

    const messages: ChatMessage[] = [this.systemMessage(), this.taskMessage(task)];

    // Inject long-term memory relevant to this task.
    const recalled = memory.recall(tenantId, def.id, { query: task.title, limit: 5 });
    if (recalled.length) {
      messages.push({
        role: "user",
        content: `Relevant memory:\n${recalled.map((m) => `- ${m.content}`).join("\n")}`,
      });
    }

    // Resume path: replay the decision on the paused tool call.
    if (resume) {
      const approval = store.getApproval(resume.approvalId);
      if (approval) {
        if (approval.state === "approved") {
          messages.push({
            role: "assistant",
            content: `(resuming approved call to ${approval.tool})`,
            toolCalls: [
              { id: approval.id, name: approval.tool, arguments: approval.args },
            ],
          });
          const ctx = this.ctx(task);
          const result = await tools.invoke(approval.tool, approval.args, ctx);
          if (result.cost) this.recordSpend(task, approval.tool, result.cost.amount, result.cost.currency);
          messages.push(this.toolResultMessage(approval.id, result.note ?? JSON.stringify(result.data ?? result)));
          steps.push({ ts: now(), results: [result] });
        } else {
          messages.push({
            role: "user",
            content: `Your request to use ${approval.tool} was ${approval.state}. Proceed without it or choose another approach.`,
          });
        }
      }
    }

    const maxSteps = def.maxSteps ?? 8;
    for (let step = 0; step < maxSteps; step++) {
      const response = await provider.complete({
        messages,
        tools: tools.schemasFor(def.tools),
        model: def.model,
        temperature: 0.2,
      });

      messages.push(response.message);
      const stepEntry: AgentRunStep = { ts: now(), thought: response.message.content };

      if (!response.toolCalls.length) {
        // Final answer.
        const result: TaskResult = {
          summary: response.message.content || "(empty response)",
        };
        steps.push(stepEntry);
        await this.finish(task, result, steps, true);
        return { taskId: task.id, ok: true, steps, result };
      }

      // Execute each tool call, gating through policy.
      const results = [];
      const decisions = [];
      for (const call of response.toolCalls) {
        const tool = tools.get(call.name);
        if (!tool) {
          const msg = `Tool not found: ${call.name}`;
          messages.push(this.toolResultMessage(call.id, msg));
          results.push({ ok: false, error: msg });
          continue;
        }
        const decision = policy.evaluate(tool, call.arguments, {
          tenantId,
          agentId: def.id,
          taskId: task.id,
        });
        decisions.push({ tool: call.name, decision });

        if (decision.effect === "deny") {
          messages.push(this.toolResultMessage(call.id, `DENIED: ${decision.reason}`));
          results.push({ ok: false, error: decision.reason });
          await bus.emit("tool.denied", { tool: call.name, reason: decision.reason }, { source: def.id, ...logCtx });
          continue;
        }
        if (decision.effect === "approve" && decision.approvalId) {
          // Pause for human approval.
          store.updateTaskState(task.id, { state: "awaiting_approval" });
          await bus.emit("agent.awaiting_approval", { approvalId: decision.approvalId, tool: call.name }, { source: def.id, ...logCtx });
          steps.push({ ...stepEntry, policyDecisions: decisions });
          return { taskId: task.id, ok: false, steps, awaitingApprovalId: decision.approvalId };
        }

        await bus.emit("tool.call", { tool: call.name, args: call.arguments }, { source: def.id, ...logCtx });
        const result = await tools.invoke(call.name, call.arguments, this.ctx(task));
        if (result.cost) {
          this.recordSpend(task, call.name, result.cost.amount, result.cost.currency);
        }
        memory.pushWorking(def.id, `${call.name} → ${result.note ?? "(ok)"}`);
        messages.push(this.toolResultMessage(call.id, result.note ?? JSON.stringify(result.data ?? result)));
        results.push(result);
      }

      stepEntry.toolCalls = response.toolCalls;
      stepEntry.results = results;
      stepEntry.policyDecisions = decisions;
      steps.push(stepEntry);
      log.debug("agent.step", { agentId: def.id, step, tools: response.toolCalls.map((c) => c.name) });
    }

    // Step cap exhausted.
    const err = `exceeded max steps (${maxSteps})`;
    await this.finish(task, undefined, steps, false, err);
    return { taskId: task.id, ok: false, steps, error: err };
  }

  private systemMessage(): ChatMessage {
    return { role: "system", content: this.deps.def.systemPrompt };
  }

  private taskMessage(task: Task): ChatMessage {
    const input = task.input ? `\n\nInput: ${JSON.stringify(task.input)}` : "";
    return {
      role: "user",
      content: `Task: ${task.title}\n${task.description}${input}\n\nUse your tools to make progress, then give a final summary when done.`,
    };
  }

  private toolResultMessage(toolCallId: string, content: string): ChatMessage {
    return { role: "tool", toolCallId, content };
  }

  private ctx(task: Task) {
    return {
      agentId: this.def.id,
      taskId: task.id,
      tenantId: task.tenantId,
      logger: this.deps.log,
    };
  }

  private async recordSpend(task: Task, tool: string, amount: number, currency: string): Promise<void> {
    const { store, def, bus } = this.deps;
    store.recordSpend({
      id: `${tool}_${task.id}_${Date.now()}`,
      tenantId: task.tenantId,
      agentId: def.id,
      taskId: task.id,
      tool,
      amount,
      currency,
      ref: task.title,
      ts: now(),
    });
    await bus.emit("spend.recorded", { tool, amount, currency }, { source: def.id, taskId: task.id, tenantId: task.tenantId, agentId: def.id });
  }

  private async finish(
    task: Task,
    result: TaskResult | undefined,
    steps: AgentRunStep[],
    ok: boolean,
    error?: string
  ): Promise<void> {
    const { store, memory, bus, def, log } = this.deps;
    store.updateTaskState(task.id, {
      state: ok ? "succeeded" : "failed",
      finishedAt: now(),
      output: result,
      error,
    });
    if (result) {
      memory.remember({
        tenantId: task.tenantId,
        agentId: def.id,
        kind: "decision",
        content: `${task.title} → ${result.summary}`,
        tags: [task.assignedTo ?? def.role],
      });
    }
    memory.clearWorking(def.id);
    await bus.emit(
      ok ? "agent.succeeded" : "agent.failed",
      { taskId: task.id, steps: steps.length, error },
      { source: def.id, taskId: task.id, tenantId: task.tenantId, agentId: def.id }
    );
    log.audit(ok ? "agent.succeeded" : "agent.failed", { taskId: task.id, agentId: def.id });
  }
}
