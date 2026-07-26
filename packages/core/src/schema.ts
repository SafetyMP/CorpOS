import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const departments = sqliteTable("departments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  capitalBudget: real("capital_budget").notNull().default(1000),
  capitalSpent: real("capital_spent").notNull().default(0),
});

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  role: text("role").notNull(),
  department: text("department").notNull(),
  owner: text("owner").notNull(),
  principal: text("principal").notNull(),
  maxAutonomousRisk: integer("max_autonomous_risk").notNull().default(1),
  trustScore: real("trust_score").notNull().default(0),
  accepts: integer("accepts").notNull().default(0),
  rejects: integer("rejects").notNull().default(0),
  violations: integer("violations").notNull().default(0),
  /** G1 membership: 1=active, 0=inactive */
  active: integer("active").notNull().default(1),
});

export const contracts = sqliteTable("contracts", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  title: text("title").notNull(),
  intake: text("intake").notNull(),
  state: text("state").notNull(),
  assignees: text("assignees").notNull(),
  obligations: text("obligations").notNull(),
  slaDueAt: text("sla_due_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  contractId: text("contract_id").notNull(),
  tenantId: text("tenant_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  state: text("state").notNull(),
  assignedTo: text("assigned_to"),
  attempts: integer("attempts").notNull().default(0),
  createdAt: text("created_at").notNull(),
  startedAt: text("started_at"),
  finishedAt: text("finished_at"),
  error: text("error"),
  resultSummary: text("result_summary"),
});

export const exceptions = sqliteTable("exceptions", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  contractId: text("contract_id").notNull(),
  taskId: text("task_id").notNull(),
  agentId: text("agent_id").notNull(),
  tool: text("tool").notNull(),
  argsJson: text("args_json").notNull(),
  reason: text("reason").notNull(),
  riskLevel: integer("risk_level").notNull(),
  state: text("state").notNull(),
  ttlAt: text("ttl_at").notNull(),
  createdAt: text("created_at").notNull(),
  decidedAt: text("decided_at"),
  decidedBy: text("decided_by"),
  /** G4 dissent / reject reason (never overwritten once set) */
  dissentReason: text("dissent_reason"),
  pauseJson: text("pause_json"),
});

export const drafts = sqliteTable("drafts", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  contractId: text("contract_id").notNull(),
  taskId: text("task_id").notNull(),
  agentId: text("agent_id").notNull(),
  tool: text("tool").notNull(),
  argsJson: text("args_json").notNull(),
  state: text("state").notNull(),
  createdAt: text("created_at").notNull(),
  settledAt: text("settled_at"),
});

export const compensators = sqliteTable("compensators", {
  id: text("id").primaryKey(),
  draftId: text("draft_id").notNull(),
  contractId: text("contract_id").notNull(),
  kind: text("kind").notNull(),
  payloadJson: text("payload_json").notNull(),
  state: text("state").notNull(),
  createdAt: text("created_at").notNull(),
  runAt: text("run_at"),
});

export const spendLedger = sqliteTable("spend_ledger", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  department: text("department").notNull(),
  contractId: text("contract_id").notNull(),
  taskId: text("task_id").notNull(),
  tool: text("tool").notNull(),
  amount: real("amount").notNull(),
  currency: text("currency").notNull(),
  createdAt: text("created_at").notNull(),
});

export const auditChain = sqliteTable("audit_chain", {
  id: text("id").primaryKey(),
  seq: integer("seq").notNull(),
  prevHash: text("prev_hash").notNull(),
  entryHash: text("entry_hash").notNull(),
  eventType: text("event_type").notNull(),
  payloadJson: text("payload_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const traces = sqliteTable("traces", {
  id: text("id").primaryKey(),
  contractId: text("contract_id").notNull(),
  taskId: text("task_id").notNull(),
  stepsJson: text("steps_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const controlState = sqliteTable("control_state", {
  id: text("id").primaryKey(),
  killed: integer("killed").notNull().default(0),
  tokenBudget: integer("token_budget").notNull().default(100000),
  tokensUsed: integer("tokens_used").notNull().default(0),
});
