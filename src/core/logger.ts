import type { ISODate, Logger, LogLevel } from "./types";
import { now } from "./types";
import type { EventBus } from "./event-bus";

interface LogEntry {
  level: LogLevel;
  scope: string;
  msg: string;
  meta?: Record<string, unknown>;
  ts: ISODate;
}

const ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class CoreLogger implements Logger {
  private scope: string;
  private minLevel: LogLevel;
  private bus?: EventBus;
  private sink: (entry: LogEntry) => void;

  constructor(
    opts: {
      scope?: string;
      minLevel?: LogLevel;
      bus?: EventBus;
      sink?: (entry: LogEntry) => void;
    } = {},
  ) {
    this.scope = opts.scope ?? "app";
    this.minLevel = opts.minLevel ?? (process.env.LOG_LEVEL as LogLevel) ?? "info";
    this.bus = opts.bus;
    this.sink =
      opts.sink ??
      ((e) => {
        const line = `[${e.ts}] ${e.level.toUpperCase()} ${e.scope}: ${e.msg}`;
        const stream = e.level === "error" || e.level === "warn" ? process.stderr : process.stdout;
        stream.write(e.meta ? `${line} ${JSON.stringify(e.meta)}\n` : `${line}\n`);
      });
  }

  child(scope: string): Logger {
    return new CoreLogger({
      scope: this.scope ? `${this.scope}:${scope}` : scope,
      minLevel: this.minLevel,
      bus: this.bus,
      sink: this.sink,
    });
  }

  private log(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
    if (ORDER[level] < ORDER[this.minLevel]) return;
    const entry: LogEntry = { level, scope: this.scope, msg, meta, ts: now() };
    this.sink(entry);
    this.bus?.emit("log", entry);
  }

  debug(msg: string, meta?: Record<string, unknown>): void {
    this.log("debug", msg, meta);
  }
  info(msg: string, meta?: Record<string, unknown>): void {
    this.log("info", msg, meta);
  }
  warn(msg: string, meta?: Record<string, unknown>): void {
    this.log("warn", msg, meta);
  }
  error(msg: string, meta?: Record<string, unknown>): void {
    this.log("error", msg, meta);
  }

  audit(action: string, meta?: Record<string, unknown>): void {
    const entry = { action, meta, ts: now(), scope: this.scope };
    this.bus?.emit("audit", entry);
    this.sink({
      level: "info",
      scope: `audit:${this.scope}`,
      msg: action,
      meta,
      ts: entry.ts,
    });
  }
}
