import { describe, it, expect, beforeEach } from "vitest";
import {
  Store,
  EventBus,
  PolicyEngine,
  defineTool,
  globMatch,
  now,
} from "../src/core/index";
import { silentLogger } from "./helpers";

const tenant = "tenant_a";
const agentId = "agent_x";
const taskId = "task_1";
const ctx = { tenantId: tenant, agentId, taskId };

describe("PolicyEngine", () => {
  let store: Store;
  let bus: EventBus;
  let policy: PolicyEngine;

  beforeEach(() => {
    store = new Store({ inMemory: true });
    bus = new EventBus();
    policy = new PolicyEngine(store, bus, silentLogger, { defaultEffect: "allow" });
  });

  describe("globMatch", () => {
    it("matches exact names", () => {
      expect(globMatch("billing.charge", "billing.charge")).toBe(true);
      expect(globMatch("billing.charge", "billing.refund")).toBe(false);
    });

    it("matches single-segment prefix globs", () => {
      expect(globMatch("billing.*", "billing.charge")).toBe(true);
      expect(globMatch("billing.*", "billing")).toBe(true);
      expect(globMatch("billing.*", "crm.update")).toBe(false);
    });

    it("matches the bare wildcard", () => {
      expect(globMatch("*", "anything.at.all")).toBe(true);
    });
  });

  describe("rule effects", () => {
    it("allows via a billing.* glob rule", () => {
      const tool = defineTool({
        name: "billing.charge",
        description: "charge",
        parameters: { type: "object", properties: {} },
        permission: { category: "write", requiresApproval: false },
        execute: async () => ({ ok: true }),
      });
      policy.addRule({ id: "r1", tool: "billing.*", effect: "allow" });
      expect(policy.evaluate(tool, {}, ctx).effect).toBe("allow");
    });

    it("denies via an exact rule with a reason", () => {
      const tool = defineTool({
        name: "crm.delete",
        description: "delete",
        parameters: { type: "object", properties: {} },
        permission: { category: "write", requiresApproval: false },
        execute: async () => ({ ok: true }),
      });
      policy.addRule({ id: "r2", tool: "crm.delete", effect: "deny", reason: "destructive" });
      const d = policy.evaluate(tool, {}, ctx);
      expect(d.effect).toBe("deny");
      expect(d.reason).toMatch(/destructive/);
    });

    it("forces approval via an explicit approve rule and creates a pending approval", () => {
      const tool = defineTool({
        name: "data.export",
        description: "export",
        parameters: { type: "object", properties: {} },
        permission: { category: "read", requiresApproval: false },
        execute: async () => ({ ok: true }),
      });
      policy.addRule({ id: "r3", tool: "data.export", effect: "approve", reason: "sensitive export" });
      const d = policy.evaluate(tool, {}, ctx);
      expect(d.effect).toBe("approve");
      expect(d.approvalId).toBeDefined();
      expect(store.pendingApprovals()).toHaveLength(1);
    });
  });

  describe("spend caps", () => {
    const spendTool = defineTool({
      name: "billing.charge",
      description: "charge",
      parameters: { type: "object", properties: { amount: { type: "number" } } },
      permission: { category: "spend", requiresApproval: false, costCap: 100 },
      execute: async () => ({ ok: true }),
    });

    it("denies when a prior spend pushes the run over the cap", () => {
      store.recordSpend({
        id: "s1", tenantId: tenant, agentId, taskId,
        tool: "billing.charge", amount: 60, currency: "USD", ref: "prior", ts: now(),
      });
      const denied = policy.evaluate(spendTool, { amount: 50 }, ctx);
      expect(denied.effect).toBe("deny");
      expect(denied.reason).toMatch(/spend cap/);
    });

    it("allows when the intended spend stays within the cap", () => {
      store.recordSpend({
        id: "s1", tenantId: tenant, agentId, taskId,
        tool: "billing.charge", amount: 60, currency: "USD", ref: "prior", ts: now(),
      });
      expect(policy.evaluate(spendTool, { amount: 30 }, ctx).effect).toBe("allow");
    });
  });

  describe("approval gating", () => {
    it("creates a pending approval for approval-gated tools and decide() flips it", () => {
      const tool = defineTool({
        name: "billing.refund",
        description: "refund",
        parameters: { type: "object", properties: { amount: { type: "number" } } },
        permission: { category: "spend" },
        execute: async () => ({ ok: true }),
      });

      const d = policy.evaluate(tool, { amount: 25 }, ctx);
      expect(d.effect).toBe("approve");
      expect(d.approvalId).toBeDefined();

      const pending = store.pendingApprovals();
      expect(pending).toHaveLength(1);
      expect(pending[0]?.tool).toBe("billing.refund");
      expect(pending[0]?.state).toBe("pending");

      const approvalId = pending[0]!.id;
      const decided = policy.decide(approvalId, "approved", "manager");
      expect(decided?.state).toBe("approved");
      expect(store.getApproval(approvalId)?.state).toBe("approved");
      expect(store.pendingApprovals()).toHaveLength(0);
    });
  });
});
