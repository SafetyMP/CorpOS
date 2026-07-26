import { eq } from "drizzle-orm";
import { openDb, type Db } from "./db.js";
import { AuditLog } from "./audit.js";
import { PolicyEngine } from "./policy.js";
import { ToolGateway } from "./gateway.js";
import { TrustLedger } from "./trust.js";
import { createSeedTools, registryOf } from "./tools.js";
import {
  agents,
  controlState,
  departments,
  contracts,
  tasks,
  exceptions,
  traces,
} from "./schema.js";
import { newId } from "./id.js";
import { now, type ChatMessage, type LLMProvider, type ToolResult } from "./types.js";
import type { Client } from "@libsql/client";
import { endSpan, startSpan } from "./otel.js";
import { Orchestrator } from "./orchestrator.js";

export interface Company {
  client: Client;
  db: Db;
  audit: AuditLog;
  policy: PolicyEngine;
  gateway: ToolGateway;
  trust: TrustLedger;
  orchestrator?: Orchestrator;
  seed: {
    refunds: Array<{ id: string; amount: number; customer: string }>;
    messages: Array<{ to: string; body: string }>;
    knowledge: Record<string, string>;
  };
  close: () => void;
}

export async function createCompany(opts?: {
  dbPath?: string;
  mcpInvoke?: (name: string, args: Record<string, unknown>) => Promise<ToolResult>;
}): Promise<Company> {
  const { client, db } = await openDb(opts?.dbPath);
  const audit = new AuditLog(db);
  const policy = new PolicyEngine(db, audit, "deny");
  policy.setRules([]);
  const seed = {
    refunds: [] as Array<{ id: string; amount: number; customer: string }>,
    messages: [] as Array<{ to: string; body: string }>,
    knowledge: {
      refund: "Refunds under $100 may be issued after CRM lookup.",
      sla: "Support SLA is 4 hours for refund requests.",
    },
  };
  const tools = registryOf(createSeedTools(seed));
  const gateway = new ToolGateway(db, policy, audit, tools, opts?.mcpInvoke);
  const trust = new TrustLedger(db, audit);
  await seedFirm(db);
  return {
    client,
    db,
    audit,
    policy,
    gateway,
    trust,
    seed,
    close: () => client.close(),
  };
}

async function seedFirm(db: Db): Promise<void> {
  const depts = [
    { id: "support", name: "Support", capitalBudget: 500, capitalSpent: 0 },
    { id: "finance", name: "Finance", capitalBudget: 2000, capitalSpent: 0 },
    { id: "ops", name: "Operations", capitalBudget: 300, capitalSpent: 0 },
  ];
  for (const d of depts) {
    if (!(await db.select().from(departments).where(eq(departments.id, d.id)))[0]) {
      await db.insert(departments).values(d);
    }
  }
  // Finance starts with prior earned autonomy (accepts≥4 → maxRisk 3) from historical clean days.
  const agentRows = [
    {
      id: "agent_support",
      role: "Support Agent",
      department: "support",
      owner: "alice@corpos.local",
      principal: "support-bot",
      maxAutonomousRisk: 1,
      trustScore: 0,
      accepts: 0,
      rejects: 0,
      violations: 0,
      active: 1,
    },
    {
      id: "agent_finance",
      role: "Finance Agent",
      department: "finance",
      owner: "bob@corpos.local",
      principal: "finance-bot",
      maxAutonomousRisk: 3,
      trustScore: 4,
      accepts: 4,
      rejects: 0,
      violations: 0,
      active: 1,
    },
    {
      id: "agent_ops",
      role: "Ops Agent",
      department: "ops",
      owner: "carol@corpos.local",
      principal: "ops-bot",
      maxAutonomousRisk: 1,
      trustScore: 0,
      accepts: 0,
      rejects: 0,
      violations: 0,
      active: 1,
    },
  ];
  for (const a of agentRows) {
    if (!(await db.select().from(agents).where(eq(agents.id, a.id)))[0]) {
      await db.insert(agents).values(a);
    }
  }
  if (!(await db.select().from(controlState).where(eq(controlState.id, "global")))[0]) {
    await db
      .insert(controlState)
      .values({ id: "global", killed: 0, tokenBudget: 100000, tokensUsed: 0 });
  }
}

export async function runAgentTurn(
  company: Company,
  provider: LLMProvider,
  opts: {
    agentId: string;
    taskId: string;
    contractId: string;
    tenantId: string;
    systemPrompt: string;
    userPrompt: string;
    originatingAuthority?: string;
    delegatedBy?: string;
    delegationDepth?: number;
  },
): Promise<{
  ok: boolean;
  awaitingExceptionId?: string;
  summary?: string;
  steps: unknown[];
}> {
  const agent = (await company.db.select().from(agents).where(eq(agents.id, opts.agentId)))[0];
  const span = startSpan("invoke_agent", `invoke_agent ${agent?.role ?? opts.agentId}`, {
    "gen_ai.agent.name": agent?.role ?? opts.agentId,
    "gen_ai.provider.name": provider.id,
  });

  const steps: unknown[] = [];
  const messages: ChatMessage[] = [
    { role: "system", content: opts.systemPrompt },
    { role: "user", content: opts.userPrompt },
  ];
  const baseCtx = {
    agentId: opts.agentId,
    taskId: opts.taskId,
    contractId: opts.contractId,
    tenantId: opts.tenantId,
    originatingAuthority: opts.originatingAuthority ?? agent?.owner ?? "unknown",
    delegatedBy: opts.delegatedBy,
    delegationDepth: opts.delegationDepth ?? 0,
  };

  for (let i = 0; i < 8; i++) {
    const response = await provider.complete({
      messages,
      tools: company.gateway.list().map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    });
    messages.push(response.message);
    if (!response.toolCalls.length) {
      const summary = response.message.content || "Done";
      await company.db.insert(traces).values({
        id: newId("tr"),
        contractId: opts.contractId,
        taskId: opts.taskId,
        stepsJson: JSON.stringify(steps),
        createdAt: now(),
      });
      endSpan(span);
      return { ok: true, summary, steps };
    }
    for (const call of response.toolCalls) {
      let depth = baseCtx.delegationDepth;
      let delegatedBy = baseCtx.delegatedBy;
      if (call.name === "agent.handoff") {
        depth = depth + 1;
        delegatedBy = opts.agentId;
      }
      const gw = await company.gateway.invoke(call.name, call.arguments, {
        ...baseCtx,
        delegatedBy,
        delegationDepth: depth,
      });
      steps.push({
        tool: call.name,
        decision: gw.decision,
        result: gw.result,
        decisionId: gw.decision.decisionId,
      });
      if (gw.decision.effect === "approve" && gw.decision.approvalId) {
        await company.db
          .update(exceptions)
          .set({
            pauseJson: JSON.stringify({
              messages,
              toolCallId: call.id,
              tool: call.name,
              args: call.arguments,
              agentId: opts.agentId,
              depth,
              delegatedBy,
            }),
          })
          .where(eq(exceptions.id, gw.decision.approvalId));
        await company.db
          .update(tasks)
          .set({ state: "awaiting_exception" })
          .where(eq(tasks.id, opts.taskId));
        endSpan(span, { decisionId: gw.decision.decisionId });
        return { ok: false, awaitingExceptionId: gw.decision.approvalId, steps };
      }
      if (gw.decision.effect === "deny") {
        messages.push({
          role: "tool",
          toolCallId: call.id,
          content: gw.decision.reason,
        });
        continue;
      }
      if (gw.decision.effect === "draft" && gw.draftId) {
        const settled = await company.gateway.settleDraft(gw.draftId, baseCtx);
        messages.push({
          role: "tool",
          toolCallId: call.id,
          content: settled.note ?? "draft settled",
        });
        steps.push({ draftSettled: gw.draftId, result: settled });
        continue;
      }
      if (call.name === "agent.handoff" && gw.result?.ok) {
        const toAgent = String(call.arguments.toAgent ?? "");
        const obligation = String(call.arguments.obligation ?? "");
        const ctr = (
          await company.db.select().from(contracts).where(eq(contracts.id, opts.contractId))
        )[0];
        if (ctr) {
          const obligations = JSON.parse(ctr.obligations || "[]") as unknown[];
          obligations.push({
            toAgent,
            obligation,
            from: opts.agentId,
            depth: depth,
            originatingAuthority: baseCtx.originatingAuthority,
          });
          await company.db
            .update(contracts)
            .set({
              obligations: JSON.stringify(obligations),
              assignees: JSON.stringify(
                Array.from(new Set([...JSON.parse(ctr.assignees || "[]"), toAgent])),
              ),
              updatedAt: now(),
            })
            .where(eq(contracts.id, opts.contractId));
        }
      }
      messages.push({
        role: "tool",
        toolCallId: call.id,
        content: gw.result?.note ?? gw.decision.reason,
      });
    }
  }
  endSpan(span);
  return { ok: false, summary: "max steps", steps };
}

export async function openContract(
  company: Company,
  input: { title: string; intake: string; assignees: string[]; slaMinutes?: number },
): Promise<{ contractId: string; taskId: string }> {
  const contractId = newId("ctr");
  const taskId = newId("task");
  const t = now();
  const slaDueAt = input.slaMinutes
    ? new Date(Date.now() + input.slaMinutes * 60_000).toISOString()
    : null;
  await company.db.insert(contracts).values({
    id: contractId,
    tenantId: "default",
    title: input.title,
    intake: input.intake,
    state: "open",
    assignees: JSON.stringify(input.assignees),
    obligations: JSON.stringify([]),
    slaDueAt,
    createdAt: t,
    updatedAt: t,
  });
  await company.db.insert(tasks).values({
    id: taskId,
    contractId,
    tenantId: "default",
    title: input.title,
    description: input.intake,
    state: "queued",
    assignedTo: input.assignees[0],
    attempts: 0,
    createdAt: t,
  });
  await company.audit.append("contract.opened", { contractId, title: input.title });
  return { contractId, taskId };
}

export async function decideException(
  company: Company,
  exceptionId: string,
  decision: "approved" | "rejected",
  by: string,
  dissentReason?: string,
): Promise<{ resumed?: boolean; executed?: boolean }> {
  const ex = (await company.db.select().from(exceptions).where(eq(exceptions.id, exceptionId)))[0];
  if (!ex || ex.state !== "pending") return {};
  const patch: Record<string, unknown> = {
    state: decision,
    decidedAt: now(),
    decidedBy: by,
  };
  if (decision === "rejected" && dissentReason) {
    patch.dissentReason = dissentReason;
  }
  await company.db.update(exceptions).set(patch).where(eq(exceptions.id, exceptionId));
  if (decision === "approved") await company.trust.recordAccept(ex.agentId);
  else await company.trust.recordReject(ex.agentId);
  await company.audit.append(`exception.${decision}`, {
    exceptionId,
    by,
    dissentReason: dissentReason ?? null,
  });

  if (decision === "approved" && ex.pauseJson) {
    const tool = company.gateway.get(ex.tool);
    if (tool) {
      await tool.execute(JSON.parse(ex.argsJson), {
        agentId: ex.agentId,
        taskId: ex.taskId,
        contractId: ex.contractId,
        tenantId: ex.tenantId,
        originatingAuthority: by,
        delegationDepth: 0,
      });
      await company.db
        .update(tasks)
        .set({ state: "done", finishedAt: now() })
        .where(eq(tasks.id, ex.taskId));
      company.orchestrator?.resume(ex.taskId, true);
      return { resumed: true, executed: true };
    }
  } else if (decision === "rejected") {
    await company.db
      .update(tasks)
      .set({ state: "failed", finishedAt: now(), error: "exception rejected" })
      .where(eq(tasks.id, ex.taskId));
    company.orchestrator?.resume(ex.taskId, false);
    return { resumed: true, executed: false };
  }
  return {};
}

export async function checkSlaBreaches(company: Company): Promise<number> {
  const t = now();
  let n = 0;
  for (const c of await company.db.select().from(contracts)) {
    if (c.slaDueAt && c.slaDueAt < t && c.state === "open") {
      await company.db.insert(exceptions).values({
        id: newId("ex"),
        tenantId: c.tenantId,
        contractId: c.id,
        taskId: "sla",
        agentId: "system",
        tool: "sla.breach",
        argsJson: "{}",
        reason: "SLA breached",
        riskLevel: 2,
        state: "pending",
        ttlAt: new Date(Date.now() + 3600_000).toISOString(),
        createdAt: t,
      });
      await company.db
        .update(contracts)
        .set({ state: "sla_breach", updatedAt: t })
        .where(eq(contracts.id, c.id));
      n++;
    }
  }
  return n;
}
