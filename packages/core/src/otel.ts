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
}

const spans: GenAiSpan[] = [];
let seq = 0;

export function resetSpans(): void {
  spans.length = 0;
  seq = 0;
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
}

export function listSpans(): GenAiSpan[] {
  return [...spans];
}
