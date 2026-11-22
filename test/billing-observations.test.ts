import { describe, expect, it } from "vitest";
import { runCompanyDay } from "../packages/core/src/company-day";
import { decideException } from "../packages/core/src/company";
import { auditChain, exceptions, traces } from "../packages/core/src/schema";
import {
  requests,
  investigationReceipt,
  serviceCaptures,
} from "../apps/console/src/billing-observations";
import { parseSelection, workspaceLink, trials, initial } from "../apps/console/src/case-selection";

describe("the selected billing handoff", () => {
  it("derives each inspector lane from the seeded company day", async () => {
    const { company, result } = await runCompanyDay({ dbPath: ":memory:" });
    try {
      const logs = await company.db.select().from(traces);
      const rows = logs
        .filter((r) => r.contractId === result.contractId)
        .flatMap((r) =>
          (JSON.parse(r.stepsJson) as { tool?: string }[]).flatMap((s) => (s.tool ? [s.tool] : [])),
        );
      const pending = (await company.db.select().from(exceptions)).filter(
        (r) => r.contractId === result.contractId && r.state === "pending",
      );
      expect([...rows, ...pending.map((r) => r.tool)]).toEqual(requests.map((r) => r.tool));
    } finally {
      company.close();
    }
  });
  it.each(Object.entries(trials))(
    "reproduces trial %s in an independent firm",
    async (key, trial) => {
      const { company, result } = await runCompanyDay({ dbPath: ":memory:" });
      try {
        const pending = (await company.db.select().from(exceptions)).find(
          (r) => r.contractId === result.contractId && r.tool === "ops.restart_service",
        );
        if (!pending) throw new Error("Missing billing restart");
        expect(company.policy.getQuorumConfig(pending.riskLevel)).toEqual({
          n: 2,
          m: 3,
          role: "approver",
        });
        const first = await decideException(company, pending.id, "approved", "alice@corpos.local");
        expect(first).toMatchObject({ quorumPending: true, votes: 1 });
        if (trial.stop) await company.gateway.setKilled(true);
        const receipt = await decideException(
          company,
          pending.id,
          "approved",
          key === "repeat" ? "alice@corpos.local" : "bob@corpos.local",
        );
        const record = (await company.db.select().from(exceptions)).find(
          (r) => r.id === pending.id,
        );
        expect(JSON.parse(record?.votesJson ?? "[]")).toHaveLength(trial.voters);
        expect(receipt.executed === true).toBe(trial.executed);
        if (key === "repeat") expect(receipt).toMatchObject({ quorumPending: true });
        else expect(receipt).toMatchObject({ resumed: true });
        expect(company.seed.refunds.filter((entry) => entry.amount === 49)).toHaveLength(1);
        // These are the receipts the technical guide tells the next shift to look for.
        const log = await company.db.select().from(auditChain).orderBy(auditChain.seq);
        const relevant = log.flatMap((entry) => {
          const payload = JSON.parse(entry.payloadJson);
          if (payload.tool !== pending.tool && payload.exceptionId !== pending.id) return [];
          return [{ type: entry.eventType, phase: payload.phase, effect: payload.effect }];
        });
        const approval = relevant.findIndex((row) => row.type === "exception.approved");
        const enforcement = relevant.findIndex(
          (row) => row.type === "gateway.decision" && row.phase === "enforce",
        );
        const execution = relevant.findIndex((row) => row.type === "tool.execute");
        if (key === "repeat") {
          expect(relevant.some((row) => row.type === "exception.quorum_vote")).toBe(true);
          expect([approval, enforcement, execution]).toEqual([-1, -1, -1]);
        } else {
          expect(approval).toBeGreaterThanOrEqual(0);
          expect(enforcement).toBeGreaterThan(approval);
          if (trial.stop) {
            expect(relevant[enforcement].effect).toBe("deny");
            expect(execution).toBe(-1);
          } else expect(execution).toBeGreaterThan(enforcement);
        }
        expect((await company.audit.verify()).ok).toBe(true);
      } finally {
        company.close();
      }
    },
  );
  it("restores linked evidence and discards incompatible votes", () => {
    const selected = {
      ...initial,
      record: "probe",
      capture: "B",
      observed: "yes",
      route: "incident",
      decision: "approve",
      votes: "two",
      sponsor: "pilot",
      minutes: "12",
      trial: "stop",
      node: "4",
    } as const;
    expect(parseSelection(workspaceLink("guide", selected))).toEqual(selected);
    expect(parseSelection("#case?record=fake&decision=reject&votes=two&node=99")).toEqual({
      ...initial,
      decision: "reject",
    });
  });
  it("keeps service readings distinct from the ledger and unread evidence", () => {
    expect(serviceCaptures).toEqual({ A: [1, 2, 1], B: [1, 9, 18] });
    expect(investigationReceipt(null, "A")).toBeNull();
    expect(investigationReceipt("incident", null)?.assessment).toContain("unknown");
    expect(investigationReceipt("payments", "A")?.assessment).toContain("usual");
    expect(investigationReceipt("payments", "B")?.assessment).toContain(
      "without an incident owner",
    );
  });
});
