import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "@corpos/api";
import {
  agents,
  computeMaxAutonomousRisk,
  contracts,
  counterfactualReplay,
  createCompany,
  departments,
  exceptions,
  runCompanyDay,
  tasks,
} from "@corpos/core";
import { eq } from "drizzle-orm";

describe("company day", () => {
  const envKeys = ["DASHBOARD_API_TOKEN", "CORPOS_ALLOW_UNAUTHENTICATED"] as const;
  const saved: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};
  let envStashed = false;

  afterEach(() => {
    if (!envStashed) return;
    for (const key of envKeys) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    envStashed = false;
  });

  it("leaves the refund settled and queues the restart for a human", async () => {
    const { company, result } = await runCompanyDay({ dbPath: ":memory:" });
    expect(result.handoffs).toBeGreaterThanOrEqual(2);
    expect(result.autonomousSettles).toBeGreaterThanOrEqual(1);
    expect(result.awaitingExceptions).toBeGreaterThanOrEqual(1);
    expect(result.exceptionSettles).toBe(0);
    expect(result.compensated).toBe(0);
    expect(result.slaExceptions).toBeGreaterThanOrEqual(1);
    expect(result.ok).toBe(true);
    expect(
      company.seed.refunds.some((r) => r.amount === 49 && r.customer === "ada@example.com"),
    ).toBe(true);
    expect(result.timeline.length).toBeGreaterThanOrEqual(6);
    expect(result.timeline[0]?.kind).toBe("intake");
    const kinds = result.timeline.map((e) => e.kind);
    expect(kinds.filter((k) => k === "handoff").length).toBeGreaterThanOrEqual(2);
    expect(kinds).toContain("autonomous_settle");
    expect(kinds).toContain("exception");
    expect(kinds).toContain("trust");
    expect(kinds).not.toContain("compensate");
    const verify = await company.audit.verify();
    expect(verify.ok).toBe(true);
    company.close();
  });

  it("settles an explicitly auto-approved restart and does not reverse the refund", async () => {
    const { company, result } = await runCompanyDay({
      dbPath: ":memory:",
      autoApproveException: true,
    });
    expect(result.exceptionSettles).toBeGreaterThanOrEqual(1);
    expect(result.awaitingExceptions).toBe(0);
    expect(result.compensated).toBe(0);
    expect(result.ok).toBe(true);
    expect(company.seed.refunds.some((r) => r.amount === 49)).toBe(true);
    expect(result.timeline.some((e) => e.summary.includes("Demo auto-approved"))).toBe(true);
    company.close();
  });

  it("does not auto-approve exceptions by default", async () => {
    const { company, result } = await runCompanyDay({ dbPath: ":memory:" });
    expect(result.exceptionSettles).toBe(0);
    expect(result.compensated).toBe(0);
    expect(result.ok).toBe(true);
    expect(result.timeline.some((e) => e.summary.includes("Human approved"))).toBe(false);
    expect(result.timeline.some((e) => e.summary.includes("Demo auto-approved"))).toBe(false);
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

  it("re-checks policy before settle and compensate", async () => {
    const company = await createCompany({ dbPath: ":memory:" });
    const ctx = {
      agentId: "agent_finance",
      taskId: "t",
      contractId: "c_refund",
      tenantId: "default",
      originatingAuthority: "bob@corpos.local",
    };
    const drafted = await company.gateway.invoke(
      "billing.issue_refund",
      { subscription: "sub_ada_pro", amount: 49, customer: "ada@example.com" },
      ctx,
    );
    expect(drafted.decision.effect).toBe("draft");
    expect(drafted.draftId).toBeTruthy();

    await company.gateway.setKilled(true);
    const killedSettle = await company.gateway.settleDraft(drafted.draftId!, ctx);
    expect(killedSettle.ok).toBe(false);
    expect(company.seed.refunds).toHaveLength(0);

    await company.gateway.setKilled(false);
    await company.db
      .update(departments)
      .set({ capitalSpent: 1990 })
      .where(eq(departments.id, "finance"));
    const overCap = await company.gateway.settleDraft(drafted.draftId!, ctx);
    expect(overCap.ok).toBe(false);
    expect(company.seed.refunds).toHaveLength(0);

    await company.db
      .update(departments)
      .set({ capitalSpent: 0 })
      .where(eq(departments.id, "finance"));
    const settled = await company.gateway.settleDraft(drafted.draftId!, ctx);
    expect(settled.ok).toBe(true);
    expect(company.seed.refunds).toHaveLength(1);

    company.policy.setRules([
      { tool: "billing.reverse_refund", effect: "deny", reason: "no reverse" },
    ]);
    const denied = await company.gateway.compensate("c_refund");
    expect(denied).toBe(0);
    expect(company.seed.refunds).toHaveLength(1);

    company.policy.setRules([]);
    await company.gateway.setKilled(true);
    const killedCompensate = await company.gateway.compensate("c_refund");
    expect(killedCompensate).toBe(0);
    expect(company.seed.refunds).toHaveLength(1);
    company.close();
  });

  it("requires auth and ignores client autoApproveException", async () => {
    for (const key of envKeys) saved[key] = process.env[key];
    envStashed = true;
    delete process.env.CORPOS_ALLOW_UNAUTHENTICATED;
    process.env.DASHBOARD_API_TOKEN = "secret";

    const company = await createCompany({ dbPath: ":memory:" });
    const app = buildApp(company, "simulation");
    const unauth = await app.request("/api/company-day", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ autoApproveException: true }),
    });
    expect(unauth.status).toBe(401);
    expect(company.seed.refunds).toHaveLength(0);

    const authed = await app.request("/api/company-day", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret",
      },
      body: JSON.stringify({ autoApproveException: true }),
    });
    expect(authed.status).toBe(200);
    const body = (await authed.json()) as {
      ok: boolean;
      compensated: number;
      exceptionSettles: number;
      awaitingExceptions: number;
      autonomousSettles: number;
    };
    expect(body.exceptionSettles).toBe(0);
    expect(body.compensated).toBe(0);
    expect(body.awaitingExceptions).toBeGreaterThanOrEqual(1);
    expect(body.autonomousSettles).toBeGreaterThanOrEqual(1);
    expect(body.ok).toBe(true);
    expect(company.seed.refunds.some((r) => r.amount === 49)).toBe(true);
    company.close();
  });

  it("carries handoff depth into the next agent and the later L2 check", async () => {
    const { company, result } = await runCompanyDay({ dbPath: ":memory:" });
    const contract = (
      await company.db.select().from(contracts).where(eq(contracts.id, result.contractId))
    )[0];
    const obligations = JSON.parse(contract?.obligations || "[]") as Array<{ depth?: number }>;
    expect(obligations.map((obligation) => obligation.depth)).toEqual([1, 2]);

    const dayTasks = (await company.db.select().from(tasks)).filter(
      (task) => task.contractId === result.contractId,
    );
    expect(dayTasks.find((task) => task.assignedTo === "agent_finance")?.delegationDepth).toBe(1);
    expect(dayTasks.find((task) => task.assignedTo === "agent_ops")?.delegationDepth).toBe(2);

    const pendingRestart = (await company.db.select().from(exceptions)).find(
      (row) => row.state === "pending" && row.tool === "ops.restart_service",
    );
    const pause = JSON.parse(pendingRestart?.pauseJson || "{}") as { depth?: number };
    expect(pause.depth).toBe(2);

    const support = (
      await company.db.select().from(agents).where(eq(agents.id, "agent_support"))
    )[0];
    const denied = await company.gateway.invoke(
      "crm.lookup",
      { email: "ada@example.com" },
      {
        agentId: support?.id ?? "agent_support",
        taskId: "t_depth",
        contractId: result.contractId,
        tenantId: "default",
        delegationDepth: 4,
      },
    );
    expect(denied.decision.effect).toBe("deny");
    expect(denied.decision.authzLayer).toBe("L2");
    expect(denied.decision.reason).toMatch(/depth/i);
    expect(result.ok).toBe(true);
    company.close();
  });

  it("reverses a settled refund at the finance depth and denies past the L2 cap", async () => {
    const allowed = await runCompanyDay({ dbPath: ":memory:" });
    const reversed = await allowed.company.gateway.compensate(allowed.result.contractId);
    expect(reversed).toBe(1);
    expect(allowed.company.seed.refunds.some((r) => r.amount === 49)).toBe(false);

    const capped = await runCompanyDay({ dbPath: ":memory:" });
    const financeTask = (await capped.company.db.select().from(tasks)).find(
      (task) => task.contractId === capped.result.contractId && task.assignedTo === "agent_finance",
    );
    await capped.company.db
      .update(tasks)
      .set({ delegationDepth: 4 })
      .where(eq(tasks.id, financeTask!.id));
    const denied = await capped.company.gateway.compensate(capped.result.contractId);
    expect(denied).toBe(0);
    expect(capped.company.seed.refunds.some((r) => r.amount === 49)).toBe(true);

    allowed.company.close();
    capped.company.close();
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
