import { defineTool, newId, now } from "../core";
import type { Tool } from "../core";
import { state, asStr } from "./state";

export function crmTools(): Tool[] {
  return [
    defineTool({
      name: "crm.lookup_contact",
      description: "Look up a customer contact by email address.",
      permission: { category: "read" },
      parameters: {
        type: "object",
        properties: {
          email: { type: "string", description: "Contact email address." },
        },
        required: ["email"],
      },
      async execute(args) {
        const email = (asStr(args.email) ?? "").toLowerCase();
        const contact = state.contacts.find((c) => c.email.toLowerCase() === email);
        if (!contact) return { ok: false, error: `No contact with email ${email}` };
        return {
          ok: true,
          data: contact,
          note: `Found contact ${contact.name} (${contact.email}).`,
        };
      },
    }),
    defineTool({
      name: "crm.create_contact",
      description: "Create a new customer contact record.",
      permission: { category: "write" },
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          company: { type: "string" },
          plan: { type: "string" },
        },
        required: ["name", "email"],
      },
      async execute(args) {
        const name = asStr(args.name);
        const email = asStr(args.email);
        if (!name || !email) return { ok: false, error: "name and email are required" };
        if (state.contacts.some((c) => c.email.toLowerCase() === email.toLowerCase())) {
          return { ok: false, error: `Contact already exists with email ${email}` };
        }
        const contact = {
          id: newId("ct"),
          name,
          email,
          company: asStr(args.company),
          plan: asStr(args.plan) ?? "Free",
          status: "active",
          createdAt: now(),
        };
        state.contacts.push(contact);
        return { ok: true, data: contact, note: `Created contact ${contact.name}.` };
      },
    }),
    defineTool({
      name: "crm.update_contact",
      description: "Update fields on an existing contact.",
      permission: { category: "write" },
      parameters: {
        type: "object",
        properties: {
          contactId: { type: "string" },
          name: { type: "string" },
          email: { type: "string" },
          company: { type: "string" },
          plan: { type: "string" },
          status: { type: "string" },
        },
        required: ["contactId"],
      },
      async execute(args) {
        const id = asStr(args.contactId);
        const contact = state.contacts.find((c) => c.id === id);
        if (!contact) return { ok: false, error: `No contact with id ${id}` };
        const name = asStr(args.name);
        const email = asStr(args.email);
        const company = asStr(args.company);
        const plan = asStr(args.plan);
        const status = asStr(args.status);
        if (name) contact.name = name;
        if (email) contact.email = email;
        if (company) contact.company = company;
        if (plan) contact.plan = plan;
        if (status) contact.status = status;
        return { ok: true, data: contact, note: `Updated contact ${contact.name}.` };
      },
    }),
    defineTool({
      name: "crm.list_deals",
      description: "List sales deals, optionally filtered by contact or stage.",
      permission: { category: "read" },
      parameters: {
        type: "object",
        properties: {
          contactId: { type: "string" },
          stage: { type: "string" },
        },
      },
      async execute(args) {
        const contactId = asStr(args.contactId);
        const stage = asStr(args.stage);
        let deals = [...state.deals];
        if (contactId) deals = deals.filter((d) => d.contactId === contactId);
        if (stage) deals = deals.filter((d) => d.stage.toLowerCase() === stage.toLowerCase());
        return { ok: true, data: deals, note: `${deals.length} deal(s) found.` };
      },
    }),
  ];
}
