import type { Agent } from "./agent";
import type { EventBus } from "./event-bus";
import type { Logger, Task } from "./types";
import { now } from "./types";
import type { Store } from "./store";

export interface OrchestratorDeps {
  store: Store;
  bus: EventBus;
  log: Logger;
  concurrency?: number;
  defaultAgentId?: string;
}

/**
 * Owns the agent lifecycle and the dispatch loop. Picks the next queued task,
 * binds it to an agent (explicit `assignedTo`, else the default), runs it under
 * a concurrency cap, retries on failure with backoff, and resumes tasks that
 * paused for human approval.
 */
export class Orchestrator {
  private agents = new Map<string, Agent>();
  private deps: OrchestratorDeps;
  private running = 0;
  private concurrency: number;
  private tickScheduled = false;
  private started = false;

  constructor(deps: OrchestratorDeps) {
    this.deps = deps;
    this.concurrency = deps.concurrency ?? 4;
  }

  register(agent: Agent): this {
    this.agents.set(agent.id, agent);
    return this;
  }

  getAgents(): Agent[] {
    return [...this.agents.values()];
  }

  agent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  start(): void {
    this.started = true;
    this.deps.log.info("orchestrator.started", { agents: this.agents.size, concurrency: this.concurrency });
    this.schedule();
  }

  stop(): void {
    this.started = false;
  }

  async enqueue(task: Task): Promise<Task> {
    this.deps.store.insertTask(task);
    await this.deps.bus.emit("task.queued", { taskId: task.id, title: task.title }, { source: task.createdBy, tenantId: task.tenantId, taskId: task.id });
    this.schedule();
    return task;
  }

  private schedule(): void {
    if (!this.started) return;
    if (this.tickScheduled) return;
    this.tickScheduled = true;
    queueMicrotask(() => {
      this.tickScheduled = false;
      void this.tick();
    });
  }

  private async tick(): Promise<void> {
    while (this.started && this.running < this.concurrency) {
      const task = this.deps.store.nextQueued();
      if (!task) break;
      const agent = this.resolveAgent(task);
      if (!agent) {
        this.deps.store.updateTaskState(task.id, {
          state: "failed",
          finishedAt: now(),
          error: `no agent available for assignment '${task.assignedTo ?? "(none)"}'`,
        });
        await this.deps.bus.emit("task.unassigned", { taskId: task.id }, { source: "orchestrator", tenantId: task.tenantId, taskId: task.id });
        continue;
      }
      this.running++;
      void this.runTask(task, agent);
    }
  }

  private resolveAgent(task: Task): Agent | undefined {
    if (task.assignedTo) return this.agents.get(task.assignedTo);
    if (this.deps.defaultAgentId) return this.agents.get(this.deps.defaultAgentId);
    const first = this.getAgents()[0];
    return first;
  }

  private async runTask(task: Task, agent: Agent): Promise<void> {
    const { store, bus, log } = this.deps;
    const attempts = task.attempts + 1;
    store.updateTaskState(task.id, { state: "assigned", assignedTo: agent.id, attempts });
    await bus.emit("task.assigned", { taskId: task.id, agentId: agent.id }, { source: "orchestrator", tenantId: task.tenantId, taskId: task.id, agentId: agent.id });

    try {
      const result = await agent.run(task);
      if (result.awaitingApprovalId) {
        // Paused for approval; orchestrator resumes on decide().
        log.info("task.awaiting_approval", { taskId: task.id, approvalId: result.awaitingApprovalId });
      } else if (!result.ok) {
        await this.maybeRetry(task, result.error ?? "run failed");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("task.threw", { taskId: task.id, error: msg });
      await this.maybeRetry(task, msg);
    } finally {
      this.running--;
      this.schedule();
    }
  }

  private async maybeRetry(task: Task, error: string): Promise<void> {
    const current = this.deps.store.getTask(task.id);
    const attempts = current?.attempts ?? 1;
    if (attempts < task.maxAttempts) {
      this.deps.store.updateTaskState(task.id, { state: "queued", error });
      const backoff = Math.min(2000 * 2 ** (attempts - 1), 10_000);
      this.deps.log.warn("task.retrying", { taskId: task.id, attempt: attempts + 1, backoff });
      setTimeout(() => this.schedule(), backoff);
    } else {
      this.deps.store.updateTaskState(task.id, { state: "failed", finishedAt: now(), error });
      await this.deps.bus.emit("task.failed", { taskId: task.id, error }, { source: "orchestrator", tenantId: task.tenantId, taskId: task.id });
    }
  }

  /** Resume a task paused on an approval gate, after a human decision. */
  async resume(approvalId: string): Promise<void> {
    const approval = this.deps.store.getApproval(approvalId);
    if (!approval || approval.state === "pending") return;
    const task = this.deps.store.getTask(approval.taskId);
    if (!task || task.state !== "awaiting_approval") return;
    const agent = this.agents.get(approval.agentId);
    if (!agent) return;

    this.running++;
    try {
      const result = await agent.run(task, { approvalId });
      if (!result.ok && !result.awaitingApprovalId) {
        await this.maybeRetry(task, result.error ?? "run failed after approval");
      }
    } finally {
      this.running--;
      this.schedule();
    }
  }

  /** Submit a task and await its terminal state (used by tests/scenarios). */
  async runToCompletion(task: Task, opts: { timeoutMs?: number } = {}): Promise<Task | undefined> {
    if (!this.deps.store.getTask(task.id)) await this.enqueue(task);
    const deadline = Date.now() + (opts.timeoutMs ?? 15_000);
    while (Date.now() < deadline) {
      const t = this.deps.store.getTask(task.id);
      if (!t) return undefined;
      if (t.state === "succeeded" || t.state === "failed" || t.state === "cancelled") return t;
      if (t.state === "awaiting_approval") return t;
      await sleep(25);
    }
    return this.deps.store.getTask(task.id);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
