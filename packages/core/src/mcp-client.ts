import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ToolResult } from "./types.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function withKnowledgeMcp(
  fn: (
    invoke: (name: string, args: Record<string, unknown>) => Promise<ToolResult>,
  ) => Promise<void>,
  serverCommand?: { command: string; args: string[] },
): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const defaultServer = path.resolve(here, "../../../mcp-knowledge/dist/server.js");
  const command = serverCommand?.command ?? process.execPath;
  const args = serverCommand?.args ?? [defaultServer];

  const transport = new StdioClientTransport({ command, args });
  const client = new Client({ name: "corpos-gateway", version: "0.2.0" });
  await client.connect(transport);
  try {
    const invoke = async (name: string, toolArgs: Record<string, unknown>): Promise<ToolResult> => {
      const mcpName = name === "knowledge.search" ? "search" : name;
      const result = await client.callTool({ name: mcpName, arguments: toolArgs });
      const text = Array.isArray(result.content)
        ? result.content.map((c) => ("text" in c ? String(c.text) : JSON.stringify(c))).join("\n")
        : JSON.stringify(result.content);
      return { ok: !result.isError, note: text, data: result.content };
    };
    await fn(invoke);
  } finally {
    await client.close();
  }
}

export async function mcpKnowledgeSearch(
  query: string,
  serverCommand?: { command: string; args: string[] },
): Promise<ToolResult> {
  let out: ToolResult = { ok: false, error: "not run" };
  await withKnowledgeMcp(async (invoke) => {
    out = await invoke("knowledge.search", { query });
  }, serverCommand);
  return out;
}
