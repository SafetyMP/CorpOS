import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import {
  agents,
  appealException,
  contracts,
  controlState,
  counterfactualReplay,
  createCompany,
  decideException,
  deliberationEntries,
  departments,
  exceptions,
  expireExceptionTtl,
  listSpans,
  resolveProvider,
  runCompanyDay,
  subscribeFirmEvents,
  recentFirmEvents,
  transparencyRecords,
  traces,
  type Company,
  type EnforcementMode,
} from "@corpos/core";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Dashboard bearer gate — exported for adversarial behavioral probes. */
export function requireAuth(c: { req: { header: (n: string) => string | undefined } }): boolean {
  // Ungated simulation only with an explicit opt-in (FO-017). CORPOS_MODE !== "shared" must not imply allow.
  if (process.env.CORPOS_ALLOW_UNAUTHENTICATED === "true") return true;
  const expected = process.env.DASHBOARD_API_TOKEN?.trim();
  if (!expected) return false;
  const header = c.req.header("authorization") ?? "";
  return header === `Bearer ${expected}`;
}

function loadAibom(): unknown {
  const candidates = [
    path.resolve(process.cwd(), "docs/aibom.json"),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../docs/aibom.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  }
  return { error: "aibom missing" };
}

export function buildApp(company: Company, mode: "simulation" | "live" = "simulation"): Hono {
  const app = new Hono();
  app.use("*", cors());

  const envMode = process.env.CORPOS_ENFORCEMENT;
  if (envMode === "strict" || envMode === "audit") {
    company.policy.setEnforcementMode(envMode);
  }

  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      mode,
      product: "autonomous-company-reference",
      provider: mode === "live" ? "HttpLLMProvider" : "SimulationProvider",
      enforcement: company.policy.getEnforcementMode(),
    }),
  );

  app.get("/api/firm", async (c) => {
    const depts = await company.db.select().from(departments);
    const ag = await company.db.select().from(agents);
    const ctrl = (
      await company.db.select().from(controlState).where(eq(controlState.id, "global"))
    )[0];
    return c.json({
      departments: depts,
      agents: ag,
      killed: Boolean(ctrl?.killed),
      auditHead: await company.audit.head(),
    });
  });

  app.get("/api/contracts", async (c) => c.json(await company.db.select().from(contracts)));
  app.get("/api/exceptions", async (c) =>
    c.json((await company.db.select().from(exceptions)).filter((e) => e.state === "pending")),
  );

  app.get("/api/exceptions/:id/deliberation", async (c) => {
    const rows = await company.db
      .select()
      .from(deliberationEntries)
      .where(eq(deliberationEntries.exceptionId, c.req.param("id")));
    return c.json(rows);
  });

  app.post("/api/exceptions/:id/decide", async (c) => {
    if (!requireAuth(c)) return c.json({ error: "dashboard authentication required" }, 401);
    await expireExceptionTtl(company);
    const body = await c.req.json<{
      decision: "approved" | "rejected";
      by?: string;
      dissentReason?: string;
    }>();
    const out = await decideException(
      company,
      c.req.param("id"),
      body.decision,
      body.by ?? "operator",
      body.dissentReason,
    );
    return c.json({ ok: true, ...out });
  });

  app.post("/api/exceptions/:id/appeal", async (c) => {
    if (!requireAuth(c)) return c.json({ error: "dashboard authentication required" }, 401);
    const body = await c.req.json<{ by?: string; reason?: string }>();
    const out = await appealException(
      company,
      c.req.param("id"),
      body.by ?? "operator",
      body.reason ?? "appeal",
    );
    if (!out.ok) return c.json(out, 400);
    return c.json(out);
  });

  app.post("/api/kill", async (c) => {
    if (!requireAuth(c)) return c.json({ error: "dashboard authentication required" }, 401);
    const body = await c.req.json<{ killed: boolean }>();
    await company.gateway.setKilled(Boolean(body.killed));
    return c.json({ ok: true, killed: body.killed });
  });

  app.post("/api/company-day", async (c) => {
    await expireExceptionTtl(company);
    let autoApproveException = false;
    try {
      const body = await c.req.json<{ autoApproveException?: boolean }>();
      if (body.autoApproveException === true) autoApproveException = true;
    } catch {
      /* empty body */
    }
    const { result } = await runCompanyDay({ company, autoApproveException });
    return c.json(result);
  });

  app.get("/api/governance", async (c) => {
    const aibom = loadAibom();
    const spans = listSpans().slice(-50);
    const recentDenies = (await company.audit.verify()).ok;
    const ctrl = (
      await company.db.select().from(controlState).where(eq(controlState.id, "global"))
    )[0];
    const transparency = (await company.db.select().from(transparencyRecords)).slice(-50);
    return c.json({
      aibom,
      spans,
      auditOk: recentDenies,
      killed: Boolean(ctrl?.killed),
      enforcement: company.policy.getEnforcementMode(),
      transparency,
      gLabels: {
        G1: "membership/active",
        G2: "deliberation trail",
        G3: "quorum N-of-M",
        G4: "dissent on reject",
        G5: "decision transparency",
        G6: "appeal/escalation",
      },
      asiControls: {
        ASI01: "untrusted KB/CRM boundary",
        ASI02: "fail-closed gateway + draft/settle",
        ASI03: "three-layer authz",
        ASI04: "AIBOM + policy bundle hash",
        ASI05: "no shell/eval tools registered",
        ASI06: "untrusted memory/context flags",
        ASI07: "handoff envelopes with depth/origin",
        ASI08: "capital/kill/depth caps",
        ASI09: "L3+ exception HITL",
        ASI10: "kill switch + trust demotion",
      },
      nistRmf: {
        GOVERN: "policy PDP/PEP + enforcement modes",
        MAP: "AIBOM inventory",
        MEASURE: "OTel GenAI spans + trust ledger",
        MANAGE: "exceptions, kill, compensators",
      },
      note: "Crosswalk is pedagogical; not a certification claim.",
    });
  });

  app.post("/api/governance/enforcement", async (c) => {
    if (!requireAuth(c)) return c.json({ error: "dashboard authentication required" }, 401);
    const body = await c.req.json<{ mode: EnforcementMode }>();
    if (body.mode !== "strict" && body.mode !== "audit") {
      return c.json({ error: "mode must be strict|audit" }, 400);
    }
    company.policy.setEnforcementMode(body.mode);
    return c.json({ ok: true, mode: body.mode });
  });

  app.get("/api/traces/:taskId", async (c) => {
    const row = (await company.db.select().from(traces)).find(
      (t) => t.taskId === c.req.param("taskId"),
    );
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json({ ...row, steps: JSON.parse(row.stepsJson) });
  });

  app.post("/api/traces/:taskId/counterfactual", async (c) => {
    const row = (await company.db.select().from(traces)).find(
      (t) => t.taskId === c.req.param("taskId"),
    );
    if (!row) return c.json({ error: "not found" }, 404);
    const body = await c.req.json<{
      rules?: { tool: string; effect?: "allow" | "deny" | "draft" | "approve"; reason?: string }[];
      maxAutonomousRisk?: number;
    }>();
    const steps = JSON.parse(row.stepsJson);
    const diffs = counterfactualReplay(steps, {
      rules: body.rules ?? [{ tool: "*", effect: "deny", reason: "stricter pack" }],
      maxAutonomousRisk: body.maxAutonomousRisk ?? 0,
    });
    return c.json({ diffs });
  });

  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      await stream.writeSSE({
        data: JSON.stringify({
          type: "snapshot",
          recent: recentFirmEvents(),
          firm: {
            agents: await company.db.select().from(agents),
            exceptions: (await company.db.select().from(exceptions)).filter(
              (e) => e.state === "pending",
            ),
          },
        }),
      });
      const unsub = subscribeFirmEvents((event) => {
        void stream.writeSSE({ data: JSON.stringify(event) });
      });
      // Keep stream open; client disconnect ends the handler when write fails.
      try {
        while (true) {
          await stream.writeSSE({ data: JSON.stringify({ type: "heartbeat", at: Date.now() }) });
          await stream.sleep(15_000);
        }
      } finally {
        unsub();
      }
    }),
  );

  return app;
}

export async function createDefaultCompany(): Promise<{
  company: Company;
  mode: "simulation" | "live";
}> {
  const { mode } = resolveProvider();
  const company = await createCompany({ dbPath: process.env.CORPOS_DB });
  await expireExceptionTtl(company);
  return { company, mode };
}

export function startTtlScheduler(company: Company, intervalMs = 30_000): NodeJS.Timeout {
  return setInterval(() => {
    void expireExceptionTtl(company);
  }, intervalMs);
}
