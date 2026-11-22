import { useState } from "preact/hooks";
import { BillingObservations } from "./BillingObservations";
import {
  controls,
  effectLabels,
  recordedMandate,
  replay,
  type Effect,
  type Mandate,
} from "./billing-observations";

export function BillingCase() {
  const [selected, setSelected] = useState(0);
  const [draft, setDraft] = useState<Mandate>(recordedMandate);
  const [applied, setApplied] = useState<Mandate | null>(null);
  const [decision, setDecision] = useState("");
  const rows = applied && replay(applied);
  const changed = rows?.filter((r) => r.recorded !== r.candidate) ?? [];
  const reviews = rows?.filter((r) => r.candidate === "approve").length ?? 0;
  const denied = rows?.filter((r) => r.candidate === "deny").length ?? 0;
  const repeat = () => {
    setApplied({ ...draft });
    setDecision("");
  };

  return (
    <div class="mandate">
      <div class="desk-wrap">
        <nav class="desk-nav" aria-label="CorpOS navigation">
          <strong>CorpOS</strong>
          <span>Platform engineering</span>
          <a href="#guide">Technical reference ↗</a>
        </nav>
        <main>
          <div class="desk-intro">
            <div>
              <p class="desk-label">Delegation policy simulator</p>
              <h1>Who signs for the agent?</h1>
              <p class="desk-lede">
                Trace a billing contract across three agents as Operations requests a restart of a
                shared service. As the platform owner, decide which requests deserve a human
                signature before you pilot the policy.
              </p>
            </div>
          </div>
          <div class="desk-spread">
            <BillingObservations selected={selected} onSelect={setSelected} applied={applied} />
            <div class="desk-work">
              <section class="mandate-editor" aria-labelledby="mandate-title">
                <p class="desk-label">Policy editor</p>
                <h2 id="mandate-title">Draft a delegation mandate</h2>
                <p>
                  Start with the recorded rules. Change who can pass work, stage a credit or request
                  a restart. The two read-only requests stay allowed.
                </p>
                <fieldset>
                  <legend>Proposed rules</legend>
                  {controls.map((c) => (
                    <label key={c.key}>
                      <span>{c.label}</span>
                      <select
                        value={draft[c.key]}
                        onChange={(e) => {
                          setDraft({ ...draft, [c.key]: e.currentTarget.value as Effect });
                          setApplied(null);
                          setDecision("");
                        }}
                      >
                        {c.options.map((o) => (
                          <option key={o} value={o}>
                            {effectLabels[o]}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </fieldset>
                <div class="desk-actions">
                  <button class="ink-button" type="button" onClick={repeat}>
                    Replay six requests <span aria-hidden="true">→</span>
                  </button>
                  <button
                    class="text-button"
                    type="button"
                    onClick={() => {
                      setDraft(recordedMandate);
                      setApplied(null);
                      setDecision("");
                      setSelected(0);
                    }}
                  >
                    Reset to recorded rules
                  </button>
                </div>
              </section>
              {rows && applied && (
                <section class="proof" aria-label="Replay proof">
                  <div role="status">
                    <p class="desk-label">Replay proof</p>
                    <h2>{changed.length} of 6 dispositions changed</h2>
                    <p>
                      Each recorded request is evaluated independently. A denied handoff could
                      prevent later work in a real run.
                    </p>
                  </div>
                  <figure class="signature-map">
                    <figcaption>Where the proposal sends work for a signature</figcaption>
                    {["Support", "Finance", "Operations"].map((team) => {
                      const teamRows = rows.filter((r) => r.team === team);
                      const signatures = teamRows.filter((r) => r.candidate === "approve").length;
                      return (
                        <div class="signature-lane" key={team}>
                          <strong>{team}</strong>
                          <span class="signature-slots" aria-hidden="true">
                            {teamRows.map((r) => (
                              <i key={r.action} class={r.candidate === "approve" ? "signed" : ""} />
                            ))}
                          </span>
                          <span>
                            {signatures} of {teamRows.length}
                          </span>
                        </div>
                      );
                    })}
                  </figure>
                  <table>
                    <caption>Request-by-request comparison</caption>
                    <thead>
                      <tr>
                        <th scope="col">Request</th>
                        <th scope="col">Recorded</th>
                        <th scope="col">Proposed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={r.action} class={r.candidate !== r.recorded ? "amended" : ""}>
                          <th scope="row">
                            {i + 1}. {r.action}
                          </th>
                          <td>{effectLabels[r.recorded]}</td>
                          <td>
                            {effectLabels[r.candidate]}
                            {r.candidate !== r.recorded && <small>Changed</small>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p class="review-cost">
                    <b>
                      {reviews} {reviews === 1 ? "request" : "requests"} would need human review
                    </b>{" "}
                    against 1 in the recorded day. {denied} would be denied. Each entry counts once,
                    even when a quorum needs multiple votes.
                  </p>
                  <div class="signoff">
                    <h3>Policy owner’s disposition</h3>
                    <p>Choose which policy to carry into a supervised pilot.</p>
                    <div class="desk-actions">
                      <button
                        type="button"
                        aria-pressed={decision === "candidate"}
                        onClick={() => setDecision("candidate")}
                      >
                        Take proposal to pilot
                      </button>
                      <button
                        type="button"
                        aria-pressed={decision === "recorded"}
                        onClick={() => setDecision("recorded")}
                      >
                        Keep recorded policy
                      </button>
                    </div>
                    {decision && (
                      <p role="status" class="filed">
                        <strong>Review recorded locally</strong> ·{" "}
                        {decision === "candidate" ? "Proposed mandate" : "Recorded mandate"}.{" "}
                        {decision === "candidate" ? reviews : 1} of 6 requests routed to human
                        review. {decision === "candidate" ? denied : 0} denied. Use another company
                        day to test whether this oversight load holds.
                      </p>
                    )}
                  </div>
                </section>
              )}
            </div>
          </div>
        </main>
        <footer>
          Scripted company day. Replays stay in this browser session and do not apply policy to a
          running firm. <a href="#guide">Architecture and sources</a>
        </footer>
      </div>
    </div>
  );
}
