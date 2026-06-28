import type { Event, EventHandler } from "./types";

/**
 * In-process typed event bus. Subscribers are notified synchronously by
 * default; async handlers are awaited. A bounded ring buffer retains recent
 * history for replay (dashboard, audit reconstruction, tests).
 */
export class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  private wildcard = new Set<EventHandler>();
  private history: Event[] = [];
  private capacity: number;

  constructor(capacity = 1000) {
    this.capacity = capacity;
  }

  on<T = unknown>(type: string, handler: EventHandler<T>): () => void {
    const set = this.handlers.get(type) ?? new Set();
    set.add(handler as EventHandler);
    this.handlers.set(type, set);
    return () => set.delete(handler as EventHandler);
  }

  /** Subscribe to every event regardless of type. */
  onAll(handler: EventHandler): () => void {
    this.wildcard.add(handler);
    return () => this.wildcard.delete(handler);
  }

  async emit<T = unknown>(type: string, payload: T, base?: Partial<Event<T>>): Promise<void> {
    const event: Event<T> = {
      id: crypto.randomUUID(),
      type,
      ts: new Date().toISOString(),
      source: base?.source ?? "system",
      payload,
      tenantId: base?.tenantId,
      taskId: base?.taskId,
      agentId: base?.agentId,
    };
    this.history.push(event as Event);
    if (this.history.length > this.capacity) this.history.shift();

    const direct = this.handlers.get(type);
    const targets: EventHandler[] = [
      ...(direct ? [...direct] : []),
      ...this.wildcard,
    ];
    for (const h of targets) {
      try {
        await h(event as Event);
      } catch (err) {
        // A failing handler must not break the bus or other handlers.
        this.handlers
          .get("__bus_error__")
          ?.forEach((eh) => eh({ ...event, type: "__bus_error__", payload: err }));
      }
    }
  }

  history_since(ts?: string): Event[] {
    return ts ? this.history.filter((e) => e.ts > ts) : [...this.history];
  }

  filter(type?: string): Event[] {
    return type ? this.history.filter((e) => e.type === type) : [...this.history];
  }
}
