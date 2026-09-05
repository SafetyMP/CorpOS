import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "@corpos/api";
import { createCompany, exceptions } from "@corpos/core";
import { eq } from "drizzle-orm";

const AUTH = {
  "content-type": "application/json",
  authorization: "Bearer secret",
};

const ENV_KEYS = [
  "DASHBOARD_API_TOKEN",
  "DASHBOARD_OPERATOR_ID",
  "DASHBOARD_TENANT_ID",
  "CORPOS_ALLOW_UNAUTHENTICATED",
  "CORPOS_MODE",
] as const;

const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

function stashEnv(): void {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
  }
}

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function openException(
  company: Awaited<ReturnType<typeof createCompany>>,
  tenantId: string,
): Promise<string> {
  const invoked = await company.gateway.invoke(
    "comms.send_email",
    { to: "x@y.z", body: "hi" },
    {
      agentId: "agent_support",
      taskId: "t",
      contractId: "c",
      tenantId,
      originatingAuthority: "alice@corpos.local",
    },
  );
  const id = invoked.decision.approvalId;
  if (!id) throw new Error("expected HITL exception");
  return id;
}

describe("dashboard identity binding", () => {
  afterEach(() => {
    restoreEnv();
  });

  it("derives decidedBy from the token-bound operator, not the request body", async () => {
    stashEnv();
    delete process.env.CORPOS_ALLOW_UNAUTHENTICATED;
    process.env.DASHBOARD_API_TOKEN = "secret";
    process.env.DASHBOARD_OPERATOR_ID = "governor@corpos.local";
    process.env.DASHBOARD_TENANT_ID = "default";

    const company = await createCompany({ dbPath: ":memory:" });
    const app = buildApp(company, "simulation");
    const exId = await openException(company, "default");

    const res = await app.request(`/api/exceptions/${exId}/decide`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        decision: "rejected",
        by: "attacker@evil.example",
        tenantId: "other-tenant",
        dissentReason: "nope",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { decidedBy?: string; tenantId?: string };
    expect(body.decidedBy).toBe("governor@corpos.local");
    expect(body.tenantId).toBe("default");

    const row = (await company.db.select().from(exceptions).where(eq(exceptions.id, exId)))[0];
    expect(row?.decidedBy).toBe("governor@corpos.local");
    expect(row?.state).toBe("rejected");
    company.close();
  });

  it("rejects cross-tenant decide and appeal", async () => {
    stashEnv();
    delete process.env.CORPOS_ALLOW_UNAUTHENTICATED;
    process.env.DASHBOARD_API_TOKEN = "secret";
    process.env.DASHBOARD_OPERATOR_ID = "operator@dashboard";
    process.env.DASHBOARD_TENANT_ID = "default";

    const company = await createCompany({ dbPath: ":memory:" });
    const app = buildApp(company, "simulation");
    const foreignId = await openException(company, "other-tenant");

    const decide = await app.request(`/api/exceptions/${foreignId}/decide`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ decision: "approved", by: "default-operator" }),
    });
    expect(decide.status).toBe(403);
    const decideBody = (await decide.json()) as { error?: string };
    expect(decideBody.error).toBe("cross-tenant approval denied");

    const foreign = (
      await company.db.select().from(exceptions).where(eq(exceptions.id, foreignId))
    )[0];
    expect(foreign?.state).toBe("pending");

    await company.db
      .update(exceptions)
      .set({ state: "rejected", decidedBy: "ttl", dissentReason: "TTL expired" })
      .where(eq(exceptions.id, foreignId));

    const appeal = await app.request(`/api/exceptions/${foreignId}/appeal`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ by: "default-operator", reason: "please" }),
    });
    expect(appeal.status).toBe(403);

    const missing = await app.request("/api/exceptions/ex_missing/decide", {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ decision: "approved" }),
    });
    expect(missing.status).toBe(404);
    company.close();
  });

  it("still requires bearer when identity env is set", async () => {
    stashEnv();
    delete process.env.CORPOS_ALLOW_UNAUTHENTICATED;
    process.env.DASHBOARD_API_TOKEN = "secret";
    process.env.DASHBOARD_OPERATOR_ID = "governor@corpos.local";

    const company = await createCompany({ dbPath: ":memory:" });
    const app = buildApp(company, "simulation");
    const exId = await openException(company, "default");
    const res = await app.request(`/api/exceptions/${exId}/decide`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "approved" }),
    });
    expect(res.status).toBe(401);
    company.close();
  });
});
