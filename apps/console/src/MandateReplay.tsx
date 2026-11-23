import { controls, effectLabels, replay } from "./billing-observations";
import { workspaceLink, type CaseProps } from "./case-selection";

export function MandateReplay({ selection, change }: CaseProps) {
  const rows = replay(selection);
  const reviews = rows.filter((row) => row.candidate === "approve").length;
  const denied = rows.filter((row) => row.candidate === "deny").length;
  return (
    <section class="case-block mandate-replay" aria-labelledby="mandate-title">
      <p class="case-kicker">Platform lead · Delegation policy</p>
      <h2 id="mandate-title">Which requests deserve a signature?</h2>
      <p>
        On Ada’s contract the policy allowed both transfers, staged the credit and sent the restart
        to review. Change “Cross-team handoffs” to “Human review” to see where staff would wait in
        the next case.
      </p>
      <div class="mandate-controls">
        {controls.map((control) => (
          <label key={control.key}>
            {control.label}
            <select
              value={selection[control.key]}
              onChange={(e) => change({ [control.key]: e.currentTarget.value, compared: "yes" })}
            >
              {control.options.map((effect) => (
                <option key={effect} value={effect}>
                  {effectLabels[effect]}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {selection.compared === "no" ? (
        <button type="button" class="case-vote" onClick={() => change({ compared: "yes" })}>
          Replay recorded rules
        </button>
      ) : (
        <div aria-live="polite" class="mandate-receipt">
          <h3>{reviews} of 6 requests need human review</h3>
          <ol>
            {rows.map((row) => (
              <li key={row.action} data-result={row.candidate}>
                <span>{row.action}</span>
                <b>{effectLabels[row.candidate]}</b>
              </li>
            ))}
          </ol>
          <p>
            The recorded policy sent one request to review. Your rules send {reviews} and deny{" "}
            {denied}. Each proposal is scored independently. In a full run, blocking a handoff could
            prevent later requests.
          </p>
          <p>
            {selection.handoff === "approve"
              ? "Support would wait for a signature to pass the credit to Finance. Finance would wait again to hand the service check to Ops."
              : selection.handoff === "deny"
                ? "Under this mandate both transfers would be blocked. Someone would have to take ownership outside the delegated workflow."
                : "Support and Finance can assign the next team as soon as each has its evidence."}
          </p>
          <a href={workspaceLink("guide", { ...selection, panel: "policy" })}>
            Inspect these policy decisions
          </a>
          <button
            type="button"
            class="case-vote"
            onClick={() =>
              change({ handoff: "allow", refund: "draft", restart: "approve", compared: "no" })
            }
          >
            Restore recorded rules
          </button>
        </div>
      )}
    </section>
  );
}
