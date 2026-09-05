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

type Governance = {
  aibom: { schema?: string; policyBundleHash?: string; agents?: unknown[] };
  killed: boolean;
  asiControls: Record<string, string>;
  nistRmf: Record<string, string>;
  note: string;
  spans: { operation: string; name: string; decisionId?: string }[];
};

const REVEAL_MS = 500;

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = (import.meta as { env?: { VITE_DASHBOARD_API_TOKEN?: string } }).env
    ?.VITE_DASHBOARD_API_TOKEN;
  const headers: Record<string, string> = { ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function App() {
  const [firm, setFirm] = useState<Firm | null>(null);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [day, setDay] = useState<CompanyDay | null>(null);
  const [gov, setGov] = useState<Governance | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<"ops" | "governor">("ops");
  const [dissent, setDissent] = useState("");
  const [liveTimeline, setLiveTimeline] = useState<TimelineEvent[]>([]);

  const refresh = async () => {
    const f = await fetch("/api/firm").then((r) => r.json());
    const e = await fetch("/api/exceptions").then((r) => r.json());
    const c = await fetch("/api/contracts").then((r) => r.json());
    const g = await fetch("/api/governance").then((r) => r.json());
    setFirm(f);
    setExceptions(e);
    setContracts(c);
    setGov(g);
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data) as {
          type?: string;
          payload?: TimelineEvent;
          kind?: string;
        };
        if (data.type === "timeline" && data.payload) {
          setLiveTimeline((prev) => [...prev, data.payload as TimelineEvent]);
        } else if (data.kind && (data as unknown as TimelineEvent).summary) {
          setLiveTimeline((prev) => [...prev, data as unknown as TimelineEvent]);
        }
      } catch {
        /* ignore heartbeat/parse */
      }
    };
    return () => es.close();
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
    setLiveTimeline([]);
    try {
      const r = (await fetch("/api/company-day", {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ autoApproveException: false }),
      }).then((res) => res.json())) as CompanyDay;
      setDay(r);
      await refresh();
    } finally {
      setRunning(false);
    }
  };

  const decide = async (id: string, decision: "approved" | "rejected") => {
    await fetch(`/api/exceptions/${id}/decide`, {
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({
        decision,
        dissentReason: decision === "rejected" ? dissent || "rejected by operator" : undefined,
      }),
    });
    setDissent("");
    await refresh();
  };

  const toggleKill = async () => {
    const next = !firm?.killed;
    if (next && !window.confirm("Engage kill switch? All tool invokes will deny.")) return;
    await fetch("/api/kill", {
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ killed: next }),
    });
    await refresh();
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
          <button type="button" class="ghost" onClick={() => void toggleKill()}>
            {firm?.killed ? "Release kill" : "Kill switch"}
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
                    <div>
                      L{e.riskLevel} {e.tool} — {e.reason}
                      <span class="kind">agent {e.agentId}</span>
                    </div>
                    <div class="actions" style="margin-top:0.5rem">
                      <button type="button" onClick={() => void decide(e.id, "approved")}>
                        Approve
                      </button>
                      <button
                        type="button"
                        class="ghost"
                        onClick={() => void decide(e.id, "rejected")}
                      >
                        Reject
                      </button>
                    </div>
                    <label class="muted">
                      Dissent reason
                      <input
                        value={dissent}
                        onInput={(ev) => setDissent((ev.target as HTMLInputElement).value)}
                        placeholder="Required narrative on reject"
                      />
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h2>Contracts</h2>
            {contracts.length === 0 ? (
              <p class="muted">No open contracts</p>
            ) : (
              <ul>
                {contracts.map((c) => (
                  <li key={c.id}>
                    <strong>{c.title}</strong> {c.state}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section
            class="company-day"
            data-company-day={dayStatus}
            data-timeline-visible={String(visibleCount)}
          >
            <h2>Company day</h2>
            {!day && liveTimeline.length === 0 ? (
              <p class="muted">Not run yet — watch agents hand off work across the firm.</p>
            ) : (
              <>
                {day ? (
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
                ) : null}
                <ol class="timeline" aria-live="polite">
                  {(day ? day.timeline.slice(0, visibleCount) : liveTimeline).map((evt) => (
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
            <p>Kill switch: {firm?.killed || gov?.killed ? "ENGAGED" : "off"}</p>
            <p class="muted">{gov?.note}</p>
          </section>
          <section>
            <h2>AIBOM</h2>
            <p>
              Policy bundle: <code>{gov?.aibom?.policyBundleHash ?? "—"}</code>
            </p>
            <p class="muted">Agents / tools / MCP servers inventoried in docs/aibom.json</p>
          </section>
          <section>
            <h2>OWASP ASI controls</h2>
            <ul>
              {gov &&
                Object.entries(gov.asiControls).map(([k, v]) => (
                  <li key={k}>
                    <strong>{k}</strong> {v}
                  </li>
                ))}
            </ul>
          </section>
          <section>
            <h2>NIST AI RMF crosswalk</h2>
            <ul>
              {gov &&
                Object.entries(gov.nistRmf).map(([k, v]) => (
                  <li key={k}>
                    <strong>{k}</strong> {v}
                  </li>
                ))}
            </ul>
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
