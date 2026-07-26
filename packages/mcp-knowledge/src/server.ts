#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const KB: Record<string, string> = {
  refund: "Refunds under $100 may be issued after CRM lookup.",
  sla: "Support SLA is 4 hours for refund requests.",
  policy: "Humans govern by exception; autonomy is earned.",
};

const server = new McpServer({ name: "corpos-knowledge", version: "0.2.0" });

server.tool("search", "Search CorpOS knowledge base", { query: z.string() }, async ({ query }) => {
  const q = query.toLowerCase();
  const hit = Object.entries(KB).find(([k, v]) => q.includes(k) || v.toLowerCase().includes(q));
  const text = hit ? `${hit[0]}: ${hit[1]}` : "No KB hit";
  return { content: [{ type: "text", text }] };
});

const transport = new StdioServerTransport();
await server.connect(transport);
