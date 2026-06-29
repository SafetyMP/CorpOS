import type { Runtime } from "./core";

/**
 * Deterministic multi-agent scenario (no live LLM, no network). Demonstrates:
 *  - a support refund flow that hits an approval gate,
 *  - an ops agent diagnosing a degraded service,
 *  - inter-agent delegation shape.
 * Run with `npm run scenario`.
 */
export async function runScenario(runtime: Runtime, tenant: string): Promise<void> {
  const { services } = runtime;
  const log = services.log.child("scenario");

  log.info("scenario.start", { provider: services.provider.id });

  // 1. Support refund flow — hits billing.issue_refund approval gate.
  const support = runtime.submit({
    tenantId: tenant,
    title: "Refund request from Ada",
    description: "Customer Ada (ada@example.com) requests a refund on sub_ada_pro.",
    assignedTo: "agent_support",
    createdBy: "human",
  });

  const supportTask = await services.orchestrator.runToCompletion(await support);
  log.info("scenario.support.state", { state: supportTask?.state });

  // 2. Ops diagnosis flow.
  const ops = await runtime.submit({
    tenantId: tenant,
    title: "Investigate degraded checkout service",
    description: "Alerts show checkout-api degraded. Diagnose and propose action.",
    assignedTo: "agent_ops",
    createdBy: "system",
  });
  await services.orchestrator.runToCompletion(ops);

  // 3. Auto-approve every pending gate so the scenario resolves cleanly
  //    (in production these wait for a human via the dashboard).
  for (let round = 0; round < 4; round++) {
    const pending = services.store.pendingApprovals();
    if (pending.length === 0) break;
    for (const approval of pending) {
      log.info("scenario.approval.decide", { id: approval.id, tool: approval.tool });
      services.policy.decide(approval.id, "approved", "scenario:human");
      await services.orchestrator.resume(approval.id);
    }
  }

  // 4. Report.
  const tasks = services.store.listTasks();
  const events = services.store.recentEvents();
  const pending = services.store.pendingApprovals();

  console.log("\n=== SCENARIO RESULT ===");
  console.log(`tasks:      ${tasks.length}`);
  for (const t of tasks) {
    console.log(
      `  - [${t.state}] ${t.title} → ${t.assignedTo} (output: ${t.output?.summary ?? "—"})`,
    );
  }
  console.log(`events:     ${events.length}`);
  console.log(`approvals:  ${pending.length} pending`);
  console.log("=======================\n");

  log.info("scenario.done", { tasks: tasks.length, events: events.length });
}
