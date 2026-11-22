export function TechnicalGuide() {
  return (
    <div class="case-page">
      <div class="case-wrap">
        <nav aria-label="Technical guide navigation">
          <strong>CorpOS</strong>
          <a href="#case">Back to billing case</a>
        </nav>
        <main class="tech-guide">
          <header class="case-header">
            <p class="case-kicker">Technical guide</p>
            <h1>Trace the billing handoff</h1>
            <p>
              Follow one work contract from the scripted request to a simulator decision and its
              audit record.
            </p>
          </header>
          <section class="case-block">
            <h2>Where the evidence comes from</h2>
            <dl class="guide-records">
              <div>
                <dt>Browser case</dt>
                <dd>
                  The customer quote, posting status and 09:02–09:04 service counts are authored
                  observations. The capture selector changes only the failed-request series.
                  Investigation assignments and votes stay in browser memory. The worksheet
                  calculates staff capacity from your inputs. Neither surface submits work to the
                  simulator.
                </dd>
              </div>
              <div>
                <dt>Simulator run</dt>
                <dd>
                  <b>Run company day</b> submits the deterministic Support, Finance and Ops script
                  to the local API. The shared firm store supplies the queue, contracts and audit
                  head. Dashboard credentials are required to run the day or submit a decision.
                </dd>
              </div>
              <div>
                <dt>Regression evidence</dt>
                <dd>
                  The company-day tests run an in-memory firm. They check the settled refund, a
                  pending restart after a repeated vote and a gateway denial when the kill switch is
                  engaged before the second eligible vote.{" "}
                  <a href="https://github.com/SafetyMP/CorpOS/blob/main/test/company-day.test.ts">
                    Company-day tests
                  </a>
                </dd>
              </div>
            </dl>
          </section>
          <section class="case-block">
            <h2>Inspect a run</h2>
            <div class="guide-tools">
              <div>
                <h3>Exception queue</h3>
                <p>
                  Run the company day. Match the service name and tool in the Ops timeline to the
                  queued change. The server binds votes to the configured operator identity.
                </p>
                <a href="#ops">Open ops console</a>
              </div>
              <div>
                <h3>Governor</h3>
                <p>
                  Examine the audit head, policy bundle hash and kill-switch state. A permitted
                  restart would still require service telemetry to verify recovery.
                </p>
                <a href="#governor">Open Governor</a>
              </div>
            </div>
          </section>
          <p class="guide-source">
            <a href="https://github.com/SafetyMP/CorpOS/blob/main/packages/core/src/company-day.ts">
              Scripted workload
            </a>{" "}
            ·{" "}
            <a href="https://github.com/SafetyMP/CorpOS/blob/main/docs/adr/0017-governance-pdp-pep.md">
              Gateway architecture
            </a>{" "}
            · <a href="https://github.com/SafetyMP/CorpOS#quick-start">Run locally</a>
          </p>
        </main>
      </div>
    </div>
  );
}
