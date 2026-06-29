import { defineTool, newId, now } from "../core";
import type { Tool } from "../core";
import { state, asStr } from "./state";

export function commsTools(): Tool[] {
  return [
    defineTool({
      name: "comms.send_email",
      description: "Send an outbound email to a customer.",
      permission: { category: "communicate" },
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address." },
          subject: { type: "string" },
          body: { type: "string" },
          contactId: { type: "string" },
        },
        required: ["to", "subject", "body"],
      },
      async execute(args) {
        const to = asStr(args.to);
        const subject = asStr(args.subject);
        const body = asStr(args.body);
        if (!to || !subject || !body) {
          return { ok: false, error: "to, subject and body are required" };
        }
        let contactId = asStr(args.contactId);
        if (!contactId) {
          const found = state.contacts.find((c) => c.email.toLowerCase() === to.toLowerCase());
          contactId = found?.id;
        }
        const record = {
          id: newId("comm"),
          channel: "email" as const,
          direction: "outbound" as const,
          to,
          subject,
          body,
          contactId,
          contactEmail: to,
          threadId: newId("thread"),
          ts: now(),
        };
        state.commsLog.push(record);
        return { ok: true, data: { id: record.id, to, subject }, note: `Email sent to ${to}.` };
      },
    }),
    defineTool({
      name: "comms.send_slack",
      description: "Post a message to an internal Slack channel.",
      permission: { category: "communicate" },
      parameters: {
        type: "object",
        properties: {
          channel: { type: "string", description: "Slack channel name, e.g. #ops." },
          message: { type: "string" },
        },
        required: ["channel", "message"],
      },
      async execute(args) {
        const channel = asStr(args.channel);
        const message = asStr(args.message);
        if (!channel || !message) {
          return { ok: false, error: "channel and message are required" };
        }
        const record = {
          id: newId("comm"),
          channel: "slack" as const,
          direction: "outbound" as const,
          to: channel,
          body: message,
          threadId: newId("thread"),
          ts: now(),
        };
        state.commsLog.push(record);
        return {
          ok: true,
          data: { id: record.id, channel },
          note: `Slack message posted to ${channel}.`,
        };
      },
    }),
    defineTool({
      name: "comms.get_thread",
      description: "Retrieve the communication history for a contact by email.",
      permission: { category: "communicate" },
      parameters: {
        type: "object",
        properties: {
          contactEmail: { type: "string", description: "Contact email to look up." },
        },
        required: ["contactEmail"],
      },
      async execute(args) {
        const email = (asStr(args.contactEmail) ?? "").toLowerCase();
        const contact = state.contacts.find((c) => c.email.toLowerCase() === email);
        if (!contact) return { ok: false, error: `No contact with email ${email}` };
        const thread = state.commsLog
          .filter(
            (m) => m.contactId === contact.id || (m.contactEmail ?? "").toLowerCase() === email,
          )
          .sort((a, b) => a.ts.localeCompare(b.ts));
        return {
          ok: true,
          data: { contact, thread },
          note: `${thread.length} message(s) in thread for ${contact.email}.`,
        };
      },
    }),
  ];
}
