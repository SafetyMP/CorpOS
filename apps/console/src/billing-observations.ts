export type Effect = "allow" | "draft" | "approve" | "deny";
export type Rule = "handoff" | "refund" | "restart";
export type Mandate = Record<Rule, Effect>;

export const effectLabels: Record<Effect, string> = {
  allow: "Allow",
  draft: "Stage draft",
  approve: "Human review",
  deny: "Deny",
};
export const recordedMandate: Mandate = { handoff: "allow", refund: "draft", restart: "approve" };
export const controls: { key: Rule; label: string; options: Effect[] }[] = [
  { key: "handoff", label: "Cross-team handoffs", options: ["allow", "approve", "deny"] },
  { key: "refund", label: "Refund requests", options: ["draft", "approve", "deny"] },
  { key: "restart", label: "Shared-service restarts", options: ["approve", "deny"] },
];

interface Request {
  team: string;
  action: string;
  tool: string;
  evidence: string;
  rule?: Rule;
}

// The six proposals, in script order, for one seeded company day.
export const requests: Request[] = [
  {
    team: "Support",
    action: "Identify account",
    tool: "crm.lookup",
    evidence:
      "The support agent looks up the subscription on the customer's account. This read leaves the ledger untouched.",
  },
  {
    team: "Support",
    action: "Read refund terms",
    tool: "knowledge.search",
    evidence:
      "Support searches the company knowledge base for the refund policy before handing off a spending obligation.",
  },
  {
    team: "Support",
    action: "Assign Finance",
    tool: "agent.handoff",
    rule: "handoff",
    evidence:
      "Support delegates settlement of a $49 refund to Finance. This transfers the obligation, without posting money.",
  },
  {
    team: "Finance",
    action: "Issue $49 credit",
    tool: "billing.issue_refund",
    rule: "refund",
    evidence:
      "Finance proposes $49 for the customer's subscription. The recorded policy stages a draft that the seeded day settles, with capital and authority checked again at execution.",
  },
  {
    team: "Finance",
    action: "Assign Operations",
    tool: "agent.handoff",
    rule: "handoff",
    evidence:
      "Finance delegates a service-health check to Operations. This is the second use of the same handoff permission on the contract.",
  },
  {
    team: "Operations",
    action: "Restart billing API",
    tool: "ops.restart_service",
    rule: "restart",
    evidence:
      "Operations proposes a change to the shared billing service. The default risk-4 exception needs two distinct approvers on an eligible roster of at least three.",
  },
];

export function replay(mandate: Mandate) {
  return requests.map((request) => ({
    ...request,
    recorded: request.rule ? recordedMandate[request.rule] : ("allow" as const),
    candidate: request.rule ? mandate[request.rule] : ("allow" as const),
  }));
}
