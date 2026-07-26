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

function App() {
  const [firm, setFirm] = useState<Firm | null>(null);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [day, setDay] = useState<Record<string, unknown> | null>(null);
  const [tab, setTab] = useState<"ops" | "governor">("ops");

  const refresh = async () => {
    const f = await fetch("/api/firm").then((r) => r.json());
    const e = await fetch("/api/exceptions").then((r) => r.json());
    setFirm(f);
    setExceptions(e);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const runDay = async () => {
    const r = await fetch("/api/company-day", { method: "POST" }).then((res) => res.json());
    setDay(r);
    await refresh();
  };

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
          <button type="button" onClick={() => void runDay()}>
            Run company day
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
            <h2>Company day</h2>
            {day ? <pre>{JSON.stringify(day, null, 2)}</pre> : <p class="muted">Not run yet</p>}
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

render(<App />, document.getElementById("app")!);
