import { requests } from "./billing-observations";

const teams = ["Support", "Finance", "Operations"];

export function ActorTrace({
  selected,
  onSelect,
  selectedEffect,
}: {
  selected: number;
  onSelect: (i: number) => void;
  selectedEffect: string;
}) {
  const active = requests[selected];
  return (
    <section class="trace-panel" aria-labelledby="trace-heading">
      <div class="trace-heading">
        <div>
          <p class="desk-label">Ada’s billing contract</p>
          <h2 id="trace-heading">Request trace</h2>
        </div>
        <span>6 calls · $49 refund</span>
      </div>
      <div class="trace-console">
        <div class="trace-board">
          <p class="desk-hint">
            Support opens one contract for Ada’s $49 refund with a four-hour deadline. Select a call
            to see which team took responsibility and what it requested.
          </p>
          <div class="trace-scale" aria-hidden="true">
            <span>Actor</span>
            <b>01</b>
            <b>02</b>
            <b>03</b>
            <b>04</b>
            <b>05</b>
            <b>06</b>
          </div>
          {teams.map((team, teamIndex) => (
            <div class="trace-lane" data-team={team} key={team}>
              <span class="trace-actor">{team}</span>
              {requests.map((r, i) =>
                r.team === team ? (
                  <button
                    style={{ gridColumn: i + 2 }}
                    key={r.action}
                    type="button"
                    aria-label={`Request ${i + 1}, ${r.team}, ${r.action}`}
                    aria-pressed={i === selected}
                    onClick={() => onSelect(i)}
                  >
                    <span class="trace-point" aria-hidden="true">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <strong>{r.action}</strong>
                  </button>
                ) : null,
              )}
              {teamIndex < 2 && (
                <i
                  class="handoff-connector"
                  aria-hidden="true"
                  style={{ gridColumn: teamIndex === 0 ? 4 : 6 }}
                />
              )}
            </div>
          ))}
        </div>
        <div class="trace-inspector" aria-live="polite">
          <p class="desk-label">
            Request {String(selected + 1).padStart(2, "0")} / {active.team}
          </p>
          <h3>{active.action}</h3>
          <code>{active.tool}</code>
          <p>{active.evidence}</p>
          <small>{selectedEffect}</small>
        </div>
      </div>
    </section>
  );
}
