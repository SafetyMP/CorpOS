import type { Tool, ToolContext, ToolResult } from "./types.js";

export type ToolMap = Map<string, Tool>;

export function createSeedTools(state: {
  refunds: Array<{ id: string; amount: number; customer: string }>;
  messages: Array<{ to: string; body: string }>;
  knowledge: Record<string, string>;
}): Tool[] {
  return [
    {
      name: "crm.lookup",
      description: "Lookup a customer by email",
      parameters: {
        type: "object",
        properties: { email: { type: "string" } },
        required: ["email"],
      },
      permission: { category: "read", riskLevel: 0 },
      async execute(args): Promise<ToolResult> {
        return {
          ok: true,
          data: { email: args.email, plan: "pro", subscription: "sub_ada_pro" },
          note: `Found customer ${args.email}`,
        };
      },
    },
    {
      name: "knowledge.search",
      description: "Search knowledge base (via MCP)",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
      permission: { category: "read", riskLevel: 0 },
      async execute(args): Promise<ToolResult> {
        const q = String(args.query ?? "").toLowerCase();
        const hit = Object.entries(state.knowledge).find(([k]) => q.includes(k) || k.includes(q));
        return {
          ok: true,
          data: hit ? { article: hit[0], body: hit[1] } : { article: null },
          note: hit ? `KB: ${hit[0]}` : "No KB hit",
        };
      },
    },
    {
      name: "billing.issue_refund",
      description: "Issue a refund (draft/settle)",
      parameters: {
        type: "object",
        properties: {
          subscription: { type: "string" },
          amount: { type: "number" },
          customer: { type: "string" },
        },
        required: ["subscription", "amount"],
      },
      permission: { category: "spend", riskLevel: 3, costCap: 200, requiresApproval: false },
      async execute(args, _ctx: ToolContext): Promise<ToolResult> {
        const amount = Number(args.amount ?? 0);
        const id = `ref_${state.refunds.length + 1}`;
        state.refunds.push({
          id,
          amount,
          customer: String(args.customer ?? "unknown"),
        });
        return {
          ok: true,
          data: { refundId: id, amount },
          note: `Refunded $${amount}`,
          cost: { amount, currency: "USD" },
          compensator: "billing.reverse_refund",
        };
      },
    },
    {
      name: "billing.reverse_refund",
      description: "Compensate a refund",
      parameters: {
        type: "object",
        properties: { refundId: { type: "string" }, amount: { type: "number" } },
        required: ["refundId", "amount"],
      },
      permission: { category: "spend", riskLevel: 3 },
      async execute(args): Promise<ToolResult> {
        const amount = Number(args.amount ?? 0);
        state.refunds = state.refunds.filter((r) => r.id !== args.refundId);
        return {
          ok: true,
          note: `Reversed refund ${args.refundId} ($${amount})`,
          cost: { amount: -amount, currency: "USD" },
        };
      },
    },
    {
      name: "comms.send_email",
      description: "Send customer email",
      parameters: {
        type: "object",
        properties: { to: { type: "string" }, body: { type: "string" } },
        required: ["to", "body"],
      },
      permission: { category: "communicate", riskLevel: 4, requiresApproval: true },
      async execute(args): Promise<ToolResult> {
        state.messages.push({ to: String(args.to), body: String(args.body) });
        return { ok: true, note: `Emailed ${args.to}` };
      },
    },
    {
      name: "ops.restart_service",
      description: "Restart an internal service",
      parameters: {
        type: "object",
        properties: { service: { type: "string" } },
        required: ["service"],
      },
      permission: { category: "system", riskLevel: 4, requiresApproval: true },
      async execute(args): Promise<ToolResult> {
        return { ok: true, note: `Restarted ${args.service}`, compensator: "ops.mark_incident" };
      },
    },
    {
      name: "ops.mark_incident",
      description: "Mark compensation incident",
      parameters: {
        type: "object",
        properties: { service: { type: "string" } },
        required: ["service"],
      },
      permission: { category: "system", riskLevel: 2 },
      async execute(args): Promise<ToolResult> {
        return { ok: true, note: `Incident marked for ${args.service}` };
      },
    },
    {
      name: "agent.handoff",
      description: "Hand work to another department agent",
      parameters: {
        type: "object",
        properties: {
          toAgent: { type: "string" },
          obligation: { type: "string" },
        },
        required: ["toAgent", "obligation"],
      },
      permission: { category: "delegate", riskLevel: 1 },
      async execute(args): Promise<ToolResult> {
        return {
          ok: true,
          data: { toAgent: args.toAgent, obligation: args.obligation },
          note: `Handed off to ${args.toAgent}: ${args.obligation}`,
        };
      },
    },
  ];
}

export function registryOf(tools: Tool[]): ToolMap {
  return new Map(tools.map((t) => [t.name, t]));
}
