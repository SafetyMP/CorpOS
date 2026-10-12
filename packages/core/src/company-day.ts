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
  /** Human-queued irreversible actions (restart) still waiting on Approve, Reject, or Kill. */
  awaitingExceptions: number;
  exceptionSettles: number;
  compensated: number;
  trustAfter: number;
  slaExceptions: number;
  auditHead: string;
  ok: boolean;
  timeline: TimelineEvent[];
  providerMode: "simulation" | "live";
}

function draftSettleOk(step: unknown): boolean {
  if (typeof step !== "object" || !step || !("draftSettled" in step)) return false;
  const result = (step as { result?: { ok?: boolean } }).result;
  return result?.ok === true;
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
): Promise<{ toAgent: string; obligation: string; from: string; depth: number } | null> {
  const ctr = (await company.db.select().from(contracts).where(eq(contracts.id, contractId)))[0];
  if (!ctr) return null;
  const obligations = JSON.parse(ctr.obligations || "[]") as Array<{
    toAgent: string;
    obligation: string;
    from: string;
    depth?: number;
  }>;
  const last = obligations.length ? obligations[obligations.length - 1]! : null;
  if (!last) return null;
  return {
    toAgent: last.toAgent,
    obligation: last.obligation,
    from: last.from,
    depth: typeof last.depth === "number" ? last.depth : 0,
  };
}

async function enqueueAgentTask(
  company: Company,
  opts: {
    contractId: string;
    agentId: string;
    title: string;
    description: string;
    delegationDepth: number;
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
    delegationDepth: opts.delegationDepth,
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
  let providerMode: "simulation" | "live";
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
    delegationDepth: finHandoff?.depth ?? 0,
  });
  const finance = await company.orchestrator.enqueueAndRun(financeTaskId);
  if (finance.steps.some(draftSettleOk)) {
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
    delegationDepth: opsHandoff?.depth ?? 0,
  });

  if (autoApprove) {
    const opsPromise = company.orchestrator.enqueueAndRun(opsTaskId);
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
        const quorum = company.policy.getQuorumConfig(pending.riskLevel);
        const voters = ["alice@corpos.local", "bob@corpos.local", "carol@corpos.local"];
        const needed = quorum ? quorum.n : 1;
        let decided: { executed?: boolean } = {};
        for (const voter of voters.slice(0, needed)) {
          decided = await decideException(company, pending.id, "approved", voter);
        }
        if (decided.executed) {
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
        }
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
    }
  }
  const awaitingExceptions = (await company.db.select().from(exceptions)).filter(
    (e) => e.contractId === contractId && e.state === "pending" && e.tool === "ops.restart_service",
  ).length;
  // Success leaves the settled refund in place. Explicit gateway.compensate()
  // may still reverse it; this script does not.
  const compensated = 0;

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
  const refundHeld = company.seed.refunds.some(
    (refund) => refund.amount === 49 && refund.customer === "ada@example.com",
  );
  const restartPending = (await company.db.select().from(exceptions)).some(
    (row) =>
      row.contractId === contractId &&
      row.tool === "ops.restart_service" &&
      row.state === "pending",
  );
  // The scripted day succeeds when the refund is still on the ledger and the
  // restart is waiting for Approve, Reject, or Kill. Settling that restart is
  // an explicit opt-in, not a requirement for ok.
  const dayComplete = handoffs >= 2 && autonomousSettles >= 1 && compensated === 0 && refundHeld;
  const restartDisposition = autoApprove ? exceptionSettles >= 1 : restartPending;

  const result: CompanyDayResult = {
    contractId,
    handoffs,
    autonomousSettles,
    awaitingExceptions,
    exceptionSettles,
    compensated,
    trustAfter,
    slaExceptions,
    auditHead: await company.audit.head(),
    ok: dayComplete && restartDisposition,
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
