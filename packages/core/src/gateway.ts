import { eq } from "drizzle-orm";
import type { Db } from "./db.js";
import type { AuditLog } from "./audit.js";
import type { PolicyEngine } from "./policy.js";
import type { Tool, ToolContext, ToolResult, PolicyDecision } from "./types.js";
import type { ToolMap } from "./tools.js";
import {
  agents,
  compensators,
  controlState,
  departments,
  drafts,
  spendLedger,
  tasks,
} from "./schema.js";
import { newId } from "./id.js";
import { now } from "./types.js";
import { endSpan, startSpan } from "./otel.js";

export interface GatewayInvokeResult {
  decision: PolicyDecision;
  result?: ToolResult;
  draftId?: string;
}

export class ToolGateway {
  constructor(
    private db: Db,
    private policy: PolicyEngine,
    private audit: AuditLog,
    private tools: ToolMap,
    private mcpInvoke?: (name: string, args: Record<string, unknown>) => Promise<ToolResult>,
  ) {}

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }

  async invoke(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<GatewayInvokeResult> {
    const tool = this.tools.get(name);
    const span = startSpan("execute_tool", `execute_tool ${name}`, {
      "gen_ai.operation.name": "execute_tool",
      "gen_ai.tool.name": name,
      "gen_ai.agent.name": ctx.agentId,
    });
    const decision = await this.policy.evaluate(tool, args, ctx);
    await this.audit.append("gateway.decision", {
      tool: name,
      effect: decision.effect,
      reason: decision.reason,
      decisionId: decision.decisionId,
      authzLayer: decision.authzLayer,
    });
    endSpan(span, { decisionId: decision.decisionId });

    if (decision.effect === "deny") {
      await this.recordViolation(ctx.agentId);
      return { decision };
    }
    if (decision.effect === "approve") {
      return { decision };
    }

    if (decision.effect === "draft") {
      const draftId = decision.draftId ?? newId("draft");
      await this.db.insert(drafts).values({
        id: draftId,
        tenantId: ctx.tenantId,
        contractId: ctx.contractId,
        taskId: ctx.taskId,
        agentId: ctx.agentId,
        tool: name,
        argsJson: JSON.stringify(args),
        state: "staged",
        createdAt: now(),
      });
      await this.audit.append("draft.staged", { draftId, tool: name });
      return {
        decision,
        draftId,
        result: { ok: true, note: `Draft staged for ${name}`, draftId },
      };
    }

    return { decision, result: await this.execute(name, args, ctx) };
  }

  /**
   * PEP for an already-approved exception. Re-checks policy (kill switch,
   * authz, capital cap) and executes only when that check does not deny.
   */
  async executeApproved(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<GatewayInvokeResult> {
    return this.enforce(name, args, ctx);
  }

  async settleDraft(draftId: string, ctx: ToolContext): Promise<ToolResult> {
    const draft = (await this.db.select().from(drafts).where(eq(drafts.id, draftId)))[0];
    if (!draft || draft.state !== "staged") return { ok: false, error: "draft not found" };
    const args = JSON.parse(draft.argsJson) as Record<string, unknown>;
    const gated = await this.enforce(draft.tool, args, ctx);
    if (gated.decision.effect === "deny" || !gated.result) {
      await this.audit.append("draft.settle_denied", {
        draftId,
        tool: draft.tool,
        reason: gated.decision.reason,
      });
      return { ok: false, error: gated.decision.reason };
    }
    const result = gated.result;
    await this.db
      .update(drafts)
      .set({ state: "settled", settledAt: now() })
      .where(eq(drafts.id, draftId));
    if (result.compensator) {
      await this.db.insert(compensators).values({
        id: newId("cmp"),
        draftId,
        contractId: draft.contractId,
        kind: result.compensator,
        payloadJson: JSON.stringify({ args, result }),
        state: "ready",
        createdAt: now(),
      });
    }
    await this.audit.append("draft.settled", { draftId, tool: draft.tool });
    return result;
  }

  async compensate(contractId: string): Promise<number> {
    const rows = (await this.db.select().from(compensators)).filter(
      (c) => c.contractId === contractId && c.state === "ready",
    );
    let n = 0;
    for (const c of rows) {
      const payload = JSON.parse(c.payloadJson) as {
        args: Record<string, unknown>;
        result: ToolResult;
      };
      const execArgs = {
        ...payload.args,
        refundId: (payload.result.data as { refundId?: string } | undefined)?.refundId,
        amount: payload.args.amount,
      };
      const draft = (await this.db.select().from(drafts).where(eq(drafts.id, c.draftId)))[0];
      const task = draft?.taskId
        ? (await this.db.select().from(tasks).where(eq(tasks.id, draft.taskId)))[0]
        : undefined;
      const delegationDepth = typeof task?.delegationDepth === "number" ? task.delegationDepth : 0;
      const ctx: ToolContext = {
        agentId: draft?.agentId ?? "agent_finance",
        taskId: draft?.taskId ?? "compensate",
        contractId,
        tenantId: draft?.tenantId ?? "default",
        delegationDepth,
      };
      const gated = await this.enforce(c.kind, execArgs, ctx);
      if (gated.decision.effect === "deny" || !gated.result) {
        await this.audit.append("compensate.denied", {
          compensatorId: c.id,
          kind: c.kind,
          reason: gated.decision.reason,
        });
        continue;
      }
      await this.db
        .update(compensators)
        .set({ state: "run", runAt: now() })
        .where(eq(compensators.id, c.id));
      n++;
      await this.audit.append("compensate.run", { compensatorId: c.id, kind: c.kind });
    }
    return n;
  }

  async setKilled(killed: boolean): Promise<void> {
    const row = (await this.db.select().from(controlState).where(eq(controlState.id, "global")))[0];
    if (!row) {
      await this.db.insert(controlState).values({
        id: "global",
        killed: killed ? 1 : 0,
        tokenBudget: 100000,
        tokensUsed: 0,
      });
    } else {
      await this.db
        .update(controlState)
        .set({ killed: killed ? 1 : 0 })
        .where(eq(controlState.id, "global"));
    }
    await this.audit.append("kill.switch", { killed });
  }

  /** Second PDP check. Deny skips execution; allow/draft/approve from the ladder does not. */
  private async enforce(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<GatewayInvokeResult> {
    const tool = this.tools.get(name);
    const decision = await this.policy.evaluate(tool, args, ctx, "enforce");
    await this.audit.append("gateway.decision", {
      tool: name,
      effect: decision.effect,
      reason: decision.reason,
      decisionId: decision.decisionId,
      authzLayer: decision.authzLayer,
      phase: "enforce",
    });
    if (decision.effect === "deny") {
      await this.recordViolation(ctx.agentId);
      return { decision };
    }
    return { decision, result: await this.execute(name, args, ctx) };
  }

  private async recordViolation(agentId: string): Promise<void> {
    const agent = (await this.db.select().from(agents).where(eq(agents.id, agentId)))[0];
    if (!agent) return;
    await this.db
      .update(agents)
      .set({ violations: agent.violations + 1 })
      .where(eq(agents.id, agent.id));
  }

  private async execute(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    if (name === "knowledge.search" && this.mcpInvoke) {
      const result = await this.mcpInvoke(name, args);
      await this.audit.append("tool.execute", { tool: name, via: "mcp", ok: result.ok });
      return result;
    }
    const tool = this.tools.get(name);
    if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
    const result = await tool.execute(args, ctx);
    if (result.cost) {
      const agent = (await this.db.select().from(agents).where(eq(agents.id, ctx.agentId)))[0];
      const deptId = agent?.department ?? "support";
      await this.db.insert(spendLedger).values({
        id: newId("spd"),
        tenantId: ctx.tenantId,
        department: deptId,
        contractId: ctx.contractId,
        taskId: ctx.taskId,
        tool: name,
        amount: result.cost.amount,
        currency: result.cost.currency,
        createdAt: now(),
      });
      const dept = (await this.db.select().from(departments).where(eq(departments.id, deptId)))[0];
      if (dept) {
        await this.db
          .update(departments)
          .set({ capitalSpent: dept.capitalSpent + result.cost.amount })
          .where(eq(departments.id, deptId));
      }
    }
    await this.audit.append("tool.execute", { tool: name, via: "local", ok: result.ok });
    return result;
  }
}
