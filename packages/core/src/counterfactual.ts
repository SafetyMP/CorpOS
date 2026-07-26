import type { Effect, PolicyRule, RiskLevel } from "./types.js";
import { globMatch } from "./policy.js";

export interface TraceStep {
  tool?: string;
  decision?: { effect: Effect; reason: string };
}

export interface CounterfactualDiff {
  tool: string;
  did: Effect;
  would: Effect;
  reason: string;
}

export function counterfactualReplay(
  steps: TraceStep[],
  candidate: { rules: PolicyRule[]; maxAutonomousRisk: number; defaultDeny?: boolean },
): CounterfactualDiff[] {
  const diffs: CounterfactualDiff[] = [];
  for (const step of steps) {
    if (!step.tool || !step.decision) continue;
    const rule = candidate.rules.filter((r) => globMatch(r.tool, step.tool!))[0];
    let would: Effect = rule?.effect ?? "deny";
    if (!rule) {
      // Approximate ladder with risk unknown → treat as 3
      const risk = 3 as RiskLevel;
      if (risk <= candidate.maxAutonomousRisk) would = "draft";
      else would = "approve";
    }
    if (would !== step.decision.effect) {
      diffs.push({
        tool: step.tool,
        did: step.decision.effect,
        would,
        reason: rule?.reason ?? "candidate policy",
      });
    }
  }
  return diffs;
}
