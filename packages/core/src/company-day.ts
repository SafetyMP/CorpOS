import { eq } from "drizzle-orm";
import {
  checkSlaBreaches,
  createCompany,
  decideException,
  openContract,
  runAgentTurn,
  type Company,
} from "./company.js";
import { SimulationProvider, tc } from "./llm.js";
import { agents, contracts, exceptions } from "./schema.js";
import { mcpKnowledgeSearch } from "./mcp-client.js";

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
}

function countHandoffs(steps: unknown[]): number {
  return steps.filter(
    (s) =>
      typeof s === "object" && s && "tool" in s && (s as { tool: string }).tool === "agent.handoff",
  ).length;
}

export async function runCompanyDay(opts?: {
  dbPath?: string;
  withMcp?: boolean;
  serverCommand?: { command: string; args: string[] };
}): Promise<{ company: Company; result: CompanyDayResult }> {
  const mcpInvoke = opts?.withMcp
    ? async (name: string, args: Record<string, unknown>) => {
        if (name === "knowledge.search") {
          return mcpKnowledgeSearch(String(args.query ?? ""), opts.serverCommand);
        }
        return { ok: false, error: "not mcp" };
      }
    : undefined;

  const company = await createCompany({ dbPath: opts?.dbPath ?? ":memory:", mcpInvoke });

  const provider = new SimulationProvider({
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
  });

  const { contractId, taskId } = await openContract(company, {
    title: "Customer refund day",
    intake: "ada@example.com wants a $49 refund on sub_ada_pro",
    assignees: ["agent_support", "agent_finance", "agent_ops"],
    slaMinutes: 240,
  });

  let handoffs = 0;
  let autonomousSettles = 0;
  let exceptionSettles = 0;

  const support = await runAgentTurn(company, provider, {
    agentId: "agent_support",
    taskId,
    contractId,
    tenantId: "default",
    systemPrompt: "You are Support Agent for CorpOS.",
    userPrompt: "Handle the refund intake and hand off to finance.",
  });
  handoffs += countHandoffs(support.steps);

  await company.db
    .update(agents)
    .set({ maxAutonomousRisk: 3 })
    .where(eq(agents.id, "agent_finance"));

  const finance = await runAgentTurn(company, provider, {
    agentId: "agent_finance",
    taskId,
    contractId,
    tenantId: "default",
    systemPrompt: "You are Finance Agent for CorpOS.",
    userPrompt: "Settle the refund obligation and hand off to ops.",
  });
  if (finance.steps.some((s) => typeof s === "object" && s && "draftSettled" in s)) {
    autonomousSettles++;
  }
  handoffs += countHandoffs(finance.steps);

  const ops = await runAgentTurn(company, provider, {
    agentId: "agent_ops",
    taskId,
    contractId,
    tenantId: "default",
    systemPrompt: "You are Ops Agent for CorpOS.",
    userPrompt: "Restart billing-api if needed.",
  });

  if (ops.awaitingExceptionId) {
    await decideException(company, ops.awaitingExceptionId, "approved", "carol@corpos.local");
    const ex = (
      await company.db.select().from(exceptions).where(eq(exceptions.id, ops.awaitingExceptionId))
    )[0]!;
    const tool = company.gateway.get(ex.tool)!;
    await tool.execute(JSON.parse(ex.argsJson), {
      agentId: "agent_ops",
      taskId,
      contractId,
      tenantId: "default",
    });
    exceptionSettles++;
    await company.trust.recordAccept("agent_support");
    await company.trust.recordAccept("agent_support");
  }

  const compensated = await company.gateway.compensate(contractId);

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
  };
  return { company, result };
}
