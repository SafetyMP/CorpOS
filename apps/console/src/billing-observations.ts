// Authored evidence for the browser exercise. The company-day API emits its own records.
export const serviceCaptures = {
  A: [1, 2, 1],
  B: [1, 9, 18],
} as const;
export type Capture = keyof typeof serviceCaptures;
export type Investigation = "payments" | "incident";

const routing = {
  payments: {
    owner: "Payments operations",
    assignment: "Trace the processor reference and report the posting status to Ada.",
    A: "The last three service samples stay within the usual one to two failures per 100 requests. The payment trace can investigate Ada’s missing credit while on-call watches the next sample.",
    B: "The payment trace addresses Ada’s credit. Eighteen of the latest 100 requests failed for other accounts, and this route leaves that increase without an incident owner.",
  },
  incident: {
    owner: "Billing incident lead",
    assignment:
      "Open a service investigation and assign the on-call engineer to examine failed requests.",
    A: "The incident lead receives a page while all three service samples stay within their usual range. Ada’s posting status still needs someone to trace the processor reference.",
    B: "The incident lead now owns the increase affecting other accounts. Check the failed requests and dependencies before proposing a mitigation. Ada’s credit still needs a separate posting trace.",
  },
};

export function investigationReceipt(
  choice: Investigation | null,
  observedCapture: Capture | null,
) {
  if (!choice) return null;
  const route = routing[choice];
  return {
    owner: route.owner,
    assignment: route.assignment,
    assessment: observedCapture
      ? route[observedCapture]
      : "The service sample has not been inspected. The chosen team owns the investigation, and the extent of customer impact is still unknown.",
  };
}
