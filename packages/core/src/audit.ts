import { createHash } from "node:crypto";
import { asc, desc, eq } from "drizzle-orm";
import type { Db } from "./db.js";
import { auditChain } from "./schema.js";
import { newId } from "./id.js";
import { now } from "./types.js";

function canonical(value: unknown): string {
  return JSON.stringify(value);
}

export function hashEntry(prevHash: string, payload: unknown): string {
  return createHash("sha256")
    .update(prevHash)
    .update("\0")
    .update(canonical(payload))
    .digest("hex");
}

export class AuditLog {
  constructor(private db: Db) {}

  async append(eventType: string, payload: unknown): Promise<{ seq: number; entryHash: string }> {
    const last = (
      await this.db.select().from(auditChain).orderBy(desc(auditChain.seq)).limit(1)
    )[0];
    const prevHash = last?.entryHash ?? "genesis";
    const seq = (last?.seq ?? 0) + 1;
    const ts = now();
    const body = { eventType, payload, seq, ts };
    const entryHash = hashEntry(prevHash, body);
    await this.db.insert(auditChain).values({
      id: newId("aud"),
      seq,
      prevHash,
      entryHash,
      eventType,
      payloadJson: JSON.stringify(payload),
      createdAt: ts,
    });
    return { seq, entryHash };
  }

  async head(): Promise<string> {
    const last = (
      await this.db.select().from(auditChain).orderBy(desc(auditChain.seq)).limit(1)
    )[0];
    return last?.entryHash ?? "genesis";
  }

  async verify(): Promise<{ ok: boolean; error?: string }> {
    const rows = await this.db.select().from(auditChain).orderBy(asc(auditChain.seq));
    let prev = "genesis";
    for (const row of rows) {
      if (row.prevHash !== prev) return { ok: false, error: `prevHash break at seq ${row.seq}` };
      const recomputed = hashEntry(prev, {
        eventType: row.eventType,
        payload: JSON.parse(row.payloadJson),
        seq: row.seq,
        ts: row.createdAt,
      });
      if (recomputed !== row.entryHash) {
        return { ok: false, error: `entryHash mismatch at seq ${row.seq}` };
      }
      prev = row.entryHash;
    }
    return { ok: true };
  }

  async forgeMiddle(): Promise<void> {
    const rows = await this.db.select().from(auditChain).orderBy(asc(auditChain.seq));
    if (rows.length < 2) return;
    const mid = rows[Math.floor(rows.length / 2)]!;
    await this.db
      .update(auditChain)
      .set({ payloadJson: JSON.stringify({ forged: true }) })
      .where(eq(auditChain.id, mid.id));
  }
}
