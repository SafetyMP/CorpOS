import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventBus } from "../src/core/index";

describe("EventBus", () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it("delivers typed events to on() handlers", async () => {
    const seen: unknown[] = [];
    bus.on("task.queued", (e) => {
      seen.push(e.payload);
    });
    await bus.emit("task.queued", { id: "t1" });
    expect(seen).toEqual([{ id: "t1" }]);
  });

  it("unsubscribes when the returned off handle is called", async () => {
    const seen: unknown[] = [];
    const off = bus.on("x", (e) => {
      seen.push(e.payload);
    });
    off();
    await bus.emit("x", { n: 1 });
    expect(seen).toEqual([]);
  });

  it("delivers every event to onAll wildcard handlers", async () => {
    const types: string[] = [];
    bus.onAll((e) => {
      types.push(e.type);
    });
    await bus.emit("a", {});
    await bus.emit("b", {});
    expect(types).toEqual(["a", "b"]);
  });

  it("a throwing handler does not break other handlers", async () => {
    const calls: string[] = [];
    bus.on("evt", () => {
      calls.push("first");
      throw new Error("boom");
    });
    bus.on("evt", () => {
      calls.push("second");
    });
    await bus.emit("evt", {});
    expect(calls).toEqual(["first", "second"]);
  });

  it("history_since returns events strictly after the given timestamp", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
      await bus.emit("early", { n: 1 });
      const boundary = new Date().toISOString();

      vi.setSystemTime(new Date("2024-01-01T00:00:00.500Z"));
      await bus.emit("late", { n: 2 });
      vi.setSystemTime(new Date("2024-01-01T00:00:01.000Z"));
      await bus.emit("later", { n: 3 });

      expect(bus.history_since(boundary).map((e) => e.type)).toEqual(["late", "later"]);
      expect(bus.history_since().map((e) => e.type)).toEqual(["early", "late", "later"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
