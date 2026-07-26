import type { LLMProvider, LLMRequest, LLMResponse, ToolCall } from "./types.js";
import { newId } from "./id.js";

/** Deterministic provider for CI / company-day. */
export class SimulationProvider implements LLMProvider {
  readonly id = "simulation";
  private scripts: Map<string, ToolCall[][]>;

  constructor(scripts: Record<string, ToolCall[][]> = {}) {
    this.scripts = new Map(Object.entries(scripts));
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const system = request.messages.find((m) => m.role === "system")?.content ?? "";
    const agentKey =
      Object.keys(Object.fromEntries(this.scripts)).find((k) => system.includes(k)) ??
      [...this.scripts.keys()][0];
    const queue = agentKey ? this.scripts.get(agentKey) : undefined;
    const step = queue?.shift() ?? [];
    if (!step.length) {
      return {
        message: { role: "assistant", content: "Done." },
        toolCalls: [],
        finishReason: "stop",
        usage: { promptTokens: 10, completionTokens: 5 },
      };
    }
    return {
      message: {
        role: "assistant",
        content: "",
        toolCalls: step,
      },
      toolCalls: step,
      finishReason: "tool_calls",
      usage: { promptTokens: 20, completionTokens: 15 },
    };
  }
}

export function tc(name: string, args: Record<string, unknown>): ToolCall {
  return { id: newId("tc"), name, arguments: args };
}
