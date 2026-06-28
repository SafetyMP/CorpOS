import type { Tool, ToolCategory, ToolHandler, ToolPermission } from "./types";

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON schema describing the parameters the agent may pass. */
  parameters: Record<string, unknown>;
  permission: Partial<ToolPermission> & { category: ToolCategory };
  execute: ToolHandler;
}

/**
 * Define a tool concisely. `category` is required; `costCap` and
 * `requiresApproval` default based on category (spend/communicate default
 * to approval; read defaults to no approval).
 */
export function defineTool(spec: ToolSpec): Tool {
  const permission: ToolPermission = normalizePermission(spec.permission);
  return {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    permission,
    execute: spec.execute,
  };
}

function normalizePermission(p: ToolSpec["permission"]): ToolPermission {
  const requiresApproval =
    p.requiresApproval ??
    (p.category === "spend" || p.category === "communicate");
  return {
    category: p.category,
    costCap: p.costCap,
    requiresApproval,
  };
}
