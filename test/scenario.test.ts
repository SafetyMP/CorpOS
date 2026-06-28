import { describe, it, expect } from "vitest";
import {
  createCompany,
  SimulationProvider,
  defineTool,
  Agent,
  type AgentDefinition,
} from "../src/core/index";

const tenant = "tenant_scenario";

const kbSearch = defineTool({
  name: "kb.search",
  description: "Search the knowledge base.",
  parameters: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  },
  permission: { category: "read" },
  execute: async () => ({
    ok: true,
    data: { policy: "refund-30d" },
    note: "KB: refunds permitted within 30 days",
  }),
});

const crmLookup = defineTool({
  name: "crm.lookup_contact",
  description: "Look up a contact.",
  parameters: {
    type: "object",
    properties: { contactId: { type: "string" } },
    required: ["contactId"],
  },
  permission: { category: "read" },
  execute: async () => ({
    ok: true,
    data: { name: "alice" },
    note: "Contact found: alice, account in good standing",
  }),
});

const issueRefund = defineTool({
  name: "billing.issue_refund",
  description: "Issue a refund.",
  parameters: {
    type: "object",
    properties: {
      contactId: { type: "string" },
      amount: { type: "number" },
    },
    required: ["contactId", "amount"],
  },
  permission: { category: "spend" },
  execute: async (args) => ({
    ok: true,
    cost: { amount: Number(args.amount), currency: "USD" },
    note: `Refund of $${args.amount} issued to ${args.contactId}`,
  }),
});

const provider = new SimulationProvider((req) => {
  const last = req.messages[req.messages.length - 1];
  const text = last?.content ?? "";
  if (last?.role === "tool" && /refund of/i.test(text)) {
    return { content: "Refund processed and the customer notified. Case closed." };
  }
  if (last?.role === "tool" && /contact found/i.test(text)) {
    return { toolCalls: [{ name: "billing.issue_refund", arguments: { contactId: "c1", amount: 40 } }] };
  }
  if (last?.role === "tool" && /kb:|refunds permitted/i.test(text)) {
    return { toolCalls: [{ name: "crm.lookup_contact", arguments: { contactId: "c1" } }] };
  }
  return { toolCalls: [{ name: "kb.search", arguments: { query: "refund policy" } }] };
});

const support: AgentDefinition = {
  id: "agent_support",
  name: "Support",
  role: "Customer Support",
  systemPrompt: "Resolve the refund request using your tools.",
  tools: ["kb.search", "crm.lookup_contact", "billing.issue_refund"],
  maxSteps: 6,
};

const finance: AgentDefinition = {
  id: "agent_finance",
  name: "Finance",
  role: "Finance",
  systemPrompt: "Manage billing and refunds.",
  tools: ["billing.issue_refund"],
  maxSteps: 4,
};

function assertSubsequence(types: string[], expected: string[]): void {
  let i = 0;
  for (const t of types) {
    if (i < expected.length && t === expected[i]) i++;
  }
  expect(i).toBe(expected.length);
}

describe("multi-agent refund scenario", () => {
  it("routes a support refund through the approval gate to completion", async () => {
    const runtime = createCompany({
      provider,
      config: { store: { inMemory: true }, logLevel: "warn" },
      agentFactory: (deps) => new Agent(deps),
      agents: [support, finance],
      tools: [kbSearch, crmLookup, issueRefund],
    });

    expect(runtime.services.agents.size).toBe(2);

    const task = await runtime.submit({
      tenantId: tenant,
      title: "Customer refund request",
      description: "Customer c1 wants a refund.",
      assignedTo: "agent_support",
    });

    const paused = await runtime.services.orchestrator.runToCompletion(task);
    expect(paused?.state).toBe("awaiting_approval");

    const pending = runtime.services.store.pendingApprovals();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.tool).toBe("billing.issue_refund");
    const approvalId = pending[0]!.id;

    runtime.services.policy.decide(approvalId, "approved", "manager");
    await runtime.services.orchestrator.resume(approvalId);

    const finished = await runtime.services.orchestrator.runToCompletion(task);
    expect(finished?.state).toBe("succeeded");
    expect(runtime.services.store.spendForTask(tenant, task.id)).toBe(40);

    const types = runtime.services.bus.filter().map((e) => e.type);
    assertSubsequence(types, [
      "task.queued",
      "task.assigned",
      "tool.call",
      "approval.requested",
      "approval.approved",
      "agent.succeeded",
    ]);

    runtime.services.close();
  });
});
