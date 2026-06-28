import { readFileSync } from "node:fs";
import { createCompany, SimulationProvider, createProvider } from "./core";
import { agentDefinitions, createAgent } from "./agents";
import { allTools } from "./tools";
import { createHttpServer } from "./api";

/**
 * Minimal .env loader — populates process.env from a local .env file if
 * present, without adding a dependency or editing the npm manifest. Real
 * environment values always win (never overwrite with file values).
 */
function loadEnvFile(path = ".env"): void {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

function isScenario(): boolean {
  return process.argv.includes("--scenario");
}

async function main(): Promise<void> {
  loadEnvFile();
  const tenant = "tenant_default";

  // Simulation-first: use the live OpenRouter (Owl Alpha) provider only when a key is present.
  const hasKey = Boolean(process.env.OPENROUTER_API_KEY);
  const provider = hasKey
    ? createProvider({ provider: "openrouter" })
    : new SimulationProvider(scriptedCompany());

  const runtime = createCompany({
    provider,
    config: {
      store: { path: "data/company.db" },
      concurrency: 4,
      logLevel: (process.env.LOG_LEVEL as "debug" | "info" | "warn" | "error") ?? "info",
    },
    agentFactory: createAgent,
    agents: agentDefinitions,
    tools: allTools,
  });

  const { services } = runtime;

  if (isScenario()) {
    const { runScenario } = await import("./scenario");
    await runScenario(runtime, tenant);
    services.close();
    return;
  }

  const port = Number(process.env.PORT ?? 3000);
  const { server } = createHttpServer(services);
  server.listen(port, () => {
    services.log.info("server.listening", { port, provider: provider.id });
    console.log(`\n  ai-company control plane → http://localhost:${port}\n`);
  });

  const shutdown = (): void => {
    services.log.info("server.shutdown");
    services.close();
    server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});

/**
 * Default simulation script for the dashboard when no live LLM key is set.
 * Steps a support agent through a KB lookup + refund, pausing on the
 * approval gate so the dashboard's approval panel is demonstrable.
 */
function scriptedCompany() {
  let n = 0;
  return () => {
    n++;
    if (n === 1)
      return {
        toolCalls: [{ name: "kb.search", arguments: { query: "refund policy" } }],
      };
    if (n === 2)
      return {
        toolCalls: [
          { name: "crm.lookup_contact", arguments: { email: "alex@example.com" } },
        ],
      };
    if (n === 3)
      return {
        toolCalls: [
          {
            name: "billing.issue_refund",
            arguments: { subscriptionId: "sub_demo_1", amount: 49 },
          },
        ],
      };
    return { content: "Refund of $49 initiated for Alex per the 30-day policy. Ticket closed." };
  };
}
