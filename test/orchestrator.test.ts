import { describe, it, expect } from "vitest";
import {
  createCompany,
  SimulationProvider,
  defineTool,
  Agent,
  type AgentDefinition,
} from "../src/core/index";

const tenant = "tenant_orch";

function lastMessage(req: { messages: Array<{ role: string; content?: string }> }) {
  return req.messages[req.messages.length - 1];
}

describe("Orchestrator", () => {
  it("runs a single-agent task to completion via the SimulationProvider", async () => {
    const kbSearch = defineTool({
      name: "kb.search",
      description: "Search the knowledge base.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
      permission: { category: "read" },
      execute: async (args) => ({
        ok: true,
        data: { hits: [String(args.query)] },
        note: `hits for ${args.query}`,
      }),
    });

    const provider = new SimulationProvider((req) => {
      const last = lastMessage(req);
      if (last?.role === "tool") return { content: "Done." };
      return { toolCalls: [{ name: "kb.search", arguments: { query: "policy" } }] };
    });

    const def: AgentDefinition = {
      id: "agent_test",
      name: "Test",
      role: "tester",
      systemPrompt: "Use kb.search then answer.",
      tools: ["kb.search"],
      maxSteps: 4,
    };

    const runtime = createCompany({
      provider,
      config: { store: { inMemory: true }, logLevel: "warn" },
      agentFactory: (deps) => new Agent(deps),
      agents: [def],
      tools: [kbSearch],
    });

    const task = await runtime.submit({
      tenantId: tenant,
      title: "Look up policy",
      description: "find the policy",
      assignedTo: "agent_test",
    });
    const finished = await runtime.services.orchestrator.runToCompletion(task);
    expect(finished?.state).toBe("succeeded");
    expect(finished?.output?.summary).toBe("Done.");
    runtime.services.close();
  });

  it("retries a task after a transient provider failure", async () => {
    let calls = 0;
    const provider = new SimulationProvider(() => {
      calls++;
      if (calls === 1) throw new Error("transient provider failure");
      return { content: "Recovered and finished." };
    });

    const def: AgentDefinition = {
      id: "agent_retry",
      name: "Retry",
      role: "tester",
      systemPrompt: "Answer directly.",
      tools: [],
      maxSteps: 2,
    };

    const runtime = createCompany({
      provider,
      config: { store: { inMemory: true }, logLevel: "warn" },
      agentFactory: (deps) => new Agent(deps),
      agents: [def],
    });

    const task = await runtime.submit({
      tenantId: tenant,
      title: "Flaky job",
      description: "fails once then succeeds",
      assignedTo: "agent_retry",
      maxAttempts: 3,
    });
    const finished = await runtime.services.orchestrator.runToCompletion(task, { timeoutMs: 5000 });
    expect(finished?.state).toBe("succeeded");
    expect(finished?.attempts).toBe(2);
    runtime.services.close();
  });

  it("pauses on an approval-gated tool and resumes after approval", async () => {
    const payout = defineTool({
      name: "billing.payout",
      description: "Issue a payout.",
      parameters: {
        type: "object",
        properties: { amount: { type: "number" } },
        required: ["amount"],
      },
      permission: { category: "spend" },
      execute: async (args) => ({
        ok: true,
        cost: { amount: Number(args.amount), currency: "USD" },
        note: `Payout of $${args.amount} sent`,
      }),
    });

    const provider = new SimulationProvider((req) => {
      const last = lastMessage(req);
      if (last?.role === "tool" && /payout/i.test(last.content ?? "")) {
        return { content: "Payout complete." };
      }
      return { toolCalls: [{ name: "billing.payout", arguments: { amount: 50 } }] };
    });

    const def: AgentDefinition = {
      id: "agent_pay",
      name: "Pay",
      role: "finance",
      systemPrompt: "Issue the payout.",
      tools: ["billing.payout"],
      maxSteps: 4,
    };

    const runtime = createCompany({
      provider,
      config: { store: { inMemory: true }, logLevel: "warn" },
      agentFactory: (deps) => new Agent(deps),
      agents: [def],
      tools: [payout],
    });

    const task = await runtime.submit({
      tenantId: tenant,
      title: "Send payout",
      description: "pay the vendor",
      assignedTo: "agent_pay",
    });

    const paused = await runtime.services.orchestrator.runToCompletion(task);
    expect(paused?.state).toBe("awaiting_approval");

    const pending = runtime.services.store.pendingApprovals();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.tool).toBe("billing.payout");
    const approvalId = pending[0]!.id;

    runtime.services.policy.decide(approvalId, "approved", "tester");
    await runtime.services.orchestrator.resume(approvalId);

    const finished = await runtime.services.orchestrator.runToCompletion(task);
    expect(finished?.state).toBe("succeeded");
    expect(runtime.services.store.spendForTask(tenant, task.id)).toBe(50);
    runtime.services.close();
  });
});
