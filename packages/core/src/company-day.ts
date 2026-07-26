import { eq } from "drizzle-orm";
import {
  checkSlaBreaches,
  createCompany,
  decideException,
  openContract,
  type Company,
} from "./company.js";
import { resolveProvider, SimulationProvider, tc } from "./llm.js";
import { agents, contracts, exceptions, tasks } from "./schema.js";
import { mcpKnowledgeSearch } from "./mcp-client.js";
import { Orchestrator } from "./orchestrator.js";
import { resetSpans } from "./otel.js";
import { clearFirmEvents, publishFirmEvent } from "./events.js";
import { newId } from "./id.js";
import { now, type LLMProvider } from "./types.js";

export type TimelineKind =
  "intake" | "handoff" | "autonomous_settle" | "exception" | "compensate" | "trust" | "sla";

export interface TimelineEvent {
  id: string;
  agentId: string;
  role: string;
  kind: TimelineKind;
  summary: string;
}

export interface CompanyDayResult {
  contractId: string;
  handoffs: number;
  autonomousSettles: number;
  exceptionSettles: number;
  compensated: number;
  trustAfter: number;
  slaExceptions: number;
  auditHead: string;
  ok: boolean;
  timeline: TimelineEvent[];
  providerMode: "simulation" | "live";
}

function countHandoffs(steps: unknown[]): number {
  return steps.filter(
    (s) =>
      typeof s === "object" && s && "tool" in s && (s as { tool: string }).tool === "agent.handoff",
  ).length;
}

async function latestHandoff(
  company: Company,
  contractId: string,
): Promise<{ toAgent: string; obligation: string; from: string } | null> {
  const ctr = (await company.db.select().from(contracts).where(eq(contracts.id, contractId)))[0];
  if (!ctr) return null;
  const obligations = JSON.parse(ctr.obligations || "[]") as Array<{
    toAgent: string;
    obligation: string;
    from: string;
  }>;
  return obligations.length ? obligations[obligations.length - 1]! : null;
}

async function enqueueAgentTask(
  company: Company,
  opts: {
    contractId: string;
    agentId: string;
    title: string;
    description: string;
  },
): Promise<string> {
  const taskId = newId("task");
  await company.db.insert(tasks).values({
    id: taskId,
    contractId: opts.contractId,
    tenantId: "default",
    title: opts.title,
    description: opts.description,
    state: "queued",
    assignedTo: opts.agentId,
    attempts: 0,
    createdAt: now(),
  });
  return taskId;
}

function dayScripts(): Record<string, ReturnType<typeof tc>[][]> {
  return {
    "Support Agent": [
      [tc("crm.lookup", { email: "ada@example.com" })],
      [tc("knowledge.search", { query: "refund" })],
      [
        tc("agent.handoff", {
          toAgent: "agent_finance",
          obligation: "Settle $49 refund for ada@example.com",
        }),
      ],
    ],
    "Finance Agent": [
      [
        tc("billing.issue_refund", {
          subscription: "sub_ada_pro",
          amount: 49,
          customer: "ada@example.com",
        }),
      ],
      [
        tc("agent.handoff", {
          toAgent: "agent_ops",
          obligation: "Confirm service health after refund",
        }),
      ],
    ],
    "Ops Agent": [[tc("ops.restart_service", { service: "billing-api" })]],
  };
}

export async function runCompanyDay(opts?: {
  dbPath?: string;
  /** Reuse an existing company (shared firm store with console). */
  company?: Company;
  withMcp?: boolean;
  serverCommand?: { command: string; args: string[] };
  /**
   * Explicit opt-in only. Default false so demo/API paths do not imply human
   * approval. Tests/CI that need a settled exception must pass true.
   */
  autoApproveException?: boolean;
  /** Override provider (tests). When omitted, live uses resolveProvider else scripted sim. */
  provider?: LLMProvider;
}): Promise<{ company: Company; result: CompanyDayResult }> {
  resetSpans();
  clearFirmEvents();
  const mcpInvoke = opts?.withMcp
    ? async (name: string, args: Record<string, unknown>) => {
        if (name === "knowledge.search") {
          return mcpKnowledgeSearch(String(args.query ?? ""), opts.serverCommand);
        }
        return { ok: false, error: "not mcp" };
      }
    : undefined;

  const company =
    opts?.company ?? (await createCompany({ dbPath: opts?.dbPath ?? ":memory:", mcpInvoke }));

  let provider: LLMProvider;
  let providerMode: "simulation" | "live" = "simulation";
  if (opts?.provider) {
    provider = opts.provider;
    providerMode = provider.id === "live" ? "live" : "simulation";
  } else {
    const resolved = resolveProvider();
    if (resolved.mode === "live") {
      provider = resolved.provider;
      providerMode = "live";
    } else {
      provider = new SimulationProvider(dayScripts());
      providerMode = "simulation";
    }
  }

  const autoApprove = opts?.autoApproveException === true;
  company.orchestrator = new Orchestrator(company, {
    provider,
    concurrency: 2,
    awaitHitl: autoApprove,
  });

  const timeline: TimelineEvent[] = [];
  let seq = 0;
  const push = (event: Omit<TimelineEvent, "id">) => {
    seq += 1;
    const full = { id: `evt_${seq}`, ...event };
    timeline.push(full);
    publishFirmEvent("timeline", { ...full });
  };

  const { contractId, taskId: supportTaskId } = await openContract(company, {
    title: "Customer refund day",
    intake: "ada@example.com wants a $49 refund on sub_ada_pro",
    assignees: ["agent_support", "agent_finance", "agent_ops"],
    slaMinutes: 240,
  });
  push({
    agentId: "agent_support",
    role: "Support",
    kind: "intake",
    summary: "Opened refund contract for ada@example.com ($49).",
  });

  let handoffs = 0;
  let autonomousSettles = 0;
  let exceptionSettles = 0;

  const support = await company.orchestrator.enqueueAndRun(supportTaskId);
  const supportHandoffs = countHandoffs(support.steps);
  handoffs += supportHandoffs;
  if (supportHandoffs > 0) {
    push({
      agentId: "agent_support",
      role: "Support",
      kind: "handoff",
      summary: "Handed refund obligation to Finance.",
    });
    await company.trust.recordAccept("agent_support");
    push({
      agentId: "agent_support",
      role: "Support",
      kind: "trust",
      summary: "Clean handoff raised Support trust (earned autonomy).",
    });
  }

  const finHandoff = await latestHandoff(company, contractId);
  const financeTaskId = await enqueueAgentTask(company, {
    contractId,
    agentId: "agent_finance",
    title: "Settle refund",
    description: finHandoff?.obligation ?? "Settle the refund obligation and hand off to ops.",
  });
  const finance = await company.orchestrator.enqueueAndRun(financeTaskId);
  if (finance.steps.some((s) => typeof s === "object" && s && "draftSettled" in s)) {
    autonomousSettles++;
    push({
      agentId: "agent_finance",
      role: "Finance",
      kind: "autonomous_settle",
      summary: "Autonomously settled $49 refund (earned risk budget).",
    });
  }
  const financeHandoffs = countHandoffs(finance.steps);
  handoffs += financeHandoffs;
  if (financeHandoffs > 0) {
    push({
      agentId: "agent_finance",
      role: "Finance",
      kind: "handoff",
      summary: "Handed post-refund health check to Ops.",
    });
  }

  const opsHandoff = await latestHandoff(company, contractId);
  const opsTaskId = await enqueueAgentTask(company, {
    contractId,
    agentId: "agent_ops",
    title: "Confirm service health",
    description: opsHandoff?.obligation ?? "Restart billing-api if needed.",
  });

  let opsPromise: Promise<{
    ok: boolean;
    awaitingExceptionId?: string;
    steps: unknown[];
  }>;

  if (autoApprove) {
    opsPromise = company.orchestrator.enqueueAndRun(opsTaskId);
    for (let i = 0; i < 200; i++) {
      const pending = (await company.db.select().from(exceptions)).find(
        (e) => e.state === "pending" && e.taskId === opsTaskId,
      );
      if (pending) {
        push({
          agentId: "agent_ops",
          role: "Ops",
          kind: "exception",
          summary: "Restart requires human approval — exception queued.",
        });
        await decideException(company, pending.id, "approved", "carol@corpos.local");
        exceptionSettles++;
        push({
          agentId: "agent_ops",
          role: "Ops",
          kind: "exception",
          summary: "Demo auto-approved restart (explicit opt-in); billing-api restarted.",
        });
        await company.trust.recordAccept("agent_support");
        push({
          agentId: "agent_support",
          role: "Support",
          kind: "trust",
          summary: "Clean accepts raised Support maxAutonomousRisk.",
        });
        break;
      }
      await new Promise((r) => setTimeout(r, 5));
    }
    await opsPromise;
  } else {
    const ops = await company.orchestrator.enqueueAndRun(opsTaskId);
    if (ops.awaitingExceptionId) {
      push({
        agentId: "agent_ops",
        role: "Ops",
        kind: "exception",
        summary: "Restart requires human approval — exception queued.",
      });
      void (await company.db
        .select()
        .from(exceptions)
        .where(eq(exceptions.id, ops.awaitingExceptionId)));
    }
  }

  const compensated = await company.gateway.compensate(contractId);
  if (compensated > 0) {
    push({
      agentId: "agent_finance",
      role: "Finance",
      kind: "compensate",
      summary: `Compensated ${compensated} settled action(s); ledger restored.`,
    });
  }

  const short = await openContract(company, {
    title: "Expiring SLA",
    intake: "tiny",
    assignees: ["agent_support"],
    slaMinutes: 0,
  });
  await company.db
    .update(contracts)
    .set({ slaDueAt: new Date(Date.now() - 1000).toISOString() })
    .where(eq(contracts.id, short.contractId));
  const slaExceptions = await checkSlaBreaches(company);
  if (slaExceptions > 0) {
    push({
      agentId: "agent_support",
      role: "Support",
      kind: "sla",
      summary: "SLA breach enqueued exception for human review.",
    });
  }

  const trustAfter = (await company.trust.get("agent_support"))?.maxAutonomousRisk ?? 0;

  const result: CompanyDayResult = {
    contractId,
    handoffs,
    autonomousSettles,
    exceptionSettles,
    compensated,
    trustAfter,
    slaExceptions,
    auditHead: await company.audit.head(),
    ok: handoffs >= 2 && autonomousSettles >= 1 && exceptionSettles >= 1 && trustAfter >= 2,
    timeline,
    providerMode,
  };
  return { company, result };
}

/** Probe helpers for governance gates */
export async function assertFinancePriorAutonomy(company: Company): Promise<boolean> {
  const fin = (await company.db.select().from(agents).where(eq(agents.id, "agent_finance")))[0];
  return (fin?.maxAutonomousRisk ?? 0) >= 3 && (fin?.accepts ?? 0) >= 4;
}
