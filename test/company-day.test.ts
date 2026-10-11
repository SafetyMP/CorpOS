import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "@corpos/api";
import {
  computeMaxAutonomousRisk,
  counterfactualReplay,
  createCompany,
  exceptions,
  runCompanyDay,
} from "@corpos/core";

describe("company day", () => {
  it("runs multi-handoff day with autonomy, exception, sla, trust", async () => {
    const { company, result } = await runCompanyDay({
      dbPath: ":memory:",
      autoApproveException: true,
    });
    expect(result.handoffs).toBeGreaterThanOrEqual(2);
    expect(result.autonomousSettles).toBeGreaterThanOrEqual(1);
    expect(result.exceptionSettles).toBeGreaterThanOrEqual(1);
    expect(result.compensated).toBe(0);
    expect(company.seed.refunds).toEqual([
      expect.objectContaining({ amount: 49, customer: "ada@example.com" }),
    ]);
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

  it("is ok when the refund stays and the restart is pending", async () => {
    const { company, result } = await runCompanyDay({ dbPath: ":memory:" });
    expect(result.exceptionSettles).toBe(0);
    expect(result.compensated).toBe(0);
    expect(result.timeline.some((e) => e.summary.includes("Human approved"))).toBe(false);
    expect(result.timeline.some((e) => e.summary.includes("Demo auto-approved"))).toBe(false);
    expect(company.seed.refunds).toEqual([
      expect.objectContaining({ amount: 49, customer: "ada@example.com" }),
    ]);
    const restarts = (await company.db.select().from(exceptions)).filter(
      (row) => row.contractId === result.contractId && row.tool === "ops.restart_service",
    );
    expect(restarts).toHaveLength(1);
    expect(restarts[0]?.state).toBe("pending");
    expect(result.ok).toBe(true);
    company.close();
  });

  it("leaves a successful refund in place", async () => {
    const { company, result } = await runCompanyDay({ dbPath: ":memory:" });
    expect(result.autonomousSettles).toBeGreaterThanOrEqual(1);
    expect(result.compensated).toBe(0);
    expect(result.timeline.some((e) => e.kind === "compensate")).toBe(false);
    expect(company.seed.refunds).toEqual([
      expect.objectContaining({ id: "ref_1", amount: 49, customer: "ada@example.com" }),
    ]);
    const reversed = await company.gateway.compensate(result.contractId);
    expect(reversed).toBe(1);
    expect(company.seed.refunds).toEqual([]);
    company.close();
  });

  it("does not let an unauthenticated company-day call auto-approve", async () => {
    const previous = {
      token: process.env.DASHBOARD_API_TOKEN,
      allow: process.env.CORPOS_ALLOW_UNAUTHENTICATED,
    };
    delete process.env.DASHBOARD_API_TOKEN;
    delete process.env.CORPOS_ALLOW_UNAUTHENTICATED;
    try {
      const company = await createCompany({ dbPath: ":memory:" });
      const app = buildApp(company, "simulation");
      const res = await app.request("/api/company-day", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ autoApproveException: true }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        exceptionSettles: number;
        compensated: number;
        timeline: Array<{ summary: string }>;
      };
      expect(body.exceptionSettles).toBe(0);
      expect(body.compensated).toBe(0);
      expect(body.timeline.some((e) => e.summary.includes("Demo auto-approved"))).toBe(false);
      const restarts = (await company.db.select().from(exceptions)).filter(
        (row) => row.tool === "ops.restart_service",
      );
      expect(restarts.length).toBe(1);
      expect(restarts[0]?.state).toBe("pending");
      expect(company.seed.refunds).toEqual([
        expect.objectContaining({ amount: 49, customer: "ada@example.com" }),
      ]);
      company.close();
    } finally {
      if (previous.token === undefined) delete process.env.DASHBOARD_API_TOKEN;
      else process.env.DASHBOARD_API_TOKEN = previous.token;
      if (previous.allow === undefined) delete process.env.CORPOS_ALLOW_UNAUTHENTICATED;
      else process.env.CORPOS_ALLOW_UNAUTHENTICATED = previous.allow;
    }
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
    expect(computeMaxAutonomousRisk({ accepts: 4, rejects: 0, violations: 0 })).toBe(3);
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
