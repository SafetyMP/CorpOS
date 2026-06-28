import { CoreLogger } from "./logger";
import { EventBus } from "./event-bus";
import { Store, newTask, type StoreOptions } from "./store";
import { ToolRegistry } from "./tool";
import { PolicyEngine, type PolicyRule } from "./policy";
import { MemoryStore } from "./memory";
import { Orchestrator } from "./orchestrator";
import type { Agent, AgentDeps } from "./agent";
import type { AgentDefinition, Logger, Task, Tool } from "./types";
import type { LLMProvider } from "./types";

export interface CompanyConfig {
  store?: StoreOptions;
  concurrency?: number;
  defaultEffect?: "allow" | "deny" | "approve";
  rules?: PolicyRule[];
  logLevel?: "debug" | "info" | "warn" | "error";
}

export interface CompanyServices {
  store: Store;
  bus: EventBus;
  log: Logger;
  tools: ToolRegistry;
  policy: PolicyEngine;
  memory: MemoryStore;
  orchestrator: Orchestrator;
  agents: Map<string, Agent>;
  provider: LLMProvider;
  close(): void;
  /** Build an agent from a definition and register it. */
  registerAgent(def: AgentDefinition, agentFactory: (deps: AgentDeps) => Agent): Agent;
}

export interface Runtime {
  services: CompanyServices;
  /** Convenience: enqueue a task by description. */
  submit(partial: Parameters<typeof newTask>[0]): Promise<Task>;
}

export function createCompany(opts: {
  provider: LLMProvider;
  config?: CompanyConfig;
  agentFactory: (deps: AgentDeps) => Agent;
  agents: AgentDefinition[];
  tools?: Tool[];
}): Runtime {
  const config = opts.config ?? {};
  const store = new Store(config.store ?? { path: "data/company.db" });
  const bus = new EventBus(5000);
  const baseLog = new CoreLogger({ minLevel: config.logLevel, bus });
  const log = baseLog.child("company");

  // Persist the full event stream to SQLite (audit backbone).
  bus.onAll((event) => {
    store.insertEvent(event);
  });

  const tools = new ToolRegistry();
  if (opts.tools) tools.registerAll(opts.tools);

  const policy = new PolicyEngine(store, bus, log.child("policy"), {
    defaultEffect: config.defaultEffect,
  });
  if (config.rules) policy.setRules(config.rules);

  const memory = new MemoryStore(store, log.child("memory"));

  const orchestrator = new Orchestrator({
    store,
    bus,
    log: log.child("orchestrator"),
    concurrency: config.concurrency,
  });

  const agents = new Map<string, Agent>();
  const registerAgent = (def: AgentDefinition): Agent => {
    const deps: AgentDeps = {
      def,
      provider: opts.provider,
      tools,
      policy,
      memory,
      store,
      bus,
      log: log.child(`agent:${def.id}`),
    };
    const agent = opts.agentFactory(deps);
    agents.set(agent.id, agent);
    orchestrator.register(agent);
    return agent;
  };

  for (const def of opts.agents) registerAgent(def);

  const services: CompanyServices = {
    store,
    bus,
    log,
    tools,
    policy,
    memory,
    orchestrator,
    agents,
    provider: opts.provider,
    close: () => store.close(),
    registerAgent: (def, factory) => {
      const deps: AgentDeps = {
        def,
        provider: opts.provider,
        tools,
        policy,
        memory,
        store,
        bus,
        log: log.child(`agent:${def.id}`),
      };
      const agent = factory(deps);
      agents.set(agent.id, agent);
      orchestrator.register(agent);
      return agent;
    },
  };

  const runtime: Runtime = {
    services,
    submit: async (partial) => {
      const task = newTask(partial);
      await orchestrator.enqueue(task);
      return task;
    },
  };

  orchestrator.start();
  return runtime;
}
