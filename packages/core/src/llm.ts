import type { LLMProvider, LLMRequest, LLMResponse, ToolCall } from "./types.js";
import { newId } from "./id.js";
import { endSpan, startSpan } from "./otel.js";

/** Deterministic provider for CI / company-day. */
export class SimulationProvider implements LLMProvider {
  readonly id = "simulation";
  private scripts: Map<string, ToolCall[][]>;

  constructor(scripts: Record<string, ToolCall[][]> = {}) {
    this.scripts = new Map(Object.entries(scripts));
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const span = startSpan("chat", "chat simulation", {
      "gen_ai.provider.name": "simulation",
      "gen_ai.request.model": "simulation",
    });
    const system = request.messages.find((m) => m.role === "system")?.content ?? "";
    const agentKey =
      Object.keys(Object.fromEntries(this.scripts)).find((k) => system.includes(k)) ??
      [...this.scripts.keys()][0];
    const queue = agentKey ? this.scripts.get(agentKey) : undefined;
    const step = queue?.shift() ?? [];
    endSpan(span);
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

/** Optional live provider via OpenRouter-compatible chat completions API. */
export class HttpLLMProvider implements LLMProvider {
  readonly id = "live";
  constructor(
    private opts: {
      apiKey: string;
      baseUrl?: string;
      model?: string;
    },
  ) {}

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model ?? this.opts.model ?? "openai/gpt-4o-mini";
    const span = startSpan("chat", "chat live", {
      "gen_ai.provider.name": "openrouter",
      "gen_ai.request.model": model,
    });
    const base = (this.opts.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: request.messages.map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
          ...(m.toolCalls
            ? {
                tool_calls: m.toolCalls.map((t) => ({
                  id: t.id,
                  type: "function",
                  function: { name: t.name, arguments: JSON.stringify(t.arguments) },
                })),
              }
            : {}),
        })),
        tools: request.tools?.map((t) => ({
          type: "function",
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })),
      }),
    });
    if (!res.ok) {
      endSpan(span, { attributes: { error: true } });
      throw new Error(`HttpLLMProvider ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as {
      choices: {
        message: {
          content?: string;
          tool_calls?: { id: string; function: { name: string; arguments: string } }[];
        };
      }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const msg = json.choices[0]?.message;
    const toolCalls: ToolCall[] = (msg?.tool_calls ?? []).map((t) => ({
      id: t.id,
      name: t.function.name,
      arguments: JSON.parse(t.function.arguments || "{}") as Record<string, unknown>,
    }));
    endSpan(span, {
      attributes: {
        "gen_ai.usage.input_tokens": json.usage?.prompt_tokens ?? 0,
        "gen_ai.usage.output_tokens": json.usage?.completion_tokens ?? 0,
      },
    });
    return {
      message: {
        role: "assistant",
        content: msg?.content ?? "",
        toolCalls: toolCalls.length ? toolCalls : undefined,
      },
      toolCalls,
      finishReason: toolCalls.length ? "tool_calls" : "stop",
      usage: {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
      },
    };
  }
}

export function resolveProvider(env: NodeJS.ProcessEnv = process.env): {
  provider: LLMProvider;
  mode: "simulation" | "live";
} {
  const key = env.OPENROUTER_API_KEY?.trim();
  const forceLive = env.CORPOS_PROVIDER === "live";
  if (key && (forceLive || env.CORPOS_PROVIDER !== "simulation")) {
    // Only report live when HttpLLMProvider is actually constructed.
    if (forceLive || env.CORPOS_ALLOW_LIVE === "1") {
      return {
        provider: new HttpLLMProvider({ apiKey: key }),
        mode: "live",
      };
    }
  }
  return { provider: new SimulationProvider(), mode: "simulation" };
}

export function tc(name: string, args: Record<string, unknown>): ToolCall {
  return { id: newId("tc"), name, arguments: args };
}
