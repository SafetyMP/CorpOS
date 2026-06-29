import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Store, newTask, MemoryStore } from "../src/core/index";
import { silentLogger } from "./helpers";

describe("Store", () => {
  let store: Store;

  beforeEach(() => {
    store = new Store({ inMemory: true });
  });
  afterEach(() => store.close());

  it("inserts and retrieves a task", () => {
    const t = newTask({ tenantId: "t", title: "Ship feature", description: "do it" });
    store.insertTask(t);
    const got = store.getTask(t.id);
    expect(got?.id).toBe(t.id);
    expect(got?.state).toBe("queued");
    expect(got?.attempts).toBe(0);
  });

  it("updateTaskState transitions through the lifecycle", () => {
    const t = newTask({ tenantId: "t", title: "x", description: "d" });
    store.insertTask(t);

    store.updateTaskState(t.id, { state: "running", startedAt: "2024-01-01T00:00:00Z" });
    expect(store.getTask(t.id)?.state).toBe("running");

    store.updateTaskState(t.id, {
      state: "succeeded",
      finishedAt: "2024-01-01T00:00:01Z",
      output: { summary: "done" },
      attempts: 2,
    });
    const done = store.getTask(t.id);
    expect(done?.state).toBe("succeeded");
    expect(done?.finishedAt).toBe("2024-01-01T00:00:01Z");
    expect(done?.output?.summary).toBe("done");
    expect(done?.attempts).toBe(2);
  });

  it("nextQueued returns the highest-priority queued task first", () => {
    const low = newTask({ tenantId: "t", title: "low", description: "d", priority: 1 });
    const high = newTask({ tenantId: "t", title: "high", description: "d", priority: 9 });
    const mid = newTask({ tenantId: "t", title: "mid", description: "d", priority: 5 });
    store.insertTask(low);
    store.insertTask(high);
    store.insertTask(mid);

    expect(store.nextQueued()?.id).toBe(high.id);
    store.updateTaskState(high.id, { state: "assigned" });
    expect(store.nextQueued()?.id).toBe(mid.id);
    store.updateTaskState(mid.id, { state: "assigned" });
    expect(store.nextQueued()?.id).toBe(low.id);
    store.updateTaskState(low.id, { state: "assigned" });
    expect(store.nextQueued()).toBeUndefined();
  });

  it("inserts and reads back events via recentEvents (newest first)", () => {
    store.insertEvent({
      id: "e1",
      type: "task.queued",
      ts: "2024-01-01T00:00:00Z",
      source: "test",
      payload: { a: 1 },
    });
    store.insertEvent({
      id: "e2",
      type: "task.assigned",
      ts: "2024-01-01T00:00:01Z",
      source: "test",
      payload: { a: 2 },
    });
    expect(store.recentEvents().map((e) => e.type)).toEqual(["task.assigned", "task.queued"]);
    expect(store.recentEvents(1).map((e) => e.id)).toEqual(["e2"]);
  });

  it("advances the approval lifecycle (pending → approved)", () => {
    store.insertApproval({
      id: "ap1",
      tenantId: "t",
      agentId: "a",
      taskId: "tk",
      tool: "billing.x",
      args: { amount: 5 },
      reason: "test",
      state: "pending",
      createdAt: "2024-01-01T00:00:00Z",
    });
    expect(store.pendingApprovals()).toHaveLength(1);

    store.setApprovalState("ap1", "approved", "tester");
    const a = store.getApproval("ap1");
    expect(a?.state).toBe("approved");
    expect(a?.decidedBy).toBe("tester");
    expect(a?.decidedAt).toBeDefined();
    expect(store.pendingApprovals()).toHaveLength(0);
  });

  it("sums spend records per task", () => {
    const base = {
      tenantId: "t",
      agentId: "a",
      taskId: "tk",
      tool: "billing.x",
      currency: "USD",
      ref: "r",
    };
    store.recordSpend({ id: "s1", ...base, amount: 10, ts: "2024-01-01T00:00:00Z" });
    store.recordSpend({ id: "s2", ...base, amount: 25, ts: "2024-01-01T00:00:01Z" });
    expect(store.spendForTask("t", "tk")).toBe(35);
  });

  it("remembers and recalls long-term memory via MemoryStore", () => {
    const mem = new MemoryStore(store, silentLogger);
    mem.remember({
      tenantId: "t",
      agentId: "a",
      kind: "fact",
      content: "Refunds allowed within 30 days",
      tags: ["refund", "policy"],
    });
    mem.remember({
      tenantId: "t",
      agentId: "a",
      kind: "note",
      content: "Customer prefers email",
      tags: ["prefs"],
    });

    const byQuery = mem.recall("t", "a", { query: "Refunds" });
    expect(byQuery).toHaveLength(1);
    expect(byQuery[0]?.content).toContain("Refunds");

    const byTag = mem.recall("t", "a", { tags: ["prefs"] });
    expect(byTag).toHaveLength(1);
    expect(byTag[0]?.tags).toContain("prefs");
  });
});
