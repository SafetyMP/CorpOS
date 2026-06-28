import type { Tool, ToolContext, ToolResult, ToolSchema } from "./types";

export { defineTool } from "./tool-builder";

export class ToolRegistry {
  private tools = new Map<string, Tool>();
  private aliases = new Map<string, string>();

  register(tool: Tool): this {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    return this;
  }

  registerAll(tools: Tool[]): this {
    for (const t of tools) this.register(t);
    return this;
  }

  /** Register a name that maps to an existing tool (e.g. a department alias). */
  alias(alias: string, canonical: string): this {
    this.aliases.set(alias, canonical);
    return this;
  }

  get(name: string): Tool | undefined {
    const canonical = this.aliases.get(name) ?? name;
    return this.tools.get(canonical);
  }

  has(name: string): boolean {
    return this.get(name) !== undefined;
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }

  /** Build the tool schemas the LLM should see for a given subset of names. */
  schemasFor(names: string[]): ToolSchema[] {
    const out: ToolSchema[] = [];
    for (const name of names) {
      const tool = this.get(name);
      if (tool) out.push(schemaOf(tool));
    }
    return out;
  }

  async invoke(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<ToolResult> {
    const tool = this.get(name);
    if (!tool) return { ok: false, error: `Unknown tool: ${name}` };
    const validation = validateArgs(tool, args);
    if (!validation.ok) {
      return { ok: false, error: `Invalid arguments for ${name}: ${validation.error}` };
    }
    try {
      return await tool.execute(args, ctx);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: `Tool ${name} threw: ${msg}` };
    }
  }
}

export function schemaOf(tool: Tool): ToolSchema {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  };
}

// ─── Minimal JSON-schema validator ───────────────────────────────────
// Covers the subset tools actually use: type, required, properties,
// enum, items, additionalProperties. Avoids pulling ajv as a dependency.

type ValidationResult = { ok: true } | { ok: false; error: string };

export function validateArgs(tool: Tool, args: Record<string, unknown>): ValidationResult {
  return validateValue(args, tool.parameters, "root");
}

function validateValue(
  value: unknown,
  schema: Record<string, unknown>,
  path: string
): ValidationResult {
  if (typeof schema !== "object" || schema === null) return { ok: true };

  if (schema["type"] !== undefined) {
    if (!matchesType(value, schema["type"] as string)) {
      return { ok: false, error: `${path}: expected ${schema["type"]}, got ${typeof value}` };
    }
  }

  if (schema["enum"] !== undefined) {
    const allowed = schema["enum"] as unknown[];
    if (!allowed.includes(value)) {
      return { ok: false, error: `${path}: ${JSON.stringify(value)} not in enum ${JSON.stringify(allowed)}` };
    }
  }

  if (schema["type"] === "object" && typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    const required = (schema["required"] as string[] | undefined) ?? [];
    for (const key of required) {
      if (!(key in obj)) return { ok: false, error: `${path}: missing required '${key}'` };
    }
    const props = (schema["properties"] as Record<string, Record<string, unknown>> | undefined) ?? {};
    for (const [key, sub] of Object.entries(props)) {
      if (key in obj) {
        const r = validateValue(obj[key], sub, `${path}.${key}`);
        if (!r.ok) return r;
      }
    }
  }

  if (schema["type"] === "array" && Array.isArray(value)) {
    const items = schema["items"] as Record<string, unknown> | undefined;
    if (items) {
      for (let i = 0; i < value.length; i++) {
        const r = validateValue(value[i], items, `${path}[${i}]`);
        if (!r.ok) return r;
      }
    }
  }

  return { ok: true };
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
    case "integer":
      return typeof value === "number" && (type !== "integer" || Number.isInteger(value));
    case "boolean":
      return typeof value === "boolean";
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "null":
      return value === null;
    default:
      return true;
  }
}
