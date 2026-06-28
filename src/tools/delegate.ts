import { defineTool } from "../core";
import type { Tool } from "../core";
import { asStr } from "./state";

export function delegateTool(): Tool {
  return defineTool({
    name: "delegate.task",
    description:
      "Request handoff of a task to another agent. Requires approval; the orchestrator/app layer wires the actual delegation.",
    permission: { category: "delegate", requiresApproval: true },
    parameters: {
      type: "object",
      properties: {
        toAgentId: { type: "string", description: "Target agent id, e.g. agent_engineer." },
        title: { type: "string" },
        description: { type: "string" },
      },
      required: ["toAgentId", "title", "description"],
    },
    async execute(args) {
      const toAgentId = asStr(args.toAgentId) ?? "(unknown)";
      const title = asStr(args.title) ?? "(untitled)";
      return {
        ok: true,
        data: { toAgentId, title },
        note: `delegation requested (requires approval) — hand off "${title}" to ${toAgentId}; the orchestrator/app layer will create the task.`,
      };
    },
  });
}
