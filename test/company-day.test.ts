import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeMaxAutonomousRisk,
  counterfactualReplay,
  createCompany,
  runCompanyDay,
} from "@corpos/core";

describe("company day", () => {
  it("runs multi-handoff day with autonomy, exception, compensation, sla, trust", async () => {
    const { company, result } = await runCompanyDay({ dbPath: ":memory:" });
    expect(result.handoffs).toBeGreaterThanOrEqual(2);
    expect(result.autonomousSettles).toBeGreaterThanOrEqual(1);
    expect(result.exceptionSettles).toBeGreaterThanOrEqual(1);
    expect(result.compensated).toBeGreaterThanOrEqual(1);
    expect(result.slaExceptions).toBeGreaterThanOrEqual(1);
    expect(result.trustAfter).toBeGreaterThanOrEqual(2);
    expect(result.ok).toBe(true);
    expect(result.timeline.length).toBeGreaterThanOrEqual(6);
    expect(result.timeline[0]?.kind).toBe("intake");
    const kinds = result.timeline.map((e) => e.kind);
    expect(kinds.filter((k) => k === "handoff").length).toBeGreaterThanOrEqual(2);
    expect(kinds).toContain("autonomous_settle");
    expect(kinds).toContain("exception");
    expect(kinds).toContain("trust");
    const verify = await company.audit.verify();
    expect(verify.ok).toBe(true);
    company.close();
  });

  it("fail-closed unknown tool and kill switch", async () => {
    const company = await createCompany({ dbPath: ":memory:" });
    const denied = await company.gateway.invoke(
      "nope.tool",
      {},
      { agentId: "agent_support", taskId: "t", contractId: "c", tenantId: "default" },
    );
    expect(denied.decision.effect).toBe("deny");
    await company.gateway.setKilled(true);
    const killed = await company.gateway.invoke(
      "crm.lookup",
      { email: "a@b.c" },
      { agentId: "agent_support", taskId: "t", contractId: "c", tenantId: "default" },
    );
    expect(killed.decision.effect).toBe("deny");
    company.close();
  });

  it("trust mapping and counterfactual diffs", () => {
    expect(computeMaxAutonomousRisk({ accepts: 2, rejects: 0, violations: 0 })).toBe(2);
    expect(computeMaxAutonomousRisk({ accepts: 0, rejects: 3, violations: 0 })).toBe(0);
    const diffs = counterfactualReplay(
      [{ tool: "crm.lookup", decision: { effect: "allow", reason: "ok" } }],
      { rules: [{ tool: "*", effect: "deny", reason: "strict" }], maxAutonomousRisk: 0 },
    );
    expect(diffs.length).toBeGreaterThanOrEqual(1);
  });

  it("audit chain detects forgery", async () => {
    const company = await createCompany({ dbPath: ":memory:" });
    await company.audit.append("a", { n: 1 });
    await company.audit.append("b", { n: 2 });
    await company.audit.append("c", { n: 3 });
    expect((await company.audit.verify()).ok).toBe(true);
    await company.audit.forgeMiddle();
    expect((await company.audit.verify()).ok).toBe(false);
    company.close();
  });

  it("knowledge path via real MCP subprocess", async () => {
    const server = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../packages/mcp-knowledge/dist/server.js",
    );
    const { company, result } = await runCompanyDay({
      dbPath: ":memory:",
      withMcp: true,
      serverCommand: { command: process.execPath, args: [server] },
    });
    expect(result.handoffs).toBeGreaterThanOrEqual(2);
    company.close();
  });
});
