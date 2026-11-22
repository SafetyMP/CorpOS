import { effectLabels, replay, requests, type Mandate } from "./billing-observations";

export function BillingObservations({
  selected,
  onSelect,
  applied,
}: {
  selected: number;
  onSelect: (i: number) => void;
  applied: Mandate | null;
}) {
  const active = requests[selected];
  return (
    <div class="trace-panel">
      <h2>Contract trace</h2>
      <p class="desk-hint">Select a request to inspect its authority and obligation.</p>
      <ol class="trace-list" aria-label="Recorded tool requests">
        {requests.map((r, i) => (
          <li key={r.action}>
            <button type="button" aria-pressed={i === selected} onClick={() => onSelect(i)}>
              <span class="trace-number">{String(i + 1).padStart(2, "0")}</span>
              <span>
                <small>{r.team}</small>
                <strong>{r.action}</strong>
              </span>
              <span class="trace-symbol" aria-hidden="true">
                {i === selected ? "●" : "○"}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div class="trace-inspector" aria-live="polite">
        <code>{active.tool}</code>
        <p>{active.evidence}</p>
        {applied && (
          <small>Replay disposition · {effectLabels[replay(applied)[selected].candidate]}</small>
        )}
      </div>
    </div>
  );
}
