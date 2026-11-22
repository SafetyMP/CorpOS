import { ActorTrace } from "./ActorTrace";
import { serviceCaptures, investigationReceipt } from "./billing-observations";
import {
  workspaceLink,
  restartState,
  trials,
  type CaseProps,
  type Selection,
} from "./case-selection";

const source = "https://github.com/SafetyMP/CorpOS/blob/main/";
export function TechnicalGuide({ selection, change }: CaseProps) {
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
              Follow Ada’s settled $49 credit to the pending change on billing-api. Compare your
              operator decision with a simulator run.
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
          <ActorTrace
            selected={Number(selection.node) - 1}
            selectedEffect={
              selection.node === "6"
                ? `Operator disposition · ${restartState(selection)}`
                : selection.node === "4"
                  ? "Case ledger · one $49 refund settled. Bank posting remains unknown."
                  : selection.node === "5"
                    ? `Investigation assigned · ${receipt?.owner ?? "unassigned"}`
                    : selection.node === "3"
                      ? "Obligation · Finance owns the $49 refund."
                      : "Case input · Ada reports a missing credit for sub_ada_pro."
            }
            onSelect={(index) => change({ node: String(index + 1) as Selection["node"] })}
          />
          <section class="trials" aria-labelledby="trial-title">
            <p class="desk-label">Simulator evidence</p>
            <h2 id="trial-title">Test the approval boundary</h2>
            <p>
              The three in-memory trials start with the same settled refund and queued request. Two
              distinct votes are required from at least three eligible approvers. Select what
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
            <table>
              <caption>Selected case and simulator evidence</caption>
              <thead>
                <tr>
                  <th scope="col">Checkpoint</th>
                  <th scope="col">Your case</th>
                  <th scope="col">{trial.label}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Distinct eligible votes recorded</th>
                  <td>{votes} of 2</td>
                  <td>{trial.voters} of 2</td>
                </tr>
                <tr>
                  <th scope="row">Gateway stop</th>
                  <td>Not modeled</td>
                  <td>{trial.stop ? "Engaged before second vote" : "Off"}</td>
                </tr>
                <tr>
                  <th scope="row">Restart</th>
                  <td>{restartState(selection)}</td>
                  <td>{trial.outcome}</td>
                </tr>
                <tr>
                  <th scope="row">Refund ledger</th>
                  <td>$49 retained</td>
                  <td>$49 retained</td>
                </tr>
              </tbody>
            </table>
            <p class="trial-result" role="status">
              {selection.trial === "repeat"
                ? "The same operator votes twice. Only one distinct identity counts, so the adapter stays idle."
                : selection.trial === "clear"
                  ? "A second eligible operator completes quorum. The gateway rechecks the controls and runs the simulated restart. Confirming service recovery would still require telemetry."
                  : "Two distinct operators complete quorum. The gateway sees the stop switch at execution and denies the restart. The refund stays posted."}
            </p>
          </section>
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
              trial table contains normalized fixture outcomes from fresh simulator runs. The{" "}
              <a href={source + "test/billing-observations.test.ts"}>reproduction test</a> reruns
              each trial, verifies votes and adapter execution, and checks the retained ledger
              entry. These results model tool behavior rather than observed service availability.
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
