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
    console.log(`\n  CorpOS control plane → http://localhost:${port}\n`);
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
 * Default simulation when no live LLM key is set. Dispatches per-agent so
 * each department gets appropriate canned behavior with an independent step
 * counter — e.g. ops diagnoses a degraded service rather than echoing the
 * support refund flow. Uses real seeded data (Ada / sub_ada_pro).
 */
function scriptedCompany() {
  const steps = new Map<string, number>();
  const step = (key: string): number => {
    const n = (steps.get(key) ?? 0) + 1;
    steps.set(key, n);
    return n;
  };
  const has = (req: { tools?: Array<{ name: string }> }, name: string): boolean =>
    Boolean(req.tools?.some((t) => t.name === name));

  return (req: { tools?: Array<{ name: string }> }) => {
    // Operations / Engineering: diagnose a degraded service, propose restart.
    if (has(req, "system.get_health")) {
      const n = step("ops");
      if (n === 1)
        return {
          toolCalls: [{ name: "system.get_health", arguments: {} }],
        };
      if (n === 2)
        return {
          toolCalls: [{ name: "system.list_alerts", arguments: {} }],
        };
      if (n === 3 && has(req, "system.restart_service"))
        return {
          toolCalls: [
            { name: "system.restart_service", arguments: { serviceId: "svc_checkout_api" } },
          ],
        };
      return {
        content:
          "checkout-api was degraded with elevated error rates; restart initiated and health recovering.",
      };
    }

    // Finance: review a subscription and apply credit.
    if (has(req, "billing.apply_credit")) {
      const n = step("finance");
      if (n === 1)
        return {
          toolCalls: [
            { name: "billing.get_subscription", arguments: { subscriptionId: "sub_grace_team" } },
          ],
        };
      if (n === 2)
        return {
          toolCalls: [
            { name: "billing.apply_credit", arguments: { contactId: "ct_grace", amount: 25 } },
          ],
        };
      return { content: "Applied a $25 goodwill credit to Grace's Team subscription." };
    }

    // Sales: qualify a lead, update CRM.
    if (has(req, "crm.list_deals")) {
      const n = step("sales");
      if (n === 1)
        return {
          toolCalls: [{ name: "crm.list_deals", arguments: {} }],
        };
      if (n === 2)
        return {
          toolCalls: [{ name: "crm.lookup_contact", arguments: { email: "grace@example.com" } }],
        };
      return { content: "Grace's Team expansion deal is in negotiation; followed up via email." };
    }

    // Support (default): KB lookup → contact → approval-gated refund.
    const n = step("support");
    if (n === 1)
      return {
        toolCalls: [{ name: "kb.search", arguments: { query: "refund policy" } }],
      };
    if (n === 2)
      return {
        toolCalls: [{ name: "crm.lookup_contact", arguments: { email: "ada@example.com" } }],
      };
    if (n === 3)
      return {
        toolCalls: [
          {
            name: "billing.issue_refund",
            arguments: { subscriptionId: "sub_ada_pro", amount: 49 },
          },
        ],
      };
    return { content: "Refund of $49 initiated for Ada per the 30-day policy. Ticket closed." };
  };
}
