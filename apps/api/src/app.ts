import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import {
  agents,
  contracts,
  controlState,
  counterfactualReplay,
  createCompany,
  decideException,
  departments,
  exceptions,
  runCompanyDay,
  traces,
  type Company,
} from "@corpos/core";
import { eq } from "drizzle-orm";

function requireAuth(c: { req: { header: (n: string) => string | undefined } }): boolean {
  if (process.env.CORPOS_MODE !== "shared") return true;
  const expected = process.env.DASHBOARD_API_TOKEN?.trim();
  if (!expected) return false;
  const header = c.req.header("authorization") ?? "";
  return header === `Bearer ${expected}`;
}

export function buildApp(company: Company): Hono {
  const app = new Hono();
  app.use("*", cors());

  app.get("/api/health", (c) =>
    c.json({
      ok: true,
      mode: process.env.OPENROUTER_API_KEY ? "live" : "simulation",
      product: "autonomous-company-reference",
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

  app.post("/api/exceptions/:id/decide", async (c) => {
    if (!requireAuth(c)) return c.json({ error: "dashboard authentication required" }, 401);
    const body = await c.req.json<{ decision: "approved" | "rejected"; by?: string }>();
    await decideException(company, c.req.param("id"), body.decision, body.by ?? "operator");
    return c.json({ ok: true });
  });

  app.post("/api/kill", async (c) => {
    if (!requireAuth(c)) return c.json({ error: "dashboard authentication required" }, 401);
    const body = await c.req.json<{ killed: boolean }>();
    await company.gateway.setKilled(Boolean(body.killed));
    return c.json({ ok: true, killed: body.killed });
  });

  app.post("/api/company-day", async (c) => {
    const { result, company: ephemeral } = await runCompanyDay({ dbPath: ":memory:" });
    ephemeral.close();
    return c.json(result);
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
          firm: {
            agents: await company.db.select().from(agents),
            exceptions: (await company.db.select().from(exceptions)).filter(
              (e) => e.state === "pending",
            ),
          },
        }),
      });
    }),
  );

  return app;
}

export async function createDefaultCompany(): Promise<Company> {
  return createCompany({ dbPath: process.env.CORPOS_DB });
}
