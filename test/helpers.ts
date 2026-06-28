import type { Logger, ToolContext } from "../src/core/index";

export const silentLogger: Logger = {
  child: () => silentLogger,
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  audit: () => {},
};

export function mkCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    agentId: "agent_test",
    taskId: "task_test",
    tenantId: "tenant_test",
    logger: silentLogger,
    ...overrides,
  };
}
