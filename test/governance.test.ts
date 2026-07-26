import { describe, expect, it } from "vitest";
import {
  computeMaxAutonomousRisk,
  contracts,
  createCompany,
  evaluateThreeLayer,
  listSpans,
  resetSpans,
  resolveProvider,
  runCompanyDay,
} from "@corpos/core";

describe("governance", () => {
  it("three-layer denies privilege expansion and depth overflow", () => {
    const denyL3 = evaluateThreeLayer({
      agentId: "agent_finance",
      agentActive: true,
      tool: {
        name: "billing.issue_refund",
        description: "",
        parameters: {},
        permission: { category: "spend", riskLevel: 3 },
        execute: async () => ({ ok: true }),
      },
      toolName: "billing.issue_refund",
      delegation: {
        originatingAuthority: "alice@corpos.local",
        depth: 1,
        originatorToolAllowlist: ["crm.lookup"],
      },
    });
    expect(denyL3.allowed).toBe(false);
    expect(denyL3.layer).toBe("L3");

    const denyDepth = evaluateThreeLayer({
      agentId: "a",
      agentActive: true,
      tool: {
        name: "crm.lookup",
        description: "",
        parameters: {},
        permission: { category: "read", riskLevel: 0 },
        execute: async () => ({ ok: true }),
      },
      toolName: "crm.lookup",
      delegation: { originatingAuthority: "alice@corpos.local", depth: 99 },
    });
    expect(denyDepth.allowed).toBe(false);
    expect(denyDepth.layer).toBe("L2");
  });

  it("trust ladder reaches risk 3 after four clean accepts", () => {
    expect(computeMaxAutonomousRisk({ accepts: 4, rejects: 0, violations: 0 })).toBe(3);
  });

  it("provider mode stays simulation without CORPOS_ALLOW_LIVE", () => {
    const r = resolveProvider({
      OPENROUTER_API_KEY: "sk-x",
      CORPOS_ALLOW_LIVE: undefined,
      CORPOS_PROVIDER: undefined,
    } as NodeJS.ProcessEnv);
    expect(r.mode).toBe("simulation");
  });

  it("company day on shared store mutates firm panels see", async () => {
    resetSpans();
    const company = await createCompany({ dbPath: ":memory:" });
    const { result } = await runCompanyDay({ company, autoApproveException: true });
    expect(result.ok).toBe(true);
    expect(result.handoffs).toBeGreaterThanOrEqual(2);
    const rows = await company.db.select().from(contracts);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(
      listSpans().some((s) => s.operation === "execute_tool" || s.operation === "invoke_agent"),
    ).toBe(true);
    company.close();
  });

  it("gateway decisions carry decisionId", async () => {
    const company = await createCompany({ dbPath: ":memory:" });
    const denied = await company.gateway.invoke(
      "nope.tool",
      {},
      {
        agentId: "agent_support",
        taskId: "t",
        contractId: "c",
        tenantId: "default",
        originatingAuthority: "alice@corpos.local",
      },
    );
    expect(denied.decision.decisionId).toBeTruthy();
    company.close();
  });
});
