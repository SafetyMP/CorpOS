import type { CaseProps } from "./case-selection";
import { investigationReceipt, serviceCaptures, type Capture } from "./billing-observations";

const records = { ticket: "Customer report", ledger: "Refund ledger", probe: "Service samples" };
type RecordKey = keyof typeof records;

export function BillingObservations({ selection, change }: CaseProps) {
  const { record, capture, route } = selection;
  const choice = route === "none" ? null : route;
  const receipt = investigationReceipt(choice, selection.observed === "yes" ? capture : null);
  const selectRecord = (next: RecordKey) =>
    change(
      next === "probe" && selection.observed === "no"
        ? { record: next, observed: "yes", route: "none", decision: "none", votes: "one" }
        : { record: next },
    );
  const replay = (next: Capture) =>
    change({ capture: next, route: "none", decision: "none", votes: "one" });
  return (
    <div class="observation-desk">
      <h3>Evidence from the three teams</h3>
      <p class="case-note">Each record answers a different question about the same morning.</p>
      <div class="record-select" role="group" aria-label="Inspect an observation">
        {(Object.keys(records) as RecordKey[]).map((key) => (
          <button
            type="button"
            aria-pressed={record === key}
            onClick={() => selectRecord(key)}
            key={key}
          >
            {records[key]}
          </button>
        ))}
      </div>
      <div class="observation-record" aria-live="polite">
        {record === "ticket" && (
          <>
            <p class="record-meta">09:05 UTC · Support inbox</p>
            <blockquote>
              “I can see the $49 charge, but the credit still isn’t on my statement.”
            </blockquote>
            <p>
              Ada reports one missing credit. Her ticket contains no processor posting confirmation.
            </p>
          </>
        )}
        {record === "ledger" && (
          <>
            <p class="record-meta">09:02 UTC · Finance ledger</p>
            <dl class="ledger-observation">
              <div>
                <dt>Subscription</dt>
                <dd>sub_ada_pro</dd>
              </div>
              <div>
                <dt>Refund amount</dt>
                <dd>$49.00</dd>
              </div>
              <div>
                <dt>Ledger state</dt>
                <dd>Settled</dd>
              </div>
              <div>
                <dt>Bank posting</dt>
                <dd>Unknown</dd>
              </div>
            </dl>
          </>
        )}
        {record === "probe" && (
          <>
            <div class="capture-heading">
              <p class="record-meta">billing-api · Other accounts</p>
              <label>
                Service capture{" "}
                <select
                  value={capture}
                  onChange={(event) => replay(event.currentTarget.value as Capture)}
                >
                  <option value="A">Capture A</option>
                  <option value="B">Capture B</option>
                </select>
              </label>
            </div>
            <figure class="probe-chart">
              <figcaption>Failed requests in each sample of 100 · 0–20 chart scale</figcaption>
              {serviceCaptures[capture].map((failures, i) => (
                <div key={i} class="probe-row">
                  <span>09:0{2 + i}</span>
                  <span class="probe-track" aria-hidden="true">
                    <i style={{ width: `${failures * 5}%` }} />
                  </span>
                  <b>{failures} / 100</b>
                </div>
              ))}
            </figure>
            <p class="case-note">
              The usual range is 1–2 failures per 100. Switch captures to replay the same minutes
              with different service counts for the same refund.
            </p>
          </>
        )}
      </div>
      <fieldset class="case-choices investigation-choices">
        <legend>Route the investigation</legend>
        <label>
          <input
            type="radio"
            name="route-investigation"
            checked={choice === "payments"}
            onChange={() => change({ route: "payments" })}
          />
          Trace Ada’s credit
        </label>
        <label>
          <input
            type="radio"
            name="route-investigation"
            checked={choice === "incident"}
            onChange={() => change({ route: "incident" })}
          />
          Page the incident lead
        </label>
      </fieldset>
      {receipt && (
        <div class="investigation-receipt" aria-live="polite">
          <h4>Assigned to {receipt.owner}</h4>
          <p>{receipt.assignment}</p>
          <p>{receipt.assessment}</p>
        </div>
      )}
    </div>
  );
}
