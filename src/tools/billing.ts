import { defineTool, newId } from "../core";
import type { Tool } from "../core";
import { state, asStr, asNum } from "./state";

export function billingTools(): Tool[] {
  return [
    defineTool({
      name: "billing.get_subscription",
      description: "Look up the subscription for a contact.",
      permission: { category: "read" },
      parameters: {
        type: "object",
        properties: {
          contactId: { type: "string", description: "Contact id." },
        },
        required: ["contactId"],
      },
      async execute(args) {
        const contactId = asStr(args.contactId);
        const sub = state.subscriptions.find((s) => s.contactId === contactId);
        if (!sub) return { ok: false, error: `No subscription for contact ${contactId}` };
        return {
          ok: true,
          data: sub,
          note: `Subscription ${sub.id} (${sub.plan}, ${sub.amount} ${sub.currency}/term).`,
        };
      },
    }),
    defineTool({
      name: "billing.issue_refund",
      description: "Issue a refund against a subscription. Spend-gated and capped at $100.",
      permission: { category: "spend", costCap: 100, requiresApproval: true },
      parameters: {
        type: "object",
        properties: {
          subscriptionId: { type: "string" },
          amount: { type: "number", minimum: 0, description: "Refund amount in USD." },
        },
        required: ["subscriptionId", "amount"],
      },
      async execute(args) {
        const subscriptionId = asStr(args.subscriptionId);
        const amount = asNum(args.amount);
        if (!subscriptionId) return { ok: false, error: "subscriptionId is required" };
        if (amount === undefined || amount <= 0) {
          return { ok: false, error: "amount must be a positive number" };
        }
        const sub = state.subscriptions.find((s) => s.id === subscriptionId);
        if (!sub) return { ok: false, error: `No subscription with id ${subscriptionId}` };
        const ref = newId("refund");
        return {
          ok: true,
          data: { ref, subscriptionId: sub.id, amount, currency: "USD" },
          cost: { amount, currency: "USD" },
          note: `Refund of $${amount} issued on subscription ${sub.id} (ref ${ref}).`,
        };
      },
    }),
    defineTool({
      name: "billing.apply_credit",
      description: "Apply account credit to a contact. Spend-gated and capped at $100.",
      permission: { category: "spend", costCap: 100, requiresApproval: true },
      parameters: {
        type: "object",
        properties: {
          contactId: { type: "string" },
          amount: { type: "number", minimum: 0, description: "Credit amount in USD." },
        },
        required: ["contactId", "amount"],
      },
      async execute(args) {
        const contactId = asStr(args.contactId);
        const amount = asNum(args.amount);
        if (!contactId) return { ok: false, error: "contactId is required" };
        if (amount === undefined || amount <= 0) {
          return { ok: false, error: "amount must be a positive number" };
        }
        const contact = state.contacts.find((c) => c.id === contactId);
        if (!contact) return { ok: false, error: `No contact with id ${contactId}` };
        const ref = newId("credit");
        return {
          ok: true,
          data: { ref, contactId: contact.id, contact: contact.name, amount, currency: "USD" },
          cost: { amount, currency: "USD" },
          note: `Credit of $${amount} applied to ${contact.name} (ref ${ref}).`,
        };
      },
    }),
  ];
}
