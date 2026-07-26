export type ID = string;
export type ISODate = string;
export const now = (): ISODate => new Date().toISOString();

export type RiskLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type Effect = "allow" | "deny" | "draft" | "approve";
export type ToolCategory = "read" | "write" | "spend" | "communicate" | "system" | "delegate";

export interface ToolPermission {
  category: ToolCategory;
  riskLevel: RiskLevel;
  costCap?: number;
  requiresApproval?: boolean;
}

export interface AgentIdentity {
  id: ID;
  role: string;
  department: string;
  owner: string;
  principal: string;
  tools: string[];
  maxSteps?: number;
  model?: string;
  systemPrompt: string;
}

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

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
  note?: string;
  cost?: { amount: number; currency: string };
  draftId?: string;
  compensator?: string;
}

export interface ToolContext {
  agentId: ID;
  taskId: ID;
  contractId: ID;
  tenantId: ID;
  originatingAuthority?: string;
  delegatedBy?: string;
  delegationDepth?: number;
  originatorToolAllowlist?: string[];
  agentToolAllowlist?: string[];
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  permission: ToolPermission;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

export interface PolicyDecision {
  effect: Effect;
  reason: string;
  approvalId?: string;
  draftId?: string;
  decisionId?: string;
  authzLayer?: string;
}

export interface PolicyRule {
  tool: string;
  effect?: Effect;
  reason?: string;
  spendCapPerRun?: number;
  priority?: number;
}
