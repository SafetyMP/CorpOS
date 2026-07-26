import { describe, expect, it } from "vitest";
import {
  appealException,
  createCompany,
  decideException,
  deliberationEntries,
  elicitViaException,
  expireExceptionTtl,
  Orchestrator,
  SimulationProvider,
  tc,
  transparencyRecords,
} from "@corpos/core";
import { eq } from "drizzle-orm";
import { exceptions, tasks } from "@corpos/core";

describe("r3 firm governance", () => {
  it("quorum policy test: L4+ requires N-of-M approvers (R-FIRM-005)", async () => {
    const company = await createCompany({ dbPath: ":memory:" });
    company.policy.setQuorumForRisk(4, { n: 2, m: 3, role: "approver" });
    const provider = new SimulationProvider({
      "Ops Agent": [[tc("ops.restart_service", { service: "billing-api" })]],
    });
    company.orchestrator = new Orchestrator(company, { provider, awaitHitl: false });
    await company.db.insert(tasks).values({
      id: "task_q",
      contractId: "c_q",
      tenantId: "default",
      title: "restart",
      description: "restart",
      state: "queued",
      assignedTo: "agent_ops",
      attempts: 0,
      createdAt: new Date().toISOString(),
    });
    const out = await company.orchestrator.enqueueAndRun("task_q");
    expect(out.awaitingExceptionId).toBeTruthy();
    const exId = out.awaitingExceptionId!;
    const first = await decideException(company, exId, "approved", "alice@corpos.local");
    expect(first.quorumPending).toBe(true);
    const still = (await company.db.select().from(exceptions).where(eq(exceptions.id, exId)))[0];
    expect(still?.state).toBe("pending");
    const second = await decideException(company, exId, "approved", "bob@corpos.local");
    expect(second.quorumPending).toBeFalsy();
    expect(second.executed || second.resumed).toBeTruthy();
    const done = (await company.db.select().from(exceptions).where(eq(exceptions.id, exId)))[0];
    expect(done?.state).toBe("approved");
    company.close();
  });

  it("deliberation trail on exception open/decide (G2)", async () => {
    const company = await createCompany({ dbPath: ":memory:" });
    const provider = new SimulationProvider({
      "Ops Agent": [[tc("ops.restart_service", { service: "x" })]],
    });
    company.orchestrator = new Orchestrator(company, { provider, awaitHitl: false });
    await company.db.insert(tasks).values({
      id: "task_d",
      contractId: "c_d",
      tenantId: "default",
      title: "d",
      description: "d",
      state: "queued",
      assignedTo: "agent_ops",
      attempts: 0,
      createdAt: new Date().toISOString(),
    });
    const out = await company.orchestrator.enqueueAndRun("task_d");
    const rows = await company.db
      .select()
      .from(deliberationEntries)
      .where(eq(deliberationEntries.exceptionId, out.awaitingExceptionId!));
    expect(rows.some((r) => r.kind === "opened")).toBe(true);
    await decideException(company, out.awaitingExceptionId!, "rejected", "op", "nope");
    const after = await company.db
      .select()
      .from(deliberationEntries)
      .where(eq(deliberationEntries.exceptionId, out.awaitingExceptionId!));
    expect(after.some((r) => r.kind === "vote_reject")).toBe(true);
    company.close();
  });

  it("transparency records on decide (G5)", async () => {
    const company = await createCompany({ dbPath: ":memory:" });
    const provider = new SimulationProvider({
      "Ops Agent": [[tc("ops.restart_service", { service: "x" })]],
    });
    company.orchestrator = new Orchestrator(company, { provider, awaitHitl: false });
    await company.db.insert(tasks).values({
      id: "task_t",
      contractId: "c_t",
      tenantId: "default",
      title: "t",
      description: "t",
      state: "queued",
      assignedTo: "agent_ops",
      attempts: 0,
      createdAt: new Date().toISOString(),
    });
    const out = await company.orchestrator.enqueueAndRun("task_t");
    await decideException(company, out.awaitingExceptionId!, "approved", "carol@corpos.local");
    const tr = await company.db.select().from(transparencyRecords);
    expect(tr.length).toBeGreaterThanOrEqual(1);
    expect(tr[0]?.decisionId).toBeTruthy();
    company.close();
  });

  it("appeal rejected exception once (G6)", async () => {
    const company = await createCompany({ dbPath: ":memory:" });
    const provider = new SimulationProvider({
      "Ops Agent": [[tc("ops.restart_service", { service: "x" })]],
    });
    company.orchestrator = new Orchestrator(company, { provider, awaitHitl: false });
    await company.db.insert(tasks).values({
      id: "task_a",
      contractId: "c_a",
      tenantId: "default",
      title: "a",
      description: "a",
      state: "queued",
      assignedTo: "agent_ops",
      attempts: 0,
      createdAt: new Date().toISOString(),
    });
    const out = await company.orchestrator.enqueueAndRun("task_a");
    const exId = out.awaitingExceptionId!;
    await decideException(company, exId, "rejected", "op", "no");
    const ok = await appealException(company, exId, "owner@corpos.local", "escalate");
    expect(ok.ok).toBe(true);
    const again = await appealException(company, exId, "owner@corpos.local", "again");
    expect(again.ok).toBe(false);
    company.close();
  });

  it("TTL expireTtl fail-closes pending exceptions", async () => {
    const company = await createCompany({ dbPath: ":memory:" });
    await company.db.insert(exceptions).values({
      id: "ex_ttl",
      tenantId: "default",
      contractId: "c",
      taskId: "t",
      agentId: "agent_ops",
      tool: "ops.restart_service",
      argsJson: "{}",
      reason: "ttl test",
      riskLevel: 4,
      state: "pending",
      ttlAt: new Date(Date.now() - 1000).toISOString(),
      createdAt: new Date().toISOString(),
      votesJson: "[]",
      appealUsed: 0,
    });
    const n = await expireExceptionTtl(company);
    expect(n).toBe(1);
    const row = (await company.db.select().from(exceptions).where(eq(exceptions.id, "ex_ttl")))[0];
    expect(row?.state).toBe("rejected");
    expect(row?.decidedBy).toBe("ttl");
    company.close();
  });

  it("enforcement audit mode logs would-deny without silent fail-open", async () => {
    const company = await createCompany({ dbPath: ":memory:" });
    company.policy.setEnforcementMode("audit");
    const denied = await company.gateway.invoke(
      "nope.tool",
      {},
      { agentId: "agent_support", taskId: "t", contractId: "c", tenantId: "default" },
    );
    // unknown tool still fail-closed at tool lookup before authz allow path
    expect(denied.decision.effect).toBe("deny");
    company.policy.setEnforcementMode("strict");
    company.close();
  });

  it("orchestrator waitForResume on HITL (R-WORK-005)", async () => {
    const company = await createCompany({ dbPath: ":memory:" });
    const provider = new SimulationProvider({
      "Ops Agent": [[tc("ops.restart_service", { service: "x" })]],
    });
    company.orchestrator = new Orchestrator(company, { provider, awaitHitl: true });
    await company.db.insert(tasks).values({
      id: "task_h",
      contractId: "c_h",
      tenantId: "default",
      title: "h",
      description: "h",
      state: "queued",
      assignedTo: "agent_ops",
      attempts: 0,
      createdAt: new Date().toISOString(),
    });
    const run = company.orchestrator.enqueueAndRun("task_h");
    for (let i = 0; i < 100; i++) {
      const pending = (await company.db.select().from(exceptions)).find(
        (e) => e.state === "pending",
      );
      if (pending) {
        await decideException(company, pending.id, "approved", "carol@corpos.local");
        break;
      }
      await new Promise((r) => setTimeout(r, 5));
    }
    const result = await run;
    expect(result.ok).toBe(true);
    company.close();
  });

  it("MCP elicitation resolves via exception decide", async () => {
    const company = await createCompany({ dbPath: ":memory:" });
    const provider = new SimulationProvider({
      "Ops Agent": [[tc("ops.restart_service", { service: "x" })]],
    });
    company.orchestrator = new Orchestrator(company, { provider, awaitHitl: false });
    await company.db.insert(tasks).values({
      id: "task_e",
      contractId: "c_e",
      tenantId: "default",
      title: "e",
      description: "e",
      state: "queued",
      assignedTo: "agent_ops",
      attempts: 0,
      createdAt: new Date().toISOString(),
    });
    const out = await company.orchestrator.enqueueAndRun("task_e");
    const elicited = await elicitViaException(company, out.awaitingExceptionId!, {
      autoDecide: "approved",
      by: "elicit",
    });
    expect(elicited.ok).toBe(true);
    expect(elicited.decision).toBe("approved");
    company.close();
  });
});
