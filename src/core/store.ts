import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type {
  Approval,
  ApprovalState,
  Event,
  MemoryItem,
  SpendRecord,
  Task,
  TaskResult,
  TaskState,
} from "./types";
import { now } from "./types";
import { newId } from "./id";

export interface StoreOptions {
  path?: string;
  inMemory?: boolean;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  assigned_to TEXT,
  created_by TEXT NOT NULL,
  state TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  depends_on TEXT,
  input TEXT,
  output TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  ts TEXT NOT NULL,
  source TEXT NOT NULL,
  tenant_id TEXT,
  task_id TEXT,
  agent_id TEXT,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  args TEXT NOT NULL,
  reason TEXT NOT NULL,
  state TEXT NOT NULL,
  cost TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT
);

CREATE TABLE IF NOT EXISTS spend (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  tool TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  ref TEXT NOT NULL,
  ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_spend_tenant_task ON spend(tenant_id, task_id);

CREATE TABLE IF NOT EXISTS memory (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT NOT NULL,
  ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memory_agent ON memory(tenant_id, agent_id);
`;

type TaskRow = {
  id: string;
  tenant_id: string;
  title: string;
  description: string;
  assigned_to: string | null;
  created_by: string;
  state: string;
  priority: number;
  depends_on: string | null;
  input: string | null;
  output: string | null;
  attempts: number;
  max_attempts: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
};

function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    title: r.title,
    description: r.description,
    assignedTo: r.assigned_to ?? undefined,
    createdBy: r.created_by,
    state: r.state as TaskState,
    priority: r.priority,
    dependsOn: r.depends_on ? (JSON.parse(r.depends_on) as string[]) : undefined,
    input: r.input ? (JSON.parse(r.input) as Record<string, unknown>) : undefined,
    output: r.output ? (JSON.parse(r.output) as TaskResult) : undefined,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    createdAt: r.created_at,
    startedAt: r.started_at ?? undefined,
    finishedAt: r.finished_at ?? undefined,
    error: r.error ?? undefined,
  };
}

export class Store {
  readonly db: Database.Database;
  readonly path: string;

  constructor(opts: StoreOptions = {}) {
    if (opts.inMemory) {
      this.db = new Database(":memory:");
      this.path = ":memory:";
    } else {
      this.path = resolve(opts.path ?? "data/company.db");
      mkdirSync(dirname(this.path), { recursive: true });
      this.db = new Database(this.path);
    }
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(SCHEMA);
  }

  // ── Tasks ──────────────────────────────────────────────────────────
  insertTask(task: Task): void {
    this.db
      .prepare(
        `INSERT INTO tasks
          (id, tenant_id, title, description, assigned_to, created_by, state,
           priority, depends_on, input, output, attempts, max_attempts,
           created_at, started_at, finished_at, error)
         VALUES (@id,@tenant_id,@title,@description,@assigned_to,@created_by,@state,
           @priority,@depends_on,@input,@output,@attempts,@max_attempts,
           @created_at,@started_at,@finished_at,@error)`
      )
      .run({
        id: task.id,
        tenant_id: task.tenantId,
        title: task.title,
        description: task.description,
        assigned_to: task.assignedTo ?? null,
        created_by: task.createdBy,
        state: task.state,
        priority: task.priority,
        depends_on: task.dependsOn ? JSON.stringify(task.dependsOn) : null,
        input: task.input ? JSON.stringify(task.input) : null,
        output: null,
        attempts: task.attempts,
        max_attempts: task.maxAttempts,
        created_at: task.createdAt,
        started_at: task.startedAt ?? null,
        finished_at: task.finishedAt ?? null,
        error: task.error ?? null,
      });
  }

  updateTaskState(
    id: string,
    patch: Partial<
      Pick<
        Task,
        | "state"
        | "assignedTo"
        | "attempts"
        | "startedAt"
        | "finishedAt"
        | "error"
        | "output"
      >
    >
  ): void {
    const sets: string[] = ["state = @state"];
    const params: Record<string, unknown> = { id, state: patch.state };
    if (patch.assignedTo !== undefined) {
      sets.push("assigned_to = @assigned_to");
      params.assigned_to = patch.assignedTo;
    }
    if (patch.attempts !== undefined) {
      sets.push("attempts = @attempts");
      params.attempts = patch.attempts;
    }
    if (patch.startedAt !== undefined) {
      sets.push("started_at = @started_at");
      params.started_at = patch.startedAt;
    }
    if (patch.finishedAt !== undefined) {
      sets.push("finished_at = @finished_at");
      params.finished_at = patch.finishedAt;
    }
    if (patch.error !== undefined) {
      sets.push("error = @error");
      params.error = patch.error;
    }
    if (patch.output !== undefined) {
      sets.push("output = @output");
      params.output = JSON.stringify(patch.output);
    }
    this.db.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = @id`).run(params);
  }

  getTask(id: string): Task | undefined {
    const row = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as
      | TaskRow
      | undefined;
    return row ? rowToTask(row) : undefined;
  }

  listTasks(state?: TaskState): Task[] {
    const rows = state
      ? (this.db
          .prepare("SELECT * FROM tasks WHERE state = ? ORDER BY created_at")
          .all(state) as TaskRow[])
      : (this.db
          .prepare("SELECT * FROM tasks ORDER BY created_at")
          .all() as TaskRow[]);
    return rows.map(rowToTask);
  }

  nextQueued(): Task | undefined {
    const row = this.db
      .prepare(
        `SELECT * FROM tasks
         WHERE state = 'queued'
         ORDER BY priority DESC, created_at
         LIMIT 1`
      )
      .get() as TaskRow | undefined;
    return row ? rowToTask(row) : undefined;
  }

  // ── Events ─────────────────────────────────────────────────────────
  insertEvent(e: Event): void {
    this.db
      .prepare(
        `INSERT INTO events (id, type, ts, source, tenant_id, task_id, agent_id, payload)
         VALUES (@id,@type,@ts,@source,@tenant_id,@task_id,@agent_id,@payload)`
      )
      .run({
        id: e.id,
        type: e.type,
        ts: e.ts,
        source: e.source,
        tenant_id: e.tenantId ?? null,
        task_id: e.taskId ?? null,
        agent_id: e.agentId ?? null,
        payload: JSON.stringify(e.payload),
      });
  }

  recentEvents(limit = 100): Event[] {
    const rows = this.db
      .prepare("SELECT * FROM events ORDER BY ts DESC LIMIT ?")
      .all(limit) as Array<{
      id: string;
      type: string;
      ts: string;
      source: string;
      tenant_id: string | null;
      task_id: string | null;
      agent_id: string | null;
      payload: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      ts: r.ts,
      source: r.source,
      payload: JSON.parse(r.payload),
      tenantId: r.tenant_id ?? undefined,
      taskId: r.task_id ?? undefined,
      agentId: r.agent_id ?? undefined,
    }));
  }

  // ── Approvals ──────────────────────────────────────────────────────
  insertApproval(a: Approval): void {
    this.db
      .prepare(
        `INSERT INTO approvals
          (id, tenant_id, agent_id, task_id, tool, args, reason, state, cost,
           created_at, decided_at, decided_by)
         VALUES (@id,@tenant_id,@agent_id,@task_id,@tool,@args,@reason,@state,@cost,
           @created_at,@decided_at,@decided_by)`
      )
      .run({
        id: a.id,
        tenant_id: a.tenantId,
        agent_id: a.agentId,
        task_id: a.taskId,
        tool: a.tool,
        args: JSON.stringify(a.args),
        reason: a.reason,
        state: a.state,
        cost: a.cost ? JSON.stringify(a.cost) : null,
        created_at: a.createdAt,
        decided_at: a.decidedAt ?? null,
        decided_by: a.decidedBy ?? null,
      });
  }

  setApprovalState(
    id: string,
    state: ApprovalState,
    decidedBy: string
  ): void {
    this.db
      .prepare(
        `UPDATE approvals SET state = @state, decided_at = @decided_at,
         decided_by = @decided_by WHERE id = @id`
      )
      .run({ id, state, decided_at: now(), decided_by: decidedBy });
  }

  getApproval(id: string): Approval | undefined {
    const r = this.db
      .prepare("SELECT * FROM approvals WHERE id = ?")
      .get(id) as
      | {
          id: string;
          tenant_id: string;
          agent_id: string;
          task_id: string;
          tool: string;
          args: string;
          reason: string;
          state: string;
          cost: string | null;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
        }
      | undefined;
    if (!r) return undefined;
    return {
      id: r.id,
      tenantId: r.tenant_id,
      agentId: r.agent_id,
      taskId: r.task_id,
      tool: r.tool,
      args: JSON.parse(r.args),
      reason: r.reason,
      state: r.state as ApprovalState,
      cost: r.cost ? JSON.parse(r.cost) : undefined,
      createdAt: r.created_at,
      decidedAt: r.decided_at ?? undefined,
      decidedBy: r.decided_by ?? undefined,
    };
  }

  pendingApprovals(): Approval[] {
    const rows = this.db
      .prepare("SELECT * FROM approvals WHERE state = 'pending' ORDER BY created_at")
      .all() as Array<{
      id: string;
      tenant_id: string;
      agent_id: string;
      task_id: string;
      tool: string;
      args: string;
      reason: string;
      state: string;
      cost: string | null;
      created_at: string;
      decided_at: string | null;
      decided_by: string | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      agentId: r.agent_id,
      taskId: r.task_id,
      tool: r.tool,
      args: JSON.parse(r.args),
      reason: r.reason,
      state: r.state as ApprovalState,
      cost: r.cost ? JSON.parse(r.cost) : undefined,
      createdAt: r.created_at,
      decidedAt: r.decided_at ?? undefined,
      decidedBy: r.decided_by ?? undefined,
    }));
  }

  // ── Spend ──────────────────────────────────────────────────────────
  recordSpend(s: SpendRecord): void {
    this.db
      .prepare(
        `INSERT INTO spend (id, tenant_id, agent_id, task_id, tool, amount, currency, ref, ts)
         VALUES (@id,@tenant_id,@agent_id,@task_id,@tool,@amount,@currency,@ref,@ts)`
      )
      .run({
        id: s.id,
        tenant_id: s.tenantId,
        agent_id: s.agentId,
        task_id: s.taskId,
        tool: s.tool,
        amount: s.amount,
        currency: s.currency,
        ref: s.ref,
        ts: s.ts,
      });
  }

  spendForTask(tenantId: string, taskId: string): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM spend
         WHERE tenant_id = ? AND task_id = ?`
      )
      .get(tenantId, taskId) as { total: number };
    return row.total;
  }

  // ── Memory ─────────────────────────────────────────────────────────
  remember(m: MemoryItem): void {
    this.db
      .prepare(
        `INSERT INTO memory (id, tenant_id, agent_id, kind, content, tags, ts)
         VALUES (@id,@tenant_id,@agent_id,@kind,@content,@tags,@ts)`
      )
      .run({
        id: m.id,
        tenant_id: m.tenantId,
        agent_id: m.agentId,
        kind: m.kind,
        content: m.content,
        tags: JSON.stringify(m.tags),
        ts: m.ts,
      });
  }

  recall(
    tenantId: string,
    agentId: string,
    opts: { query?: string; limit?: number; tags?: string[] } = {}
  ): MemoryItem[] {
    const limit = opts.limit ?? 25;
    let sql = `SELECT * FROM memory WHERE tenant_id = ? AND agent_id = ?`;
    const params: unknown[] = [tenantId, agentId];
    if (opts.tags && opts.tags.length) {
      sql += ` AND ${opts.tags.map(() => `tags LIKE ?`).join(" OR ")}`;
      for (const t of opts.tags) params.push(`%"${t}"%`);
    }
    if (opts.query) {
      sql += ` AND content LIKE ?`;
      params.push(`%${opts.query}%`);
    }
    sql += ` ORDER BY ts DESC LIMIT ?`;
    params.push(limit);
    const rows = this.db.prepare(sql).all(...params) as Array<{
      id: string;
      tenant_id: string;
      agent_id: string;
      kind: string;
      content: string;
      tags: string;
      ts: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      agentId: r.agent_id,
      kind: r.kind as MemoryItem["kind"],
      content: r.content,
      tags: JSON.parse(r.tags),
      ts: r.ts,
    }));
  }

  close(): void {
    this.db.close();
  }
}

export const newTask = (init: {
  tenantId: string;
  title: string;
  description: string;
  createdBy?: string;
  assignedTo?: string;
  priority?: number;
  input?: Record<string, unknown>;
  maxAttempts?: number;
  dependsOn?: string[];
}): Task => ({
  id: newId("task"),
  tenantId: init.tenantId,
  title: init.title,
  description: init.description,
  createdBy: init.createdBy ?? "system",
  assignedTo: init.assignedTo,
  state: "queued",
  priority: init.priority ?? 0,
  input: init.input,
  attempts: 0,
  maxAttempts: init.maxAttempts ?? 3,
  createdAt: now(),
});
