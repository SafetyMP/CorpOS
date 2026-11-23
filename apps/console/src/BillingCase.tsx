import { workspaceLink, type CaseProps } from "./case-selection";
import { MandateReplay } from "./MandateReplay";
import { BillingObservations } from "./BillingObservations";

const decisions = {
  hold: {
    label: "Keep it queued",
    result: "The restart waits for an operator.",
    evidence:
      "The restart stays available for later review. The team can investigate the service and payment records while the tool request waits.",
  },
  approve: {
    label: "Cast an approval vote",
    result: "One eligible vote. The restart stays queued.",
    evidence:
      "The default risk-4 rule requires two distinct votes from a roster of at least three eligible approvers. Repeating the first vote adds nothing. Only a second eligible voter can complete the quorum.",
  },
  reject: {
    label: "Reject the request",
    result: "The restart task ends without execution.",
    evidence:
      "Record the reason for declining this change. The chosen investigation can continue independently of the restart request.",
  },
};

type Decision = keyof typeof decisions;

const assumptions = [
  {
    key: "volume",
    label: "Eligible cases in 30 days",
    min: 1,
    max: 100000,
    step: 1,
    initial: "180",
  },
  {
    key: "minutes",
    label: "Net minutes saved per case",
    min: -480,
    max: 480,
    step: 0.1,
    initial: "4",
  },
  {
    key: "rate",
    label: "Loaded labor cost ($/hour)",
    min: 1,
    max: 10000,
    step: 0.01,
    initial: "60",
  },
  {
    key: "cost",
    label: "30-day pilot cost ($)",
    min: 0,
    max: 10000000,
    step: 0.01,
    initial: "900",
  },
] as const;

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

function Pilot({ selection, change }: CaseProps) {
  const values = selection;
  const valid = assumptions.every((a) => {
    const value = Number(values[a.key]);
    return (
      values[a.key]?.trim() &&
      Number.isFinite(value) &&
      value >= a.min &&
      value <= a.max &&
      (a.key !== "volume" || Number.isInteger(value))
    );
  });
  const volume = Number(values.volume),
    rate = Number(values.rate),
    cost = Number(values.cost);
  const hours = (volume * Number(values.minutes)) / 60;
  const threshold = (cost * 60) / (volume * rate);
  const capacity = hours * rate;
  const chartScale = Math.max(Math.abs(capacity), cost, 1);
  const contributions = [
    { label: "Staff capacity", value: capacity },
    { label: "Pilot spend", value: cost === 0 ? 0 : -cost },
  ];

  return (
    <section class="case-block" aria-labelledby="pilot-title" id="pilot">
      <p class="case-kicker">Platform engineering lead</p>
      <h2 id="pilot-title">Would the handoff pay for a pilot?</h2>
      <p>
        Can the team spend less time finding the next owner while keeping shared-service changes
        accountable? Compare a checklist in today’s queue with a 30-day shadow pilot. In the pilot,
        CorpOS would draft the handoff and show which requests need review. Staff would still make
        the changes. The estimates below value any time recovered.
      </p>
      <div class="case-calculator">
        <div>
          <div class="case-preset">
            <p>Try a handling-time estimate</p>
            {[4, 10].map((minutes) => (
              <button
                type="button"
                class="case-vote"
                key={minutes}
                aria-pressed={Number(values.minutes) === minutes}
                onClick={() => change({ minutes: String(minutes) })}
              >
                {minutes} minutes saved
              </button>
            ))}
          </div>
          <details>
            <summary>Adjust pilot assumptions</summary>
            <div class="case-inputs">
              {assumptions.map((a) => (
                <label key={a.key}>
                  {a.label}
                  <input
                    type="number"
                    min={a.min}
                    max={a.max}
                    step={a.step}
                    value={values[a.key]}
                    onInput={(e) => change({ [a.key]: e.currentTarget.value })}
                  />
                </label>
              ))}
            </div>
          </details>
        </div>
        <div class="case-result" aria-live="polite" aria-atomic="true">
          {valid ? (
            <>
              <p>Net capacity value over 30 days</p>
              <strong>{money.format(capacity - cost)}</strong>
              <figure class="cost-figure">
                <figcaption>Contribution to net value</figcaption>
                {contributions.map(({ label, value }) => (
                  <div class="cost-row" key={label}>
                    <div>
                      <span>{label}</span>
                      <span>
                        {value > 0 ? "+" : ""}
                        {money.format(value)}
                      </span>
                    </div>
                    <div class="cost-axis" aria-hidden="true">
                      <i
                        class={value < 0 ? "debit" : "credit"}
                        style={{ width: `${(Math.abs(value) / chartScale) * 50}%` }}
                      />
                    </div>
                  </div>
                ))}
              </figure>
              <p>
                {hours.toLocaleString("en-US", { maximumFractionDigits: 2 })} staff hours ×{" "}
                {money.format(rate)}/hour, less {money.format(cost)} in pilot costs. Break-even
                requires{" "}
                <b>{threshold.toLocaleString("en-US", { maximumFractionDigits: 2 })} minutes</b> per
                case.
              </p>
            </>
          ) : (
            <p>
              Enter a whole number of eligible cases and a value within the range of each field to
              calculate the result.
            </p>
          )}
        </div>
      </div>
      <p class="case-note">
        Illustrative inputs. Use paired handling times net of review and rework. Include setup and
        operating costs. The result values available staff time. Finance must identify how the team
        would use that capacity.
      </p>
      <fieldset class="case-choices">
        <legend>Platform sponsor decision</legend>
        {(
          [
            ["manual", "Retain manual handoffs"],
            ["checklist", "Try the ticket checklist"],
            ["pilot", "Fund a 30-day shadow pilot"],
          ] as const
        ).map(([id, label]) => (
          <label key={id}>
            <input
              type="radio"
              name="sponsor"
              checked={selection.sponsor === id}
              onChange={() => change({ sponsor: id })}
            />
            {label}
          </label>
        ))}
      </fieldset>
      {selection.sponsor !== "none" && (
        <p class="case-reading" role="status">
          {selection.sponsor === "manual"
            ? "Use the current queue as the baseline. Time the billing handoff and check that each restart reaches an accountable owner."
            : selection.sponsor === "checklist"
              ? "Trial a written payment and health-check handoff in the existing queue. Measure missed escalations and review time against the manual baseline."
              : valid
                ? `The assumed 30-day net capacity value is ${money.format(capacity - cost)}. Compare paired cases against the better existing option and require a reviewer for every proposed restart.`
                : "Complete the worksheet to price the shadow pilot."}
        </p>
      )}
      <details>
        <summary>What would justify continuing?</summary>
        <p>
          Time comparable cases under the manual process, the checklist and the shadow pilot. Record
          staff minutes, duplicate refunds, missed escalations and time to a service-owner decision.
          Compare the pilot with the better existing option. Continue only if measured time clears
          the break-even point and reviewers can account for every proposed restart. Suspend the
          pilot if it initiates a change outside its shadow scope.
        </p>
      </details>
    </section>
  );
}

export function BillingCase({ selection, change }: CaseProps) {
  const opened =
    selection.opened === "yes" ||
    selection.stage !== "ops" ||
    selection.record !== "ticket" ||
    selection.route !== "none" ||
    selection.decision !== "none" ||
    selection.compared === "yes" ||
    selection.sponsor !== "none";
  const openFile = () => {
    change({ opened: "yes" });
    requestAnimationFrame(() => document.getElementById("file-title")?.focus());
  };
  const decision = selection.decision === "none" ? null : selection.decision;
  const secondVote = decision === "approve" && selection.votes === "two";
  const guide = workspaceLink("guide", selection);
  const picked =
    decision === "approve" && secondVote
      ? {
          result: "Two eligible votes. The gateway rechecks.",
          evidence:
            "The second distinct vote satisfies the default quorum. The gateway can still block execution if the kill switch is engaged or policy denies the action. The on-call engineer checks service telemetry even when a tool receipt confirms the restart.",
        }
      : decision
        ? decisions[decision]
        : null;
  return (
    <div class="case-page">
      <div class="case-wrap">
        <nav aria-label="Case navigation">
          <strong>CorpOS</strong>
          <span class="case-nav-links">
            <a href={guide}>Trace this case</a>
          </span>
        </nav>
        <main>
          <header class="case-header shift-header">
            <div>
              <p class="case-kicker">Billing operations · Fictional company day</p>
              <h1>One credit. Three teams.</h1>
              <p>
                Your company sells software subscriptions and runs billing for every account on one
                shared service. At 09:05, Ada contacts Support. She expected a $49 credit and her
                statement still shows the charge.
              </p>
              <p>
                You lead the platform team. Support wants an answer for Ada. Finance can see the
                company ledger. The on-call engineer can see whether other accounts are having
                trouble. Each has only part of the story.
              </p>
            </div>
            <figure class="ownership-map">
              <figcaption>Where a billing question travels</figcaption>
              <ol>
                <li>
                  <b>Support</b>
                  <span>What did the customer experience?</span>
                </li>
                <li>
                  <b>Finance</b>
                  <span>What happened to the money?</span>
                </li>
                <li>
                  <b>Operations</b>
                  <span>Who else is affected?</span>
                </li>
              </ol>
            </figure>
          </header>
          <section class="case-block case-brief">
            <h2>Where the handoff breaks down</h2>
            <p>
              Today, the three teams piece the trail together from tickets. A second refund could
              pay Ada twice. An unnecessary restart could disrupt other customers. Waiting on a
              signature for every routine transfer also takes time away from the people who handle
              exceptions.
            </p>
            <figure class="framework-map" aria-labelledby="framework-title">
              <figcaption id="framework-title">How CorpOS governs work across teams</figcaption>
              <ol>
                <li>
                  <b>Work contract</b>
                  <strong>Who owes the next step?</strong>
                  <p>
                    Each handoff names the sender, the receiving team and the work it owes. The next
                    team can pick up Ada’s case without reconstructing the request from tickets.
                  </p>
                </li>
                <li>
                  <b>Delegation policy</b>
                  <strong>Who has authority to act?</strong>
                  <p>
                    CorpOS checks each proposed tool call against the agent’s authority. Routine
                    work can proceed within its limits. Requests that need judgment go to an
                    eligible reviewer.
                  </p>
                </li>
                <li>
                  <b>Execution and receipts</b>
                  <strong>What actually happened?</strong>
                  <p>
                    Before an approved change runs, the gateway rechecks the current rules. Its
                    records let the next shift see whether an action waited, was blocked or ran.
                  </p>
                </li>
              </ol>
            </figure>
            <button type="button" class="case-vote case-open" onClick={openFile}>
              {opened ? "Return to Ada’s file" : "Open Ada’s case file"}
            </button>
          </section>
          {opened && (
            <>
              <section class="case-block case-work" aria-labelledby="file-title">
                <p class="case-kicker">Ada’s case file · 09:05 UTC</p>
                <h2 id="file-title" tabIndex={-1}>
                  Who should take the next call?
                </h2>
                <p>
                  Read Ada’s message, check the refund ledger, then look at the service samples.
                  Assign someone to follow up.
                </p>
                <BillingObservations selection={selection} change={change} />
                {(selection.route !== "none" || decision) && (
                  <>
                    <h3 class="restart-title">Ops has requested a restart. Do you authorize it?</h3>
                    <p>
                      Finance handed Ops an obligation to check service health. That handoff gives
                      Ops ownership of the check. When Ops proposes changing the shared service,
                      CorpOS evaluates that new request under the restart policy. You’re reviewing
                      that exception.
                    </p>
                    <div class="case-actions-layout">
                      <div>
                        <fieldset class="case-choices">
                          <legend>Operator decision</legend>
                          {(Object.keys(decisions) as Decision[]).map((key) => (
                            <label key={key}>
                              <input
                                type="radio"
                                name="restart"
                                checked={decision === key}
                                onChange={() => {
                                  change({ decision: key, votes: "one" });
                                }}
                              />
                              {decisions[key].label}
                            </label>
                          ))}
                        </fieldset>
                        <div class="case-quorum" aria-label="Default restart approval path">
                          <p>Approval path</p>
                          {decision === "reject" ? (
                            <p class="case-note">
                              Closed. No votes or gateway recheck follow this rejection.
                            </p>
                          ) : (
                            <ol>
                              <li class={decision === "approve" ? "vote-recorded" : ""}>
                                First eligible vote{" "}
                                <b>{decision === "approve" ? "Recorded" : "Required"}</b>
                              </li>
                              <li class={secondVote ? "vote-recorded" : ""}>
                                Distinct second vote <b>{secondVote ? "Recorded" : "Required"}</b>
                              </li>
                              <li class={secondVote ? "vote-recorded" : ""}>
                                Gateway recheck <b>{secondVote ? "Eligible" : "Waiting"}</b>
                              </li>
                            </ol>
                          )}
                        </div>
                      </div>
                      {picked ? (
                        <div class="case-reading" aria-live="polite" aria-atomic="true">
                          <h3>{picked.result}</h3>
                          <p>{picked.evidence}</p>
                          {decision === "approve" && (
                            <button
                              type="button"
                              class="case-vote"
                              onClick={() => change({ votes: secondVote ? "one" : "two" })}
                            >
                              {secondVote ? "Return to one vote" : "Model a second eligible vote"}
                            </button>
                          )}
                          <p class="case-note">
                            Ledger effect in all three branches <b>· $49 refund retained</b>
                          </p>
                        </div>
                      ) : (
                        <p class="case-note">
                          The risk-4 request is awaiting a decision. Investigating a service symptom
                          does not authorize a tool action.
                        </p>
                      )}
                    </div>
                    <p class="case-note">
                      These branches rehearse the policy in your browser. Compare your decision with
                      the <a href={guide}>selected case trace and simulator trials</a>.
                    </p>
                  </>
                )}
              </section>
              {decision && (
                <>
                  <MandateReplay selection={selection} change={change} />
                  <Pilot selection={selection} change={change} />
                </>
              )}
            </>
          )}
          <details class="case-block case-sources">
            <summary>Case assumptions and sources</summary>
            <p>
              Ada’s customer report, service samples and pilot costs are illustrative. The six tool
              requests follow the seeded CorpOS simulator. Payment tracing, incident ownership and
              measuring operational effort draw on these practitioner guides.
            </p>
            <p>
              <a href="https://support.stripe.com/questions/how-to-trace-a-refund-using-reference-numbers">
                Stripe · Tracing a refund
              </a>{" "}
              ·{" "}
              <a href="https://sre.google/workbook/incident-response/">
                Google SRE · Incident response
              </a>{" "}
              ·{" "}
              <a href="https://sre.google/workbook/eliminating-toil/">
                Google SRE · Measuring toil
              </a>{" "}
              ·{" "}
              <a href="https://tag-app-delivery.cncf.io/whitepapers/platforms/">
                CNCF · Platform teams
              </a>
            </p>
          </details>
        </main>
      </div>
    </div>
  );
}
