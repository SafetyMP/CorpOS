import { createCompany, departments, agents } from "@corpos/core";
import { eq } from "drizzle-orm";

const company = await createCompany({ dbPath: ":memory:" });

const bypass = await company.gateway.invoke(
  "evil.shell",
  {},
  { agentId: "agent_support", taskId: "t", contractId: "c", tenantId: "default" },
);
if (bypass.decision.effect !== "deny") throw new Error("bypass cell failed");

await company.db.update(agents).set({ maxAutonomousRisk: 3 }).where(eq(agents.id, "agent_finance"));
await company.db
  .update(departments)
  .set({ capitalSpent: 1999, capitalBudget: 2000 })
  .where(eq(departments.id, "finance"));
const cap = await company.gateway.invoke(
  "billing.issue_refund",
  { subscription: "x", amount: 50, customer: "x" },
  { agentId: "agent_finance", taskId: "t", contractId: "c", tenantId: "default" },
);
if (cap.decision.effect !== "deny") throw new Error("capital cell failed");

process.env.CORPOS_MODE = "shared";
process.env.DASHBOARD_API_TOKEN = "secret";
if (`Bearer ${process.env.DASHBOARD_API_TOKEN}` !== "Bearer secret") {
  throw new Error("auth cell failed");
}

await company.audit.append("a", { n: 1 });
await company.audit.append("b", { n: 2 });
await company.audit.append("c", { n: 3 });
if (!(await company.audit.verify()).ok) throw new Error("audit should pass");
await company.audit.forgeMiddle();
if ((await company.audit.verify()).ok) throw new Error("forge cell failed");

company.close();
console.log("adversarial: ok");
