const source = "https://github.com/SafetyMP/CorpOS/blob/main/";

const components = [
  [
    "Company-day script",
    "Support, Finance and Operations share a contract. The deterministic provider supplies six ordered calls.",
    "packages/core/src/company-day.ts",
  ],
  [
    "Policy and gateway",
    "The policy engine evaluates proposals. The gateway rechecks authority, stop state and spending limits before execution.",
    "packages/core/src/gateway.ts",
  ],
  [
    "Counterfactual replay",
    "The core compares recorded tool decisions with candidate rules. It reports changed dispositions without running the tools.",
    "packages/core/src/counterfactual.ts",
  ],
  [
    "Audit receipts",
    "The hash chain links each stored event to its predecessor. The verification script checks that chain.",
    "scripts/audit-verify.ts",
  ],
];

export function TechnicalGuide() {
  return (
    <div class="mandate">
      <div class="desk-wrap tech-sheet">
        <nav class="desk-nav" aria-label="CorpOS navigation">
          <strong>CorpOS</strong>
          <a href="#case">← Delegation desk</a>
        </nav>
        <main>
          <p class="desk-label">Engineering reference</p>
          <h1>Inside the policy replay</h1>
          <p class="tech-flow">
            Preact workspace <span>→</span> Hono API <span>→</span> firm store &amp; tool gateway
          </p>
          <dl class="component-register">
            {components.map(([name, summary, path]) => (
              <div key={path}>
                <dt>
                  <a href={source + path}>{name}</a>
                </dt>
                <dd>{summary}</dd>
              </div>
            ))}
          </dl>
          <p>
            <strong>Demo boundary.</strong> The browser replays exact-tool rules over a fixture of
            the seeded day. The API evaluates stored task traces and enforces operational controls
            on execution. Review in the browser creates no server record.
          </p>
          <p>
            <a href={source + "test/billing-observations.test.ts"}>Replay parity tests</a> ·{" "}
            <a href={source + "test/company-day.test.ts"}>Company-day tests</a> ·{" "}
            <a href="https://github.com/SafetyMP/CorpOS#quick-start">Run locally</a>
          </p>
          <details>
            <summary>Industry references</summary>
            <p>
              Historical replay and explicit human oversight informed the exercise.{" "}
              <a href="https://docs.cloud.google.com/policy-intelligence/docs/pab-simulator-overview">
                Google Cloud Policy Simulator
              </a>{" "}
              · <a href="https://doi.org/10.6028/NIST.AI.100-1">NIST AI RMF, GOVERN 3.2</a>
            </p>
          </details>
        </main>
      </div>
    </div>
  );
}
