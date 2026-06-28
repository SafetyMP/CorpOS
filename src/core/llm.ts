import type {
  ChatMessage,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  ToolCall,
  ToolSchema,
} from "./types";

// ─── Simulation provider ─────────────────────────────────────────────
// Deterministic, offline provider. Two modes:
//  1. script: a queue of canned assistant messages consumed in order.
//  2. handler: a function that inspects the last user/assistant turn and
//     returns the next response. This lets the simulation react to tool
//     results so full multi-step agent runs are reproducible without network.

export type SimulationResponse = {
  content?: string;
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  finishReason?: LLMResponse["finishReason"];
};

export type SimulationHandler = (req: LLMRequest) => SimulationResponse | Promise<SimulationResponse>;

export class SimulationProvider implements LLMProvider {
  readonly id = "simulation";
  private script: SimulationResponse[] = [];
  private handler?: SimulationHandler;
  private cursor = 0;

  constructor(source: SimulationResponse[] | SimulationHandler) {
    if (typeof source === "function") this.handler = source as SimulationHandler;
    else this.script = source;
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const sim = this.handler
      ? await this.handler(req)
      : (this.script[this.cursor++] ?? { content: "(no further scripted response)", finishReason: "stop" });

    const toolCalls: ToolCall[] = (sim.toolCalls ?? []).map((tc, i) => ({
      id: `call_${this.cursor}_${i}_${Math.random().toString(36).slice(2, 8)}`,
      name: tc.name,
      arguments: tc.arguments,
    }));

    const message: ChatMessage = {
      role: "assistant",
      content: sim.content ?? "",
      toolCalls: toolCalls.length ? toolCalls : undefined,
    };

    return {
      message,
      toolCalls,
      finishReason: toolCalls.length ? "tool_calls" : (sim.finishReason ?? "stop"),
      usage: {
        promptTokens: JSON.stringify(req.messages).length,
        completionTokens: (sim.content ?? "").length,
      },
    };
  }

  get remaining(): number {
    return Math.max(0, this.script.length - this.cursor);
  }
}

// ─── OpenAI-compatible provider (Z.AI default) ───────────────────────
// Calls /chat/completions with function-style tools. Works against Z.AI
// (https://open.bigmodel.cn/api/paas/v4) and any OpenAI-compatible base URL.

export interface HttpProviderOptions {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  /** Extra request headers (e.g. OpenRouter's HTTP-Referer / X-Title). */
  extraHeaders?: Record<string, string>;
  /** Override fetch (for tests / proxies). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class HttpLLMProvider implements LLMProvider {
  readonly id: string;
  private opts: HttpProviderOptions;

  constructor(id: string, opts: HttpProviderOptions) {
    this.id = id;
    this.opts = { timeoutMs: 60_000, ...opts };
  }

  async complete(req: LLMRequest): Promise<LLMResponse> {
    const fetchImpl = this.opts.fetchImpl ?? globalThis.fetch;
    const model = req.model ?? this.opts.defaultModel;
    const body: Record<string, unknown> = {
      model,
      messages: req.messages.map(serializeMessage),
      temperature: req.temperature ?? 0.2,
    };
    if (req.maxTokens) body.max_tokens = req.maxTokens;
    if (req.tools && req.tools.length) {
      body.tools = req.tools.map(toOpenAITool);
      body.tool_choice = "auto";
    }

    const url = `${this.opts.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.opts.apiKey}`,
          ...(this.opts.extraHeaders ?? {}),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 500)}`);
      }
      const json = (await res.json()) as {
        choices: Array<{
          message: {
            role: string;
            content: string | null;
            tool_calls?: Array<{
              id: string;
              type: "function";
              function: { name: string; arguments: string };
            }>;
          };
          finish_reason: string;
        }>;
        usage?: { prompt_tokens: number; completion_tokens: number };
      };
      const choice = json.choices[0];
      if (!choice) throw new Error("LLM returned no choices");

      const toolCalls: ToolCall[] = (choice.message.tool_calls ?? []).map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: safeParseArgs(tc.function.arguments),
      }));

      const message: ChatMessage = {
        role: "assistant",
        content: choice.message.content ?? "",
        toolCalls: toolCalls.length ? toolCalls : undefined,
      };

      return {
        message,
        toolCalls,
        finishReason:
          toolCalls.length || choice.finish_reason === "tool_calls"
            ? "tool_calls"
            : choice.finish_reason === "length"
              ? "length"
              : "stop",
        usage: {
          promptTokens: json.usage?.prompt_tokens ?? 0,
          completionTokens: json.usage?.completion_tokens ?? 0,
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

function serializeMessage(m: ChatMessage) {
  if (m.role === "tool") {
    return {
      role: "tool",
      tool_call_id: m.toolCallId,
      content: m.content,
    };
  }
  return {
    role: m.role,
    content: m.content,
    ...(m.toolCalls
      ? {
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        }
      : {}),
  };
}

function toOpenAITool(t: ToolSchema) {
  return {
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  };
}

function safeParseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { _raw: raw };
  }
}

// ─── Factory ─────────────────────────────────────────────────────────

export type ProviderKind = "simulation" | "http" | "zai" | "openai" | "openrouter";

export interface ProviderConfig {
  provider?: ProviderKind;
  simulation?: SimulationResponse[] | SimulationHandler;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

interface HttpPreset {
  keyEnv: string[];
  baseUrlEnv: string[];
  defaultBaseUrl: string;
  modelEnv: string[];
  defaultModel: string;
  extraHeaders?: Record<string, string>;
}

const PRESETS: Record<"zai" | "openai" | "openrouter", HttpPreset> = {
  zai: {
    keyEnv: ["ZAI_API_KEY", "OPENAI_API_KEY"],
    baseUrlEnv: ["ZAI_BASE_URL", "OPENAI_BASE_URL"],
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    modelEnv: ["ZAI_MODEL"],
    defaultModel: "glm-4.6",
  },
  openai: {
    keyEnv: ["OPENAI_API_KEY"],
    baseUrlEnv: ["OPENAI_BASE_URL"],
    defaultBaseUrl: "https://api.openai.com/v1",
    modelEnv: ["OPENAI_MODEL"],
    defaultModel: "gpt-4o-mini",
  },
  openrouter: {
    keyEnv: ["OPENROUTER_API_KEY"],
    baseUrlEnv: ["OPENROUTER_BASE_URL"],
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    modelEnv: ["OPENROUTER_MODEL"],
    // OpenRouter uses the vendor/model slug format. "Owl Alpha" maps to a
    // slug you configure via OPENROUTER_MODEL; default kept as a sentinel.
    defaultModel: "openrouter/owl-alpha",
    extraHeaders: {
      "HTTP-Referer": process.env.OPENROUTER_REFERER ?? "https://ai-company.local",
      "X-Title": process.env.OPENROUTER_TITLE ?? "ai-company",
    },
  },
};

function resolveEnv(names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v) return v;
  }
  return undefined;
}

export function createProvider(cfg: ProviderConfig = {}): LLMProvider {
  const explicit = cfg.provider;
  if (explicit === "simulation" || (!explicit && !cfg.simulation && !cfg.apiKey)) {
    if (cfg.simulation) return new SimulationProvider(cfg.simulation);
  }

  const httpKind: "zai" | "openai" | "openrouter" | undefined =
    explicit === "http" ? "openrouter" : (explicit as "zai" | "openai" | "openrouter" | undefined);

  // Determine which preset to use and whether a key is available.
  let preset: HttpPreset | undefined;
  if (httpKind) {
    preset = PRESETS[httpKind];
  } else {
    // Auto-detect by whichever key is present (openrouter wins over zai/openai).
    preset =
      [PRESETS.openrouter, PRESETS.zai, PRESETS.openai].find((p) =>
        p.keyEnv.some((e) => process.env[e])
      ) ?? undefined;
  }

  const apiKey = cfg.apiKey ?? (preset ? resolveEnv(preset.keyEnv) : undefined);

  if (explicit && explicit !== "simulation" && !apiKey) {
    throw new Error(
      `LLM provider '${explicit}' requested but no API key found (checked: ${preset?.keyEnv.join(", ") ?? "none"}).`
    );
  }

  if (preset && apiKey) {
    const baseUrl =
      cfg.baseUrl ?? resolveEnv(preset.baseUrlEnv) ?? preset.defaultBaseUrl;
    const model = cfg.model ?? resolveEnv(preset.modelEnv) ?? preset.defaultModel;
    return new HttpLLMProvider(explicit ?? "openrouter", {
      apiKey,
      baseUrl,
      defaultModel: model,
      extraHeaders: preset.extraHeaders,
    });
  }

  // Fallback: a simulation that always finishes (safe default, no network).
  return new SimulationProvider([
    { content: "Simulation provider active (no live LLM key). Finishing.", finishReason: "stop" },
  ]);
}
