import { eq } from "drizzle-orm";
import type { Db } from "./db.js";
import type { AuditLog } from "./audit.js";
import type { PolicyEngine } from "./policy.js";
import type { Tool, ToolContext, ToolResult, PolicyDecision } from "./types.js";
import type { ToolMap } from "./tools.js";
import { compensators, controlState, departments, drafts, spendLedger, agents } from "./schema.js";
import { newId } from "./id.js";
import { now } from "./types.js";

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
    const decision = await this.policy.evaluate(tool, args, {
      tenantId: ctx.tenantId,
      agentId: ctx.agentId,
      taskId: ctx.taskId,
      contractId: ctx.contractId,
    });
    await this.audit.append("gateway.decision", {
      tool: name,
      effect: decision.effect,
      reason: decision.reason,
    });

    if (decision.effect === "deny") {
      const agent = (await this.db.select().from(agents).where(eq(agents.id, ctx.agentId)))[0];
      if (agent) {
        await this.db
          .update(agents)
          .set({ violations: agent.violations + 1 })
          .where(eq(agents.id, agent.id));
      }
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

  async settleDraft(draftId: string, ctx: ToolContext): Promise<ToolResult> {
    const draft = (await this.db.select().from(drafts).where(eq(drafts.id, draftId)))[0];
    if (!draft || draft.state !== "staged") return { ok: false, error: "draft not found" };
    const args = JSON.parse(draft.argsJson) as Record<string, unknown>;
    const result = await this.execute(draft.tool, args, ctx);
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
      const tool = this.tools.get(c.kind);
      if (!tool) continue;
      await tool.execute(
        {
          ...payload.args,
          refundId: (payload.result.data as { refundId?: string } | undefined)?.refundId,
          amount: payload.args.amount,
        },
        {
          agentId: "system",
          taskId: "compensate",
          contractId,
          tenantId: "default",
        },
      );
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
