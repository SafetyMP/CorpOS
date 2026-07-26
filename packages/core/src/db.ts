import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema.js";
import path from "node:path";
import fs from "node:fs";

export type Db = LibSQLDatabase<typeof schema>;

export async function openDb(dbPath?: string): Promise<{ client: Client; db: Db }> {
  const file = dbPath ?? process.env.CORPOS_DB ?? path.join(process.cwd(), "data", "company.db");
  const isMemory = file === ":memory:";
  if (!isMemory) fs.mkdirSync(path.dirname(file), { recursive: true });
  const url = isMemory ? ":memory:" : `file:${file}`;
  const client = createClient({ url });
  const db = drizzle(client, { schema });
  await migrate(client);
  return { client, db };
}

async function migrate(client: Client): Promise<void> {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      capital_budget REAL NOT NULL DEFAULT 1000,
      capital_spent REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      department TEXT NOT NULL,
      owner TEXT NOT NULL,
      principal TEXT NOT NULL,
      max_autonomous_risk INTEGER NOT NULL DEFAULT 1,
      trust_score REAL NOT NULL DEFAULT 0,
      accepts INTEGER NOT NULL DEFAULT 0,
      rejects INTEGER NOT NULL DEFAULT 0,
      violations INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS contracts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      title TEXT NOT NULL,
      intake TEXT NOT NULL,
      state TEXT NOT NULL,
      assignees TEXT NOT NULL,
      obligations TEXT NOT NULL,
      sla_due_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      state TEXT NOT NULL,
      assigned_to TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      error TEXT,
      result_summary TEXT
    );
    CREATE TABLE IF NOT EXISTS exceptions (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      contract_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      tool TEXT NOT NULL,
      args_json TEXT NOT NULL,
      reason TEXT NOT NULL,
      risk_level INTEGER NOT NULL,
      state TEXT NOT NULL,
      ttl_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      decided_at TEXT,
      decided_by TEXT,
      pause_json TEXT
    );
    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      contract_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      tool TEXT NOT NULL,
      args_json TEXT NOT NULL,
      state TEXT NOT NULL,
      created_at TEXT NOT NULL,
      settled_at TEXT
    );
    CREATE TABLE IF NOT EXISTS compensators (
      id TEXT PRIMARY KEY,
      draft_id TEXT NOT NULL,
      contract_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      state TEXT NOT NULL,
      created_at TEXT NOT NULL,
      run_at TEXT
    );
    CREATE TABLE IF NOT EXISTS spend_ledger (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      department TEXT NOT NULL,
      contract_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      tool TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_chain (
      id TEXT PRIMARY KEY,
      seq INTEGER NOT NULL,
      prev_hash TEXT NOT NULL,
      entry_hash TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS traces (
      id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      steps_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS control_state (
      id TEXT PRIMARY KEY,
      killed INTEGER NOT NULL DEFAULT 0,
      token_budget INTEGER NOT NULL DEFAULT 100000,
      tokens_used INTEGER NOT NULL DEFAULT 0
    );
  `);
}
