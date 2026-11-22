import { describe, expect, it } from "vitest";
import { investigationReceipt, serviceCaptures } from "../apps/console/src/billing-observations";

describe("billing on-call observations", () => {
  it("leaves the decision open before the visitor chooses a route", () => {
    expect(investigationReceipt(null, "A")).toBeNull();
    expect(investigationReceipt(null, "B")).toBeNull();
  });

  it("does not disclose unread service counts in a modeled assignment", () => {
    expect(investigationReceipt("payments", null)?.assessment).toContain("unknown");
    expect(investigationReceipt("incident", null)?.assessment).not.toMatch(/eighteen|usual range/i);
  });

  it("keeps the assigned owner but changes the consequence for the same action", () => {
    expect(serviceCaptures.A).toEqual([1, 2, 1]);
    expect(serviceCaptures.B).toEqual([1, 9, 18]);
    const first = investigationReceipt("payments", "A");
    const second = investigationReceipt("payments", "B");
    expect(first?.owner).toEqual(second?.owner);
    expect(first?.assessment).toContain("usual");
    expect(second?.assessment).toContain("without an incident owner");
    expect(investigationReceipt("incident", "B")?.assessment).toContain("now owns the increase");
  });
});
