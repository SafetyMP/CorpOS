import { useState } from "preact/hooks";

const decisions = {
  hold: {
    label: "Keep it queued",
    result: "The restart waits for an operator.",
    evidence:
      "Request billing error rates and a service-owner assessment. The handoff asks Ops to confirm service health. It supplies no evidence that a restart would fix a fault.",
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
      "Record why this change lacks a service-health justification. Support can close the refund issue while the service owner investigates the billing service separately.",
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

function Pilot() {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(assumptions.map((a) => [a.key, a.initial])),
  );
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
        As the platform engineering lead, partner with billing developers and their on-call team.
        Compare today’s manual handoffs and a checklist in the existing ticket queue with a 30-day
        shadow pilot that drafts handoffs while staff retain control.
      </p>
      <div class="case-calculator">
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
                onInput={(e) => setValues({ ...values, [a.key]: e.currentTarget.value })}
              />
            </label>
          ))}
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

const handoffs = {
  support: {
    team: "Support",
    action: "Check Ada’s subscription",
    status: "Handed to Finance",
    tool: "crm.lookup",
    detail:
      "Support looks up the customer, checks refund guidance and assigns Finance the $49 refund obligation.",
  },
  finance: {
    team: "Finance",
    action: "Issue the $49 refund",
    status: "Settled on ledger",
    tool: "billing.issue_refund",
    detail:
      "Finance settles the refund and asks Ops to confirm service health. The refund receipt establishes the customer transaction. Billing service health still needs independent evidence.",
  },
  ops: {
    team: "Ops",
    action: "Restart billing-api",
    status: "Queued for review",
    tool: "ops.restart_service",
    detail: "",
  },
} as const;
type Stage = keyof typeof handoffs;

export function BillingCase() {
  const [stage, setStage] = useState<Stage>("ops");
  const [decision, setDecision] = useState<Decision>("hold");
  const [secondVote, setSecondVote] = useState(false);
  const picked =
    decision === "approve" && secondVote
      ? {
          result: "Two eligible votes. The gateway rechecks.",
          evidence:
            "The second distinct vote satisfies the default quorum. The gateway can still block execution if the kill switch is engaged or policy denies the action. The on-call engineer checks service telemetry even when a tool receipt confirms the restart.",
        }
      : decisions[decision];
  return (
    <div class="case-page">
      <div class="case-wrap">
        <nav aria-label="Case navigation">
          <strong>CorpOS</strong>
          <span class="case-nav-links">
            <a href="#guide">Technical guide</a>
            <a href="#ops">Open ops console</a>
          </span>
        </nav>
        <main>
          <header class="case-header">
            <div>
              <p class="case-kicker">On-call desk · Company-day simulation</p>
              <h1>Billing handoff</h1>
              <p>
                Finance settled Ada’s refund and asked for a health check. Ops wants to restart the
                shared billing service.
              </p>
            </div>
          </header>
          <ol class="case-route" aria-label="Company-day handoff timeline">
            {(Object.keys(handoffs) as Stage[]).map((key) => {
              const entry = handoffs[key];
              let status: string = entry.status;
              if (key === "ops" && decision === "reject") status = "Request rejected";
              if (key === "ops" && decision === "approve")
                status = secondVote ? "Gateway recheck" : "Queued · 1 of 2 votes";
              return (
                <li key={key}>
                  <button
                    type="button"
                    aria-pressed={stage === key}
                    onClick={() => setStage(key)}
                    class="case-stage"
                  >
                    <span class="case-stage-team">{entry.team}</span>
                    <strong>{entry.action}</strong>
                    <span class={key === "ops" ? "case-state ops-state" : "case-state"}>
                      {status}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          {stage !== "ops" ? (
            <section class="case-block" aria-label={handoffs[stage].team + " handoff details"}>
              <p class="case-kicker">{handoffs[stage].team} · Handoff record</p>
              <h2>{handoffs[stage].action}</h2>
              <code>{handoffs[stage].tool}</code>
              <p>{handoffs[stage].detail}</p>
              <button type="button" class="case-vote" onClick={() => setStage("ops")}>
                Review Ops request
              </button>
            </section>
          ) : (
            <section class="case-block case-work" id="decision" aria-labelledby="decision-title">
              <p class="case-kicker">Ops · Risk 4 exception</p>
              <h2 id="decision-title">Review the restart request</h2>
              <p class="case-request">
                <code>ops.restart_service</code> <span>target</span> <code>billing-api</code>
              </p>
              <p>
                As billing’s on-call engineer, check whether there is an incident to escalate. The
                service owner needs error telemetry. An incident commander coordinates the response
                if an incident is declared.
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
                            setDecision(key);
                            setSecondVote(false);
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
                <div class="case-reading" aria-live="polite" aria-atomic="true">
                  <h3>{picked.result}</h3>
                  <p>{picked.evidence}</p>
                  {decision === "approve" && (
                    <button
                      type="button"
                      class="case-vote"
                      onClick={() => setSecondVote(!secondVote)}
                    >
                      {secondVote ? "Return to one vote" : "Model a second eligible vote"}
                    </button>
                  )}
                  <p class="case-note">
                    Ledger effect in all three branches <b>· $49 refund retained</b>
                  </p>
                </div>
              </div>
              <p class="case-note">
                These branches rehearse the policy in your browser. To inspect a simulator run, open
                the <a href="#guide">technical guide</a>.
              </p>
            </section>
          )}
          <Pilot />
          <section class="case-block case-sources">
            <h2>What informed this case</h2>
            <p>
              Google’s SRE practitioners describe assigning incident roles and keeping a working
              record. Those practices motivate asking who owns the restart and what evidence the
              handoff carries.{" "}
              <a href="https://sre.google/workbook/incident-response/">Incident Response</a>
            </p>
            <p>
              The CNCF Platforms White Paper identifies platform leaders and partner application
              teams as the people who jointly select early use cases and measure impact. That
              informed the choice of pilot sponsor and the comparison with billing developers’
              current workflow.{" "}
              <a href="https://tag-app-delivery.cncf.io/whitepapers/platforms/">
                CNCF Platforms White Paper
              </a>
            </p>
            <p>
              Google SRE’s approach to reducing repetitive operational work starts with measuring
              time and comparing interventions. That informs the worksheet. Its prices and workload
              come from the illustrative case.{" "}
              <a href="https://sre.google/workbook/eliminating-toil/">Eliminating Toil</a>
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
