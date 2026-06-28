import {
  Agent,
  SimulationProvider,
  createCompany,
  defineTool,
  type AgentDefinition,
} from "../src/core/index";

const tenant = "tenant_demo";

const echo = defineTool({
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
    data: { hits: [`result for ${args.query}`] },
    note: `Found 1 hit for "${args.query}"`,
  }),
});

// Scripted: one tool call, then a final answer.
const provider = new SimulationProvider([
  { toolCalls: [{ name: "kb.search", arguments: { query: "refund policy" } }] },
  { content: "Resolved: refund issued per 30-day policy." },
]);

const def: AgentDefinition = {
  id: "agent_support",
  name: "Support",
  role: "Customer Support",
  systemPrompt: "You are a support agent. Use kb.search then answer.",
  tools: ["kb.search"],
  maxSteps: 4,
};

const runtime = createCompany({
  provider,
  config: { store: { inMemory: true }, logLevel: "warn" },
  agentFactory: (deps) => new Agent(deps),
  agents: [def],
  tools: [echo],
});

const task = await runtime.submit({
  tenantId: tenant,
  title: "Customer refund request",
  description: "Customer wants a refund.",
  assignedTo: "agent_support",
});

const finished = await runtime.services.orchestrator.runToCompletion(task);
console.log("FINAL STATE:", finished?.state);
console.log("OUTPUT:", finished?.output?.summary);
console.log("EVENTS:", runtime.services.store.recentEvents().length);
runtime.services.close();
if (finished?.state !== "succeeded") {
  console.error("SMOKE TEST FAILED");
  process.exit(1);
}
console.log("SMOKE TEST OK");
