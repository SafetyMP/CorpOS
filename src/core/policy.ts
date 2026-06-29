import type { Approval, Effect, Logger, PolicyDecision, PolicyRule, Tool } from "./types";
export type { PolicyRule } from "./types";
import { newId } from "./id";
import { EventBus } from "./event-bus";
import type { Store } from "./store";

export interface PolicyOptions {
  defaultEffect?: Effect;
}

/**
 * The policy engine is the single chokepoint every consequential action
 * passes through. It evaluates a tool call against:
 *   1. explicit rules (glob-matched on tool name, highest priority wins)
 *   2. the tool's own permission (category / requiresApproval / costCap)
 *   3. spend caps checked against the spend ledger
 * and returns allow / deny / approve.
 */
export class PolicyEngine {
  private rules: PolicyRule[] = [];
  private store: Store;
  private bus: EventBus;
  private log: Logger;
  private defaultEffect: Effect;

  constructor(store: Store, bus: EventBus, log: Logger, opts: PolicyOptions = {}) {
    this.store = store;
    this.bus = bus;
    this.log = log;
    this.defaultEffect = opts.defaultEffect ?? "allow";
  }

  addRule(rule: PolicyRule): void {
    this.rules.push({ priority: 0, ...rule });
    this.rules.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  setRules(rules: PolicyRule[]): void {
    this.rules = rules.map((r) => ({ priority: 0, ...r }));
    this.rules.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  listRules(): PolicyRule[] {
    return [...this.rules];
  }

  evaluate(
    tool: Tool,
    args: Record<string, unknown>,
    ctx: { tenantId: string; agentId: string; taskId: string },
  ): PolicyDecision {
    const matched = this.matchingRules(tool.name);
    const explicit = matched[0];

    // 1. Explicit rule (highest priority) can force allow/deny/approve.
    if (explicit && explicit.effect !== undefined) {
      if (explicit.effect === "deny") {
        return { effect: "deny", reason: explicit.reason ?? `Rule denies ${tool.name}` };
      }
    }

    // 2. Deny destructive system tools unless explicitly allowed.
    if (tool.permission.category === "system" && tool.permission.requiresApproval) {
      return this.requireApproval(tool, args, ctx, "system tool requires approval");
    }

    // 3. Spend gating.
    if (tool.permission.category === "spend" || explicit?.spendCapPerRun !== undefined) {
      const cap = explicit?.spendCapPerRun ?? tool.permission.costCap ?? Infinity;
      if (cap !== Infinity) {
        const spent = this.store.spendForTask(ctx.tenantId, ctx.taskId);
        const intended = extractCost(args) ?? 0;
        if (spent + intended > cap) {
          return {
            effect: "deny",
            reason: `spend cap ${cap} exceeded (spent ${spent}, intending ${intended})`,
          };
        }
      }
    }

    // 4. Tools that require approval.
    if (tool.permission.requiresApproval) {
      return this.requireApproval(tool, args, ctx, `${tool.name} requires human approval`);
    }

    // 5. Explicit approve rule.
    if (explicit?.effect === "approve") {
      return this.requireApproval(
        tool,
        args,
        ctx,
        explicit.reason ?? `${tool.name} requires approval`,
      );
    }

    return { effect: this.defaultEffect, reason: "permitted by default policy" };
  }

  private matchingRules(toolName: string): PolicyRule[] {
    return this.rules.filter((r) => globMatch(r.tool, toolName));
  }

  private requireApproval(
    tool: Tool,
    args: Record<string, unknown>,
    ctx: { tenantId: string; agentId: string; taskId: string },
    reason: string,
  ): PolicyDecision {
    const approval: Approval = {
      id: newId("appr"),
      tenantId: ctx.tenantId,
      agentId: ctx.agentId,
      taskId: ctx.taskId,
      tool: tool.name,
      args,
      reason,
      state: "pending",
      cost:
        tool.permission.costCap !== undefined
          ? { amount: extractCost(args) ?? 0, currency: "USD" }
          : undefined,
      createdAt: new Date().toISOString(),
    };
    this.store.insertApproval(approval);
    void this.bus.emit("approval.requested", approval, {
      source: "policy",
      tenantId: ctx.tenantId,
      taskId: ctx.taskId,
      agentId: ctx.agentId,
    });
    this.log.audit("approval.requested", { approvalId: approval.id, tool: tool.name });
    return { effect: "approve", reason, approvalId: approval.id };
  }

  /** Resolve a pending approval. Returns the resulting state. */
  decide(
    approvalId: string,
    decision: "approved" | "rejected",
    decidedBy: string,
  ): Approval | undefined {
    const approval = this.store.getApproval(approvalId);
    if (!approval || approval.state !== "pending") return approval;
    this.store.setApprovalState(approvalId, decision, decidedBy);
    void this.bus.emit(
      `approval.${decision}`,
      { approvalId, tool: approval.tool },
      {
        source: "human",
        tenantId: approval.tenantId,
        taskId: approval.taskId,
        agentId: approval.agentId,
      },
    );
    this.log.audit(`approval.${decision}`, { approvalId, decidedBy });
    return { ...approval, state: decision, decidedAt: new Date().toISOString(), decidedBy };
  }
}

function extractCost(args: Record<string, unknown>): number | undefined {
  const v = args["amount"] ?? args["cost"];
  if (typeof v === "number") return v;
  return undefined;
}

export function globMatch(pattern: string, name: string): boolean {
  if (pattern === name) return true;
  if (pattern === "*") return true;
  // Support "billing.*" style single-segment prefix globs.
  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -2);
    return name === prefix || name.startsWith(`${prefix}.`);
  }
  return false;
}
