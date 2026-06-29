export type ID = string;
export type ISODate = string;

export const now = (): ISODate => new Date().toISOString();

// ─── Events ──────────────────────────────────────────────────────────
export interface Event<T = unknown> {
  id: ID;
  type: string;
  ts: ISODate;
  source: string;
  payload: T;
  tenantId?: ID;
  taskId?: ID;
  agentId?: ID;
}

export type EventHandler<T = unknown> = (event: Event<T>) => void | Promise<void>;

// ─── LLM ─────────────────────────────────────────────────────────────
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: ID;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LLMRequest {
  messages: ChatMessage[];
  tools?: ToolSchema[];
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface LLMResponse {
  message: ChatMessage;
  toolCalls: ToolCall[];
  finishReason: "stop" | "tool_calls" | "length";
  usage: { promptTokens: number; completionTokens: number };
}

export interface LLMProvider {
  readonly id: string;
  complete(request: LLMRequest): Promise<LLMResponse>;
}

// ─── Tools ───────────────────────────────────────────────────────────
export type ToolCategory = "read" | "write" | "spend" | "communicate" | "system" | "delegate";

export interface ToolPermission {
  category: ToolCategory;
  costCap?: number;
  requiresApproval?: boolean;
}

export interface ToolContext {
  agentId: ID;
  taskId: ID;
  tenantId: ID;
  logger: Logger;
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  /** Cost incurred by this call, in the tool's currency (for spend-gated tools). */
  cost?: { amount: number; currency: string };
  /** Human-readable note surfaced back into the agent's reasoning context. */
  note?: string;
}

export type ToolHandler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  permission: ToolPermission;
  execute: ToolHandler;
}

// ─── Policy ──────────────────────────────────────────────────────────
export type Effect = "allow" | "deny" | "approve";

export interface PolicyDecision {
  effect: Effect;
  reason: string;
  approvalId?: ID;
}

export interface PolicyRule {
  id: ID;
  /** Glob over tool name, e.g. "billing.*" or "crm.update_contact". */
  tool: string;
  effect: Effect;
  reason?: string;
  /** Per-(tenant,category) spend ceiling checked against the spend ledger. */
  spendCapPerRun?: number;
  priority?: number;
}

export interface SpendRecord {
  id: ID;
  tenantId: ID;
  agentId: ID;
  taskId: ID;
  tool: string;
  amount: number;
  currency: string;
  ref: string;
  ts: ISODate;
}

// ─── Approvals ───────────────────────────────────────────────────────
export type ApprovalState = "pending" | "approved" | "rejected" | "expired";

export interface Approval {
  id: ID;
  tenantId: ID;
  agentId: ID;
  taskId: ID;
  tool: string;
  args: Record<string, unknown>;
  reason: string;
  state: ApprovalState;
  cost?: { amount: number; currency: string };
  createdAt: ISODate;
  decidedAt?: ISODate;
  decidedBy?: string;
}

// ─── Memory ──────────────────────────────────────────────────────────
export type MemoryKind = "fact" | "event" | "note" | "decision";

export interface MemoryItem {
  id: ID;
  tenantId: ID;
  agentId: ID;
  kind: MemoryKind;
  content: string;
  tags: string[];
  ts: ISODate;
}

// ─── Tasks ───────────────────────────────────────────────────────────
export type TaskState =
  "queued" | "assigned" | "running" | "awaiting_approval" | "succeeded" | "failed" | "cancelled";

export interface TaskResult {
  summary: string;
  artifacts?: Record<string, unknown>;
}

export interface Task {
  id: ID;
  tenantId: ID;
  title: string;
  description: string;
  assignedTo?: ID;
  createdBy: string;
  state: TaskState;
  priority: number;
  dependsOn?: ID[];
  input?: Record<string, unknown>;
  output?: TaskResult;
  attempts: number;
  maxAttempts: number;
  createdAt: ISODate;
  startedAt?: ISODate;
  finishedAt?: ISODate;
  error?: string;
}

// ─── Agents ──────────────────────────────────────────────────────────
export type AgentState = "idle" | "busy" | "awaiting" | "stopped";

export interface AgentDefinition {
  id: ID;
  name: string;
  role: string;
  systemPrompt: string;
  tools: string[];
  model?: string;
  maxSteps?: number;
  tenantId?: ID;
}

export interface AgentRunStep {
  ts: ISODate;
  thought?: string;
  toolCalls?: ToolCall[];
  results?: ToolResult[];
  policyDecisions?: Array<{ tool: string; decision: PolicyDecision }>;
}

export interface AgentRunResult {
  taskId: ID;
  ok: boolean;
  steps: AgentRunStep[];
  result?: TaskResult;
  error?: string;
  awaitingApprovalId?: ID;
}

// ─── Logger ──────────────────────────────────────────────────────────
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  child(scope: string): Logger;
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  audit(action: string, meta?: Record<string, unknown>): void;
}

// ─── Tenancy ─────────────────────────────────────────────────────────
export interface Tenant {
  id: ID;
  name: string;
  /** Default spend caps per category for this tenant. */
  spendCaps?: Partial<Record<ToolCategory, number>>;
}
