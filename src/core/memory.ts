import type { Logger, MemoryItem, MemoryKind } from "./types";
import { now } from "./types";
import { newId } from "./id";
import type { Store } from "./store";

/**
 * Two-tier memory:
 *  - working: ephemeral per-run scratch (cleared between runs) for the
 *    reasoning loop's transient notes.
 *  - long-term: durable facts/notes/decisions in the SQLite store, recalled
 *    by keyword + tags for future runs.
 */
export class MemoryStore {
  private store: Store;
  private log: Logger;
  private working = new Map<string, MemoryItem[]>();

  constructor(store: Store, log: Logger) {
    this.store = store;
    this.log = log;
  }

  remember(
    item: Omit<MemoryItem, "id" | "ts"> & Partial<Pick<MemoryItem, "id" | "ts">>,
  ): MemoryItem {
    const full: MemoryItem = {
      id: item.id ?? newId("mem"),
      ts: item.ts ?? now(),
      ...item,
    };
    this.store.remember(full);
    this.log.debug("memory.remember", { kind: full.kind, agentId: full.agentId });
    return full;
  }

  recall(
    tenantId: string,
    agentId: string,
    opts: { query?: string; limit?: number; tags?: string[] } = {},
  ): MemoryItem[] {
    return this.store.recall(tenantId, agentId, opts);
  }

  /** Working memory for the current run only. */
  pushWorking(agentId: string, content: string, kind: MemoryKind = "note"): void {
    const list = this.working.get(agentId) ?? [];
    list.push({
      id: newId("wm"),
      tenantId: "working",
      agentId,
      kind,
      content,
      tags: [],
      ts: now(),
    });
    this.working.set(agentId, list);
  }

  getWorking(agentId: string): MemoryItem[] {
    return this.working.get(agentId) ?? [];
  }

  clearWorking(agentId: string): void {
    this.working.delete(agentId);
  }
}
