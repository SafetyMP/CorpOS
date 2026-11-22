import { ActorTrace } from "./ActorTrace";
import {
  serviceCaptures,
  investigationReceipt,
  effectLabels,
  replay,
} from "./billing-observations";
import {
  workspaceLink,
  restartState,
  trials,
  type CaseProps,
  type Selection,
} from "./case-selection";

const source = "https://github.com/SafetyMP/CorpOS/blob/main/";
export function TechnicalGuide({ selection, change }: CaseProps) {
  const panel = selection.panel;
  const rows = replay(selection);
  const selectedRow = rows[Number(selection.node) - 1];
  const trial = trials[selection.trial];
  const receipt = investigationReceipt(
    selection.route === "none" ? null : selection.route,
    selection.observed === "yes" ? selection.capture : null,
  );
  const votes = selection.decision === "approve" ? (selection.votes === "two" ? 2 : 1) : 0;
  return (
    <div class="mandate">
      <div class="desk-wrap">
        <nav class="desk-nav" aria-label="Case trace navigation">
          <strong>CorpOS</strong>
          <a href={workspaceLink("case", selection)}>← Return to your billing case</a>
        </nav>
        <main>
          <div class="desk-intro">
            <p class="desk-label">Implementation evidence</p>
            <h1>Trace the billing restart</h1>
            <p class="desk-lede">
              A work contract links Support, Finance and Ops. Inspect a tool request, see how the
              policy routes it, then test what happens when the gateway tries to execute a restart.
            </p>
          </div>
          <div class="trace-context" aria-label="Selected business case">
            <div>
              <span>Customer evidence</span>
              <b>
                {selection.observed === "yes"
                  ? `Capture ${selection.capture} · ${serviceCaptures[selection.capture].join(" / ")} failures per 100`
                  : "Service samples unopened"}
              </b>
            </div>
            <div>
              <span>Investigation owner</span>
              <b>{receipt?.owner ?? "Unassigned"}</b>
            </div>
            <div>
              <span>Restart decision</span>
              <b>{restartState(selection)}</b>
            </div>
          </div>
          <div
            class="guide-tabs trial-choices"
            role="group"
            aria-label="Inspect the implementation"
          >
            {(
              [
                ["contract", "Work contract"],
                ["policy", "Policy decision"],
                ["gateway", "Execution gate"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={panel === id}
                onClick={() => change({ panel: id })}
              >
                {label}
              </button>
            ))}
          </div>
          {panel === "contract" && (
            <ActorTrace
              selected={Number(selection.node) - 1}
              selectedEffect={
                selection.node === "6"
                  ? `Operator disposition · ${restartState(selection)}`
                  : selection.node === "4"
                    ? "Case ledger · one $49 refund settled. Bank posting remains unknown."
                    : selection.node === "5"
                      ? "Recorded obligation · Finance asked Ops to check service health."
                      : selection.node === "3"
                        ? "Obligation · Finance owns the $49 refund."
                        : "Contract intake · Ada requests a $49 refund on sub_ada_pro."
              }
              onSelect={(index) => change({ node: String(index + 1) as Selection["node"] })}
            />
          )}
          {panel === "policy" && (
            <section class="trials policy-guide">
              <p class="desk-label">Policy decision point</p>
              <h2>How does one request get routed?</h2>
              <p>
                Each agent proposes a tool call. The policy engine checks the actor’s authority, the
                tool and its risk. A rule can allow the call, stage a draft, send it for approval or
                deny it.
              </p>
              <label>
                Request on the contract{" "}
                <select
                  value={selection.node}
                  onChange={(e) => change({ node: e.currentTarget.value as Selection["node"] })}
                >
                  {rows.map((row, i) => (
                    <option key={row.action} value={i + 1}>
                      {row.team} · {row.action}
                    </option>
                  ))}
                </select>
              </label>
              <dl class="policy-rail">
                <div>
                  <dt>Tool request</dt>
                  <dd>
                    <code>{selectedRow.tool}</code>
                  </dd>
                </div>
                <div>
                  <dt>Recorded rule</dt>
                  <dd>{effectLabels[selectedRow.recorded]}</dd>
                </div>
                <div>
                  <dt>
                    {selection.compared === "yes" ? "Your replay" : "Replay with recorded rules"}
                  </dt>
                  <dd>{effectLabels[selectedRow.candidate]}</dd>
                </div>
              </dl>
              <p>{selectedRow.evidence}</p>
              <p class="desk-hint">
                The comparison scores this proposal independently. The simulator checks again before
                any tool changes state.
              </p>
            </section>
          )}
          {panel === "gateway" && (
            <section class="trials" aria-labelledby="trial-title">
              <p class="desk-label">Simulator evidence</p>
              <h2 id="trial-title">Test the approval boundary</h2>
              <p>
                The three in-memory trials start with the same settled refund and queued request.
                Two distinct votes are required from at least three eligible approvers. Select what
                happens between the first vote and the gateway call.
              </p>
              <div class="trial-choices" role="group" aria-label="Simulator trial">
                {(Object.keys(trials) as (keyof typeof trials)[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={selection.trial === key}
                    onClick={() => change({ trial: key })}
                  >
                    {trials[key].label}
                  </button>
                ))}
              </div>
              <dl class="policy-rail">
                <div>
                  <dt>Eligible votes</dt>
                  <dd>{trial.voters} of 2</dd>
                </div>
                <div>
                  <dt>Stop switch</dt>
                  <dd>{trial.stop ? "Engaged" : "Off"}</dd>
                </div>
                <div>
                  <dt>Adapter result</dt>
                  <dd>{trial.outcome}</dd>
                </div>
              </dl>
              <p class="trial-result" role="status">
                {selection.trial === "repeat"
                  ? "The same operator votes twice. Only one distinct identity counts, so the adapter stays idle."
                  : selection.trial === "clear"
                    ? "A second eligible operator completes quorum. The gateway rechecks the controls and runs the simulated restart. Confirming service recovery would still require telemetry."
                    : "Two distinct operators complete quorum. The gateway sees the stop switch at execution and denies the restart. The refund stays posted."}
              </p>
              <details class="trial-audit">
                <summary>What could the next shift verify?</summary>
                <p>
                  {selection.trial === "repeat" ? (
                    <>
                      The exception’s voter record contains one distinct identity. The audit log
                      records the quorum vote, and there is no execution receipt for the restart.
                    </>
                  ) : trial.executed ? (
                    <>
                      The audit log records <code>exception.approved</code>, the gateway’s execution
                      check and a <code>tool.execute</code> entry for the restart. The adapter ran.
                      The next shift still needs service samples to verify recovery.
                    </>
                  ) : (
                    <>
                      The audit log records <code>exception.approved</code>, followed by a{" "}
                      <code>gateway.decision</code> denying execution. The next shift can explain
                      why an approved restart never ran.
                    </>
                  )}
                </p>
                <p>
                  The <a href={source + "packages/core/src/audit.ts"}>audit verifier</a> recomputes
                  the hash chain to check the sequence of recorded events.
                </p>
              </details>
              <p class="desk-hint">
                Your case has {votes} of 2 votes. Changing this trial compares a separate run. Each
                run retains one $49 refund.
              </p>
            </section>
          )}
          <details class="source-note">
            <summary>Implementation, evidence and reproduction</summary>
            <p>
              The actor lanes reconstruct six requests in the{" "}
              <a href={source + "packages/core/src/company-day.ts"}>company-day script</a>. Finance
              stages and settles the refund. Ops pauses for human approval. The{" "}
              <a href={source + "packages/core/src/company.ts"}>exception handler</a> counts
              eligible voters. The <a href={source + "packages/core/src/gateway.ts"}>gateway</a>{" "}
              rechecks authority immediately before effect.
            </p>
            <p>
              The customer report, service samples and pilot economics are authored examples. The
              browser displays saved example outcomes. The{" "}
              <a href={source + "test/billing-observations.test.ts"}>reproduction test</a> reruns
              each trial and checks the votes, restart receipts and retained ledger entry against a
              fresh simulator run.
            </p>
            <code>npx vitest run test/billing-observations.test.ts</code>
          </details>
          <div class="trace-links">
            <a href={workspaceLink("guide", selection)}>Bookmark this comparison</a>
            <a href={workspaceLink("case", selection)}>Return to your billing case</a>
          </div>
        </main>
      </div>
    </div>
  );
}
