const values = {
  stage: ["ops", "support", "finance"],
  record: ["ticket", "ledger", "probe"],
  capture: ["A", "B"],
  observed: ["no", "yes"],
  route: ["none", "payments", "incident"],
  decision: ["none", "hold", "reject", "approve"],
  votes: ["one", "two"],
  sponsor: ["none", "manual", "checklist", "pilot"],
  trial: ["repeat", "clear", "stop"],
  node: ["6", "1", "2", "3", "4", "5"],
} as const;

export type Selection = { [K in keyof typeof values]: (typeof values)[K][number] } & {
  volume: string;
  minutes: string;
  rate: string;
  cost: string;
};
export const initial: Selection = {
  stage: "ops",
  record: "ticket",
  capture: "A",
  observed: "no",
  route: "none",
  decision: "none",
  votes: "one",
  sponsor: "none",
  trial: "repeat",
  node: "6",
  volume: "180",
  minutes: "4",
  rate: "60",
  cost: "900",
};
export type CaseProps = { selection: Selection; change: (patch: Partial<Selection>) => void };

export function parseSelection(hash: string): Selection {
  const query = new URLSearchParams(hash.split("?")[1] ?? "");
  const result = { ...initial };
  for (const key of Object.keys(values) as (keyof typeof values)[]) {
    const value = query.get(key);
    if (value && (values[key] as readonly string[]).includes(value))
      Object.assign(result, { [key]: value });
  }
  for (const key of ["volume", "minutes", "rate", "cost"] as const) {
    const value = query.get(key);
    if (value !== null && value.length <= 24 && (value === "" || Number.isFinite(Number(value))))
      result[key] = value;
  }
  if (result.record === "probe") result.observed = "yes";
  if (result.decision !== "approve") result.votes = "one";
  return result;
}
export function workspaceLink(view: "case" | "guide", selection: Selection) {
  const query = new URLSearchParams();
  for (const key of Object.keys(initial) as (keyof Selection)[])
    if (selection[key] !== initial[key]) query.set(key, selection[key]);
  return "#" + view + (query.size ? "?" + query.toString() : "");
}
export function restartState(s: Selection) {
  if (s.decision === "reject") return "Rejected · no restart";
  if (s.decision === "approve")
    return s.votes === "two" ? "Two voters · gateway recheck needed" : "One voter · quorum pending";
  return s.decision === "hold" ? "Held in exception queue" : "Awaiting operator decision";
}
export const trials = {
  repeat: {
    label: "Repeat voter",
    voters: 1,
    stop: false,
    executed: false,
    outcome: "Pending quorum",
  },
  clear: {
    label: "Distinct voters",
    voters: 2,
    stop: false,
    executed: true,
    outcome: "Simulated restart executed",
  },
  stop: {
    label: "Stop before vote two",
    voters: 2,
    stop: true,
    executed: false,
    outcome: "Gateway denied execution",
  },
} as const;
