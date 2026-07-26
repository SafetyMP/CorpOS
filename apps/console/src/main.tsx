import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import "./styles.css";

type Firm = {
  departments: { id: string; name: string; capitalBudget: number; capitalSpent: number }[];
  agents: {
    id: string;
    role: string;
    department: string;
    owner: string;
    maxAutonomousRisk: number;
    trustScore: number;
  }[];
  killed: boolean;
  auditHead: string;
};

type Exception = {
  id: string;
  tool: string;
  reason: string;
  riskLevel: number;
  agentId: string;
};

type Contract = {
  id: string;
  title: string;
  state: string;
  assigneesJson?: string;
};

type TimelineEvent = {
  id: string;
  agentId: string;
  role: string;
  kind: string;
  summary: string;
};

type CompanyDay = {
  contractId: string;
  handoffs: number;
  autonomousSettles: number;
  exceptionSettles: number;
  compensated: number;
  trustAfter: number;
  slaExceptions: number;
  auditHead: string;
  ok: boolean;
  timeline: TimelineEvent[];
};

const REVEAL_MS = 500;

function App() {
  const [firm, setFirm] = useState<Firm | null>(null);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [day, setDay] = useState<CompanyDay | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<"ops" | "governor">("ops");

  const refresh = async () => {
    const f = await fetch("/api/firm").then((r) => r.json());
    const e = await fetch("/api/exceptions").then((r) => r.json());
    const c = await fetch("/api/contracts").then((r) => r.json());
    setFirm(f);
    setExceptions(e);
    setContracts(c);
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!day?.timeline.length) {
      setVisibleCount(0);
      return;
    }
    setVisibleCount(0);
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      setVisibleCount(n);
      if (n >= day.timeline.length) {
        window.clearInterval(id);
      }
    }, REVEAL_MS);
    return () => window.clearInterval(id);
  }, [day]);

  const runDay = async () => {
    setRunning(true);
    setDay(null);
    setVisibleCount(0);
    try {
      const r = (await fetch("/api/company-day", { method: "POST" }).then((res) =>
        res.json(),
      )) as CompanyDay;
      setDay(r);
      await refresh();
    } finally {
      setRunning(false);
    }
  };

  const timelineDone = Boolean(day && visibleCount >= day.timeline.length);
  const dayStatus = !day ? "idle" : timelineDone ? "complete" : "running";

  return (
    <div class="shell">
      <header>
        <div>
          <p class="eyebrow">CorpOS</p>
          <h1>Autonomous company ops</h1>
          <p class="lede">
            Authority, capital, exceptions, and earned autonomy — humans govern by exception.
          </p>
        </div>
        <div class="actions">
          <button type="button" disabled={running} onClick={() => void runDay()}>
            {running ? "Running…" : "Run company day"}
          </button>
          <button
            type="button"
            class="ghost"
            onClick={() => setTab(tab === "ops" ? "governor" : "ops")}
          >
            {tab === "ops" ? "Governor" : "Ops"}
          </button>
        </div>
      </header>

      {tab === "ops" ? (
        <main class="grid">
          <section>
            <h2>Capital</h2>
            <ul>
              {firm?.departments.map((d) => (
                <li key={d.id}>
                  <strong>{d.name}</strong> {d.capitalSpent}/{d.capitalBudget}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2>Trust</h2>
            <ul>
              {firm?.agents.map((a) => (
                <li key={a.id}>
                  <strong>{a.role}</strong> maxRisk={a.maxAutonomousRisk} (owner {a.owner})
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2>Exception queue</h2>
            {exceptions.length === 0 ? (
              <p class="muted">No pending exceptions</p>
            ) : (
              <ul>
                {exceptions.map((e) => (
                  <li key={e.id}>
                    L{e.riskLevel} {e.tool} — {e.reason}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2>Contracts</h2>
            {contracts.length === 0 && !day?.contractId ? (
              <p class="muted">No open contracts</p>
            ) : (
              <ul>
                {contracts.map((c) => (
                  <li key={c.id}>
                    <strong>{c.title}</strong> {c.state}
                  </li>
                ))}
                {day?.contractId && !contracts.some((c) => c.id === day.contractId) ? (
                  <li key={day.contractId}>
                    <strong>Company day</strong> {day.contractId} (demo run)
                  </li>
                ) : null}
              </ul>
            )}
          </section>
          <section
            class="company-day"
            data-company-day={dayStatus}
            data-timeline-visible={String(visibleCount)}
          >
            <h2>Company day</h2>
            {!day ? (
              <p class="muted">Not run yet — watch agents hand off work across the firm.</p>
            ) : (
              <>
                <div class="metrics" data-testid="day-metrics">
                  <span>
                    Handoffs <strong>{day.handoffs}</strong>
                  </span>
                  <span>
                    Autonomous <strong>{day.autonomousSettles}</strong>
                  </span>
                  <span>
                    Exceptions <strong>{day.exceptionSettles}</strong>
                  </span>
                  <span>
                    Trust <strong>{day.trustAfter}</strong>
                  </span>
                  <span>
                    Status <strong>{day.ok ? "ok" : "incomplete"}</strong>
                  </span>
                </div>
                <ol class="timeline" aria-live="polite">
                  {day.timeline.slice(0, visibleCount).map((evt) => (
                    <li key={evt.id} data-timeline-id={evt.id} data-timeline-kind={evt.kind}>
                      <div class="role">{evt.role}</div>
                      <div>
                        <p class="summary">{evt.summary}</p>
                        <span class="kind">{evt.kind.split("_").join(" ")}</span>
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </section>
        </main>
      ) : (
        <main class="grid">
          <section>
            <h2>Governor</h2>
            <p>
              Audit head: <code>{firm?.auditHead ?? "—"}</code>
            </p>
            <p class="muted">
              Counterfactual replay and audit verification are available via API /
              <code>npm run audit:verify</code>.
            </p>
            <p>Kill switch: {firm?.killed ? "ENGAGED" : "off"}</p>
          </section>
        </main>
      )}
    </div>
  );
}

const root = document.getElementById("app");
if (!root) {
  throw new Error("CorpOS console root #app not found");
}
render(<App />, root);
