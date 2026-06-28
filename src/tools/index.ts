import type { Tool } from "../core";
import { knowledgeTools } from "./knowledge";
import { crmTools } from "./crm";
import { commsTools } from "./comms";
import { billingTools } from "./billing";
import { systemTools } from "./system";
import { delegateTool } from "./delegate";

export { state, resetState } from "./state";

export const allTools: Tool[] = [
  ...knowledgeTools(),
  ...crmTools(),
  ...commsTools(),
  ...billingTools(),
  ...systemTools(),
  delegateTool(),
];
