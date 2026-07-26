/** In-process firm event bus for timeline SSE. */

export type FirmEvent = {
  type: string;
  at: string;
  payload: Record<string, unknown>;
};

type Listener = (event: FirmEvent) => void;

const listeners = new Set<Listener>();
const recent: FirmEvent[] = [];
const MAX_RECENT = 200;

export function publishFirmEvent(type: string, payload: Record<string, unknown> = {}): FirmEvent {
  const event: FirmEvent = { type, at: new Date().toISOString(), payload };
  recent.push(event);
  if (recent.length > MAX_RECENT) recent.shift();
  for (const listener of listeners) listener(event);
  return event;
}

export function subscribeFirmEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function recentFirmEvents(): FirmEvent[] {
  return [...recent];
}

export function clearFirmEvents(): void {
  recent.length = 0;
}
