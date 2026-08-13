import {
  createCompany,
  departments,
  agents,
  evaluateThreeLayer,
  listSpans,
  resetSpans,
} from "@corpos/core";
import { buildApp } from "@corpos/api";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";

const company = await createCompany({ dbPath: ":memory:" });
resetSpans();
const report = [];

function cell(id, ok, detail = "") {
  report.push({ id, ok, detail });
  if (!ok) throw new Error(`${id} failed: ${detail}`);
}

const DANGEROUS_TOOL_RE = /\b(shell|eval|exec|spawn|child_process|bash|powershell|os\.system)\b/i;

// ASI02 / gateway bypass
const bypass = await company.gateway.invoke(
  "evil.shell",
  {},
  {
    agentId: "agent_support",
    taskId: "t",
    contractId: "c",
    tenantId: "default",
    originatingAuthority: "alice@corpos.local",
  },
);
cell(
  "ASI02",
  bypass.decision.effect === "deny" && Boolean(bypass.decision.decisionId),
  "unknown tool",
);

// ASI05 — live tool registry scan (not AIBOM self-attestation alone)
const registered = company.gateway.list();
const dangerousLive = registered.filter(
  (t) => DANGEROUS_TOOL_RE.test(t.name) || DANGEROUS_TOOL_RE.test(t.description ?? ""),
);
cell(
  "ASI05",
  registered.length > 0 && dangerousLive.length === 0,
  dangerousLive.length
    ? `dangerous tools: ${dangerousLive.map((t) => t.name).join(",")}`
    : "no shell/eval tools in live registry",
);

// ASI03 three-layer privilege expansion
const l3 = evaluateThreeLayer({
  agentId: "agent_finance",
  agentActive: true,
  tool: company.gateway.get("billing.issue_refund"),
  toolName: "billing.issue_refund",
  agentToolAllowlist: ["billing.issue_refund"],
  delegation: {
    originatingAuthority: "alice@corpos.local",
    depth: 1,
    originatorToolAllowlist: ["crm.lookup"],
  },
});
cell("ASI03", !l3.allowed && l3.layer === "L3", l3.reason);

// ASI08 depth cap
const depth = evaluateThreeLayer({
  agentId: "agent_ops",
  agentActive: true,
  tool: company.gateway.get("ops.restart_service"),
  toolName: "ops.restart_service",
  delegation: {
    originatingAuthority: "alice@corpos.local",
    depth: 9,
    originatorToolAllowlist: ["*"],
  },
});
cell("ASI08", !depth.allowed && depth.layer === "L2", depth.reason);

// Capital
await company.db.update(agents).set({ maxAutonomousRisk: 3 }).where(eq(agents.id, "agent_finance"));
await company.db
  .update(departments)
  .set({ capitalSpent: 1999, capitalBudget: 2000 })
  .where(eq(departments.id, "finance"));
const cap = await company.gateway.invoke(
  "billing.issue_refund",
  { subscription: "x", amount: 50, customer: "x" },
  {
    agentId: "agent_finance",
    taskId: "t",
    contractId: "c",
    tenantId: "default",
    originatingAuthority: "bob@corpos.local",
  },
);
cell("ASI08-capital", cap.decision.effect === "deny", "capital exceeded");

// ASI10 kill
await company.gateway.setKilled(true);
const killed = await company.gateway.invoke(
  "crm.lookup",
  { email: "a@b.c" },
  {
    agentId: "agent_support",
    taskId: "t",
    contractId: "c",
    tenantId: "default",
    originatingAuthority: "alice@corpos.local",
  },
);
cell("ASI10", killed.decision.effect === "deny", "kill switch");
await company.gateway.setKilled(false);

// ASI01/ASI06 untrusted knowledge flag
const kb = await company.gateway.invoke(
  "knowledge.search",
  { query: "refund" },
  {
    agentId: "agent_support",
    taskId: "t",
    contractId: "c",
    tenantId: "default",
    originatingAuthority: "alice@corpos.local",
  },
);
const untrusted = Boolean(kb.result?.data && kb.result.data.untrusted);
cell("ASI01", untrusted, "KB marked untrusted");
cell("ASI06", untrusted, "context poisoning boundary");

// ASI04 AIBOM
const aibomPath = path.resolve("docs/aibom.json");
const aibom = JSON.parse(fs.readFileSync(aibomPath, "utf8"));
cell("ASI04", Boolean(aibom.policyBundleHash) && Array.isArray(aibom.mcp_servers), "aibom");

// ASI07 handoff envelope via deny missing originator
const noOrigin = evaluateThreeLayer({
  agentId: "agent_support",
  agentActive: true,
  tool: company.gateway.get("agent.handoff"),
  toolName: "agent.handoff",
  delegation: { originatingAuthority: "", depth: 0 },
});
cell("ASI07", !noOrigin.allowed, "missing originator");

// ASI09 — exception path requires approval for L4 tools (comms)
const email = await company.gateway.invoke(
  "comms.send_email",
  { to: "x@y.z", body: "hi" },
  {
    agentId: "agent_support",
    taskId: "t",
    contractId: "c",
    tenantId: "default",
    originatingAuthority: "alice@corpos.local",
  },
);
cell("ASI09", email.decision.effect === "approve" && Boolean(email.decision.approvalId), "HITL");

// AUTH — requireAuth is closed by default; CORPOS_MODE=local must not ungated (FO-017)
const prevMode = process.env.CORPOS_MODE;
const prevToken = process.env.DASHBOARD_API_TOKEN;
const prevAllow = process.env.CORPOS_ALLOW_UNAUTHENTICATED;
delete process.env.CORPOS_ALLOW_UNAUTHENTICATED;
delete process.env.CORPOS_MODE;
process.env.DASHBOARD_API_TOKEN = "secret";
const app = buildApp(company, "simulation");
const defaultUnauth = await app.request("/api/kill", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ killed: true }),
});
process.env.CORPOS_MODE = "local";
const localUnauth = await app.request("/api/kill", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ killed: true }),
});
process.env.CORPOS_ALLOW_UNAUTHENTICATED = "true";
const optIn = await app.request("/api/kill", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ killed: false }),
});
delete process.env.CORPOS_ALLOW_UNAUTHENTICATED;
process.env.CORPOS_MODE = "shared";
process.env.DASHBOARD_API_TOKEN = "secret";
const unauth = await app.request("/api/kill", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ killed: true }),
});
const authed = await app.request("/api/kill", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    authorization: "Bearer secret",
  },
  body: JSON.stringify({ killed: false }),
});
if (prevMode === undefined) delete process.env.CORPOS_MODE;
else process.env.CORPOS_MODE = prevMode;
if (prevToken === undefined) delete process.env.DASHBOARD_API_TOKEN;
else process.env.DASHBOARD_API_TOKEN = prevToken;
if (prevAllow === undefined) delete process.env.CORPOS_ALLOW_UNAUTHENTICATED;
else process.env.CORPOS_ALLOW_UNAUTHENTICATED = prevAllow;
const authedBody = await authed.json();
const optInBody = await optIn.json();
cell(
  "AUTH",
  defaultUnauth.status === 401 &&
    localUnauth.status === 401 &&
    unauth.status === 401 &&
    authed.status === 200 &&
    authedBody.killed === false &&
    optIn.status === 200 &&
    optInBody.killed === false,
  `default=${defaultUnauth.status} local=${localUnauth.status} unauth=${unauth.status} authed=${authed.status} optin=${optIn.status}`,
);

// Audit forge
await company.audit.append("a", { n: 1 });
await company.audit.append("b", { n: 2 });
await company.audit.append("c", { n: 3 });
cell("AUDIT", (await company.audit.verify()).ok, "intact");
await company.audit.forgeMiddle();
cell("AUDIT-FORGE", !(await company.audit.verify()).ok, "forgery detected");

// Health honesty: key alone must not imply live without CORPOS_ALLOW_LIVE
process.env.OPENROUTER_API_KEY = "sk-test";
delete process.env.CORPOS_ALLOW_LIVE;
const { resolveProvider } = await import("@corpos/core");
const resolved = resolveProvider(process.env);
cell("HEALTH", resolved.mode === "simulation", "no live without allow");

// OTel — require recorded spans from prior gateway invokes
const spans = listSpans();
cell(
  "OTEL",
  spans.some((s) => s.operation === "execute_tool" || s.operation === "invoke_agent"),
  `spans=${spans.length}`,
);

company.close();
console.log("adversarial: ok");
console.log(JSON.stringify({ asi: report }, null, 2));
