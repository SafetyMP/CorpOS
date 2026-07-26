import type { Db } from "./db.js";
import type { Effect, PolicyDecision, PolicyRule, RiskLevel, Tool } from "./types.js";
import { agents, controlState, departments, exceptions } from "./schema.js";
import { eq } from "drizzle-orm";
import { newId } from "./id.js";
import { now } from "./types.js";
import type { AuditLog } from "./audit.js";

export function globMatch(pattern: string, name: string): boolean {
  if (pattern === name || pattern === "*") return true;
  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -2);
    return name === prefix || name.startsWith(`${prefix}.`);
  }
  return false;
}

function ladderEffect(risk: RiskLevel, maxAuto: number, requiresApproval?: boolean): Effect {
  if (requiresApproval || risk >= 4) return "approve";
  if (risk >= 3) return risk <= maxAuto ? "draft" : "approve";
  if (risk === 2) return risk <= maxAuto ? "draft" : "approve";
  if (risk <= maxAuto) return "allow";
  return "approve";
}

export class PolicyEngine {
  private rules: PolicyRule[] = [];

  constructor(
    private db: Db,
    private audit: AuditLog,
    private defaultEffect: Effect = "deny",
  ) {}

  setRules(rules: PolicyRule[]): void {
    this.rules = rules.map((r) => ({ priority: 0, ...r }));
    this.rules.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  async evaluate(
    tool: Tool | undefined,
    args: Record<string, unknown>,
    ctx: { tenantId: string; agentId: string; taskId: string; contractId: string },
  ): Promise<PolicyDecision> {
    const ctrl = (
      await this.db.select().from(controlState).where(eq(controlState.id, "global"))
    )[0];
    if (ctrl?.killed) {
      return { effect: "deny", reason: "kill switch engaged" };
    }
    if (!tool) {
      await this.audit.append("policy.deny", { tool: "unknown", reason: "unknown tool" });
      return { effect: "deny", reason: "unknown tool (fail-closed)" };
    }

    const agent = (await this.db.select().from(agents).where(eq(agents.id, ctx.agentId)))[0];
    const maxAuto = agent?.maxAutonomousRisk ?? 0;

    const matched = this.rules.filter((r) => globMatch(r.tool, tool.name))[0];
    if (matched?.effect === "deny") {
      return { effect: "deny", reason: matched.reason ?? `Rule denies ${tool.name}` };
    }

    if (tool.permission.category === "spend") {
      const dept = (
        await this.db
          .select()
          .from(departments)
          .where(eq(departments.id, agent?.department ?? ""))
      )[0];
      const amount = typeof args.amount === "number" ? args.amount : 0;
      if (dept && dept.capitalSpent + amount > dept.capitalBudget) {
        return {
          effect: "deny",
          reason: `department capital exceeded (${dept.capitalSpent + amount} > ${dept.capitalBudget})`,
        };
      }
    }

    const effect =
      matched?.effect ??
      ladderEffect(tool.permission.riskLevel, maxAuto, tool.permission.requiresApproval);

    if (effect === "approve") {
      const approvalId = newId("ex");
      const ttl = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await this.db.insert(exceptions).values({
        id: approvalId,
        tenantId: ctx.tenantId,
        contractId: ctx.contractId,
        taskId: ctx.taskId,
        agentId: ctx.agentId,
        tool: tool.name,
        argsJson: JSON.stringify(args),
        reason: `${tool.name} requires exception approval`,
        riskLevel: tool.permission.riskLevel,
        state: "pending",
        ttlAt: ttl,
        createdAt: now(),
      });
      await this.audit.append("exception.requested", { approvalId, tool: tool.name });
      return {
        effect: "approve",
        reason: `${tool.name} requires exception approval`,
        approvalId,
      };
    }

    if (effect === "draft") {
      return { effect: "draft", reason: `${tool.name} stages as draft`, draftId: newId("draft") };
    }

    return { effect: effect === "allow" ? "allow" : this.defaultEffect, reason: "policy allow" };
  }

  async expireTtl(): Promise<number> {
    const pending = (await this.db.select().from(exceptions)).filter((e) => e.state === "pending");
    let n = 0;
    const t = now();
    for (const e of pending) {
      if (e.ttlAt < t) {
        await this.db
          .update(exceptions)
          .set({ state: "rejected", decidedAt: t, decidedBy: "ttl" })
          .where(eq(exceptions.id, e.id));
        n++;
      }
    }
    return n;
  }
}
