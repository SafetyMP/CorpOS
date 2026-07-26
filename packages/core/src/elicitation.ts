import type { Company } from "./company.js";
import { decideException } from "./company.js";
import { exceptions } from "./schema.js";
import { eq } from "drizzle-orm";

/**
 * MCP elicitation-aligned privileged flow: L3+ tools that need human input
 * are resolved via the durable exception queue (same decide path as console HITL).
 */
export async function elicitViaException(
  company: Company,
  exceptionId: string,
  opts?: {
    /** Test/CI only */
    autoDecide?: "approved" | "rejected";
    by?: string;
    timeoutMs?: number;
  },
): Promise<{ ok: boolean; decision?: "approved" | "rejected"; error?: string }> {
  const ex = (await company.db.select().from(exceptions).where(eq(exceptions.id, exceptionId)))[0];
  if (!ex) return { ok: false, error: "exception not found" };

  if (opts?.autoDecide) {
    await decideException(
      company,
      exceptionId,
      opts.autoDecide,
      opts.by ?? "elicitation",
      opts.autoDecide === "rejected" ? "elicitation reject" : undefined,
    );
    return { ok: true, decision: opts.autoDecide };
  }

  const timeout = opts?.timeoutMs ?? 30_000;
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const row = (
      await company.db.select().from(exceptions).where(eq(exceptions.id, exceptionId))
    )[0];
    if (row && row.state !== "pending") {
      return {
        ok: true,
        decision: row.state === "approved" ? "approved" : "rejected",
      };
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  return { ok: false, error: "elicitation timeout" };
}
