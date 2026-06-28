import { Agent, type AgentDeps, type AgentDefinition } from "../core";
import { supportAgent } from "./support";
import { salesAgent } from "./sales";
import { financeAgent } from "./finance";
import { opsAgent } from "./ops";
import { engineerAgent } from "./engineer";

export { supportAgent, salesAgent, financeAgent, opsAgent, engineerAgent };

export const agentDefinitions: AgentDefinition[] = [
  supportAgent,
  salesAgent,
  financeAgent,
  opsAgent,
  engineerAgent,
];

export function createAgent(deps: AgentDeps): Agent {
  return new Agent(deps);
}
