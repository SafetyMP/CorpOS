import { eq } from "drizzle-orm";
import type { Company } from "./company.js";
import { runAgentTurn } from "./company.js";
import { agents, tasks } from "./schema.js";
import type { LLMProvider } from "./types.js";
import { now } from "./types.js";
import { endSpan, startSpan } from "./otel.js";
import { publishFirmEvent } from "./events.js";

export interface OrchestratorOptions {
  concurrency?: number;
  provider: LLMProvider;
  /** When true, pause on HITL until resume() (default true). */
  awaitHitl?: boolean;
}

/**
 * Owns task dispatch: assign, concurrency cap, pause on HITL, resume on decide.
 */
export class Orchestrator {
  private running = 0;
  private concurrency: number;
  private provider: LLMProvider;
  private company: Company;
  private awaitHitl: boolean;
  private waiters = new Map<string, { resolve: (v: boolean) => void }>();
  /** Decides that arrive before waitForResume is registered. */
  private pendingResume = new Map<string, boolean>();

  constructor(company: Company, opts: OrchestratorOptions) {
    this.company = company;
    this.provider = opts.provider;
    this.concurrency = opts.concurrency ?? 2;
    this.awaitHitl = opts.awaitHitl !== false;
  }

  setAwaitHitl(v: boolean): void {
    this.awaitHitl = v;
  }

  /** Resolve a paused task after exception decide (approved → true). */
  resume(taskId: string, approved: boolean): void {
    const w = this.waiters.get(taskId);
    if (w) {
      this.waiters.delete(taskId);
      w.resolve(approved);
      return;
    }
    this.pendingResume.set(taskId, approved);
  }

  waitForResume(taskId: string): Promise<boolean> {
    if (this.pendingResume.has(taskId)) {
      const v = this.pendingResume.get(taskId)!;
      this.pendingResume.delete(taskId);
      return Promise.resolve(v);
    }
    return new Promise((resolve) => {
      this.waiters.set(taskId, { resolve });
    });
  }

  async enqueueAndRun(taskId: string): Promise<{
    ok: boolean;
    awaitingExceptionId?: string;
    steps: unknown[];
    summary?: string;
  }> {
    while (this.running >= this.concurrency) {
      await new Promise((r) => setTimeout(r, 10));
    }
    this.running++;
    try {
      return await this.runTask(taskId);
    } finally {
      this.running--;
    }
  }

  private async runTask(taskId: string): Promise<{
    ok: boolean;
    awaitingExceptionId?: string;
    steps: unknown[];
    summary?: string;
  }> {
    const task = (await this.company.db.select().from(tasks).where(eq(tasks.id, taskId)))[0];
    if (!task) return { ok: false, steps: [] };

    const agentId = task.assignedTo;
    if (!agentId) return { ok: false, steps: [] };

    const agent = (await this.company.db.select().from(agents).where(eq(agents.id, agentId)))[0];
    if (!agent || (agent as { active?: number }).active === 0) {
      await this.company.db
        .update(tasks)
        .set({ state: "failed", error: "inactive agent", finishedAt: now() })
        .where(eq(tasks.id, taskId));
      return { ok: false, steps: [] };
    }

    await this.company.db
      .update(tasks)
      .set({ state: "running", startedAt: now(), attempts: task.attempts + 1 })
      .where(eq(tasks.id, taskId));

    publishFirmEvent("task.started", { taskId, agentId, role: agent.role });

    const span = startSpan("invoke_agent", `invoke_agent ${agent.role}`, {
      "gen_ai.agent.name": agent.role,
      "gen_ai.provider.name": this.provider.id,
    });

    const result = await runAgentTurn(this.company, this.provider, {
      agentId,
      taskId,
      contractId: task.contractId,
      tenantId: task.tenantId,
      systemPrompt: `You are ${agent.role} for CorpOS.`,
      userPrompt: task.description,
      originatingAuthority: agent.owner,
      delegationDepth: 0,
    });

    endSpan(span, {
      attributes: { ok: result.ok },
    });

    if (result.awaitingExceptionId) {
      await this.company.db
        .update(tasks)
        .set({ state: "awaiting_exception" })
        .where(eq(tasks.id, taskId));
      publishFirmEvent("exception.awaiting", {
        taskId,
        exceptionId: result.awaitingExceptionId,
        agentId,
      });
      if (!this.awaitHitl) {
        return {
          ok: false,
          awaitingExceptionId: result.awaitingExceptionId,
          steps: result.steps,
        };
      }
      const approved = await this.waitForResume(taskId);
      if (!approved) {
        await this.company.db
          .update(tasks)
          .set({
            state: "failed",
            finishedAt: now(),
            error: "exception rejected or TTL",
          })
          .where(eq(tasks.id, taskId));
        return { ok: false, awaitingExceptionId: result.awaitingExceptionId, steps: result.steps };
      }
      await this.company.db
        .update(tasks)
        .set({
          state: "done",
          finishedAt: now(),
          resultSummary: "resumed after HITL approve",
        })
        .where(eq(tasks.id, taskId));
      publishFirmEvent("task.resumed", { taskId, agentId });
      return {
        ok: true,
        awaitingExceptionId: result.awaitingExceptionId,
        steps: result.steps,
        summary: "resumed after HITL",
      };
    }

    await this.company.db
      .update(tasks)
      .set({
        state: result.ok ? "done" : "failed",
        finishedAt: now(),
        resultSummary: result.summary ?? "",
      })
      .where(eq(tasks.id, taskId));
    publishFirmEvent("task.finished", { taskId, agentId, ok: result.ok });
    return result;
  }
}
