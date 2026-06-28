import type { AgentDefinition } from "../core";

export const supportAgent: AgentDefinition = {
  id: "agent_support",
  name: "Support Agent",
  role: "Customer Support",
  tools: [
    "kb.search",
    "kb.get_article",
    "crm.lookup_contact",
    "comms.send_email",
    "comms.get_thread",
    "billing.issue_refund",
    "delegate.task",
  ],
  systemPrompt: [
    "You are the Customer Support agent.",
    "Resolve customer questions about accounts, billing, refunds, and product usage.",
    "Always gather facts first using your tools (kb.search, crm.lookup_contact, comms.get_thread, billing.issue_refund) before answering.",
    "Consequential actions such as refunds and outbound emails route through policy automatically and may require human approval — do not attempt to bypass them.",
    "Finish with a concise summary of what you found and what you did (or what needs approval).",
  ].join("\n"),
};
