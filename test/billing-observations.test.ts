import { describe, expect, it } from "vitest";
import { runCompanyDay } from "../packages/core/src/company-day";
import { counterfactualReplay } from "../packages/core/src/counterfactual";
import { exceptions, traces } from "../packages/core/src/schema";
import {
  controls,
  recordedMandate,
  replay,
  type Effect,
} from "../apps/console/src/billing-observations";

describe("delegation desk", () => {
  it("matches the recorded proposals from the seeded company day", async () => {
    const { company, result } = await runCompanyDay();
    try {
      const rows = await company.db.select().from(traces);
      const observed = rows.flatMap((r) =>
        (JSON.parse(r.stepsJson) as { tool?: string; decision?: { effect: Effect } }[])
          .filter((s) => s.tool && s.decision)
          .map((s) => [s.tool, s.decision?.effect]),
      );
      // The blocked Ops task has a pending exception and has not emitted its final task trace.
      const queue = await company.db.select().from(exceptions);
      for (const item of queue.filter(
        (item) => item.state === "pending" && item.contractId === result.contractId,
      )) {
        observed.push([item.tool, "approve"]);
      }
      expect(observed).toEqual(replay(recordedMandate).map((r) => [r.tool, r.recorded]));
    } finally {
      company.close();
    }
  });

  it("gives the same changes as the core exact-tool replay for every exposed mandate", () => {
    for (const handoff of controls[0].options)
      for (const refund of controls[1].options)
        for (const restart of controls[2].options) {
          const rows = replay({ handoff, refund, restart });
          const diffs = counterfactualReplay(
            rows.map((r) => ({
              tool: r.tool,
              decision: { effect: r.recorded, reason: "recorded" },
            })),
            {
              rules: rows.map((r) => ({ tool: r.tool, effect: r.candidate })),
              maxAutonomousRisk: 0,
            },
          );
          expect(diffs.map((r) => [r.tool, r.did, r.would])).toEqual(
            rows
              .filter((r) => r.recorded !== r.candidate)
              .map((r) => [r.tool, r.recorded, r.candidate]),
          );
        }
  });
});
