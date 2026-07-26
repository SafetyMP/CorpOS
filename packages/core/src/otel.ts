/** Lightweight GenAI span buffer (OTel GenAI semantic conventions, Development). */

export type GenAiOperation =
  "invoke_agent" | "execute_tool" | "chat" | "create_agent" | "invoke_workflow";

export interface GenAiSpan {
  id: string;
  operation: GenAiOperation;
  name: string;
  attributes: Record<string, string | number | boolean>;
  startedAt: string;
  endedAt?: string;
  parentId?: string;
  decisionId?: string;
  auditSeq?: number;
  traceId: string;
}

const spans: GenAiSpan[] = [];
let seq = 0;
let activeTraceId = `trace_${Date.now().toString(36)}`;

export function resetSpans(): void {
  spans.length = 0;
  seq = 0;
  activeTraceId = `trace_${Date.now().toString(36)}`;
}

export function currentTraceId(): string {
  return activeTraceId;
}

export function startSpan(
  operation: GenAiOperation,
  name: string,
  attributes: Record<string, string | number | boolean> = {},
  parentId?: string,
): GenAiSpan {
  seq += 1;
  const span: GenAiSpan = {
    id: `span_${seq}`,
    operation,
    name,
    attributes: {
      "gen_ai.operation.name": operation,
      ...attributes,
    },
    startedAt: new Date().toISOString(),
    parentId,
    traceId: activeTraceId,
  };
  spans.push(span);
  return span;
}

export function endSpan(
  span: GenAiSpan,
  extra?: {
    decisionId?: string;
    auditSeq?: number;
    attributes?: Record<string, string | number | boolean>;
  },
): void {
  span.endedAt = new Date().toISOString();
  if (extra?.decisionId) span.decisionId = extra.decisionId;
  if (extra?.auditSeq !== undefined) span.auditSeq = extra.auditSeq;
  if (extra?.attributes) Object.assign(span.attributes, extra.attributes);
  void exportSpanOtlp(span);
}

export function listSpans(): GenAiSpan[] {
  return [...spans];
}

/** Optional OTLP/HTTP JSON export when CORPOS_OTLP_ENDPOINT is set. Soft-fails. */
async function exportSpanOtlp(span: GenAiSpan): Promise<void> {
  const endpoint = process.env.CORPOS_OTLP_ENDPOINT?.trim();
  if (!endpoint) return;
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    name: span.name,
                    traceId: span.traceId,
                    spanId: span.id,
                    attributes: Object.entries(span.attributes).map(([key, value]) => ({
                      key,
                      value:
                        typeof value === "string"
                          ? { stringValue: value }
                          : typeof value === "number"
                            ? { doubleValue: value }
                            : { boolValue: value },
                    })),
                  },
                ],
              },
            ],
          },
        ],
      }),
    });
  } catch {
    /* soft-fail: CI keeps in-memory buffer */
  }
}
