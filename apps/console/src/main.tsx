import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { parseSelection, workspaceLink, type Selection } from "./case-selection";
import { TechnicalGuide } from "./TechnicalGuide";
import { BillingCase } from "./BillingCase";
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

async function post<T>(path: string, body: object): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: authHeaders({ "content-type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (response.status === 401)
    throw new Error(
      "Dashboard credentials are required for this action. You can explore the billing case without signing in.",
    );
  if (!response.ok)
    throw new Error(
      `The simulator declined the request (HTTP ${response.status}). Refresh the queue before retrying.`,
    );
  return response.json() as Promise<T>;
}

function OpsConsole({ tab }: { tab: "ops" | "governor" }) {
  const [firm, setFirm] = useState<Firm | null>(null);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [day, setDay] = useState<CompanyDay | null>(null);
  const [gov, setGov] = useState<Governance | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
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
    void refresh().catch(() =>
      setNotice("Start the local CorpOS API to inspect the simulated company day."),
    );
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
      setNotice("");
      const result = await post<CompanyDay>("/api/company-day", { autoApproveException: false });
      setDay(result);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The simulator could not run this day.");
    } finally {
      setRunning(false);
    }
  };

  const decide = async (id: string, decision: "approved" | "rejected") => {
    try {
      const result = await post<{ quorumPending?: boolean; votes?: number; executed?: boolean }>(
        `/api/exceptions/${id}/decide`,
        {
          decision,
          dissentReason: decision === "rejected" ? dissent || "rejected by operator" : undefined,
        },
      );
      if (result.quorumPending) {
        setNotice(`Exception pending. Eligible approval votes recorded: ${result.votes ?? 0}.`);
      } else if (decision === "approved" && result.executed === false) {
        setNotice("Approval recorded. The gateway blocked execution.");
      } else {
        setNotice("The decision was recorded. Check the queue for the latest state.");
      }
      setDissent("");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The decision could not be submitted.");
    }
  };

  const toggleKill = async () => {
    const next = !firm?.killed;
    if (next && !window.confirm("Engage kill switch? All tool invokes will deny.")) return;
    try {
      await post("/api/kill", { killed: next });
      await refresh();
      setNotice(next ? "Kill switch engaged." : "Kill switch released.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The kill switch could not be changed.");
    }
  };

  const timelineDone = Boolean(day && visibleCount >= day.timeline.length);
  const dayStatus = !day ? "idle" : timelineDone ? "complete" : "running";

  return (
    <div class="shell">
      <header>
        <div>
          <p class="eyebrow">
            CorpOS · <a href="#case">Billing case</a> · <a href="#guide">Technical reference</a>
          </p>
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
            onClick={() => {
              window.location.hash = tab === "ops" ? "#governor" : "#ops";
            }}
          >
            {tab === "ops" ? "Governor" : "Ops"}
          </button>
        </div>
      </header>

      <p role="status">{notice}</p>

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

function App() {
  const [hash, setHash] = useState(window.location.hash);
  const route = hash.split("?")[0];
  const selection = parseSelection(hash);
  const change = (patch: Partial<Selection>) => {
    const next = workspaceLink(route === "#guide" ? "guide" : "case", { ...selection, ...patch });
    window.history.replaceState(window.history.state, "", next);
    setHash(next);
  };
  useEffect(() => {
    const navigate = () => {
      setHash(window.location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);
  const consoleRoute = route === "#ops" || route === "#governor";
  return (
    <>
      <div hidden={consoleRoute || route === "#guide"}>
        <BillingCase selection={selection} change={change} />
      </div>
      {route === "#guide" && <TechnicalGuide selection={selection} change={change} />}
      {consoleRoute && <OpsConsole tab={route === "#ops" ? "ops" : "governor"} />}
    </>
  );
}

const root = document.getElementById("app");
if (!root) {
  throw new Error("CorpOS console root #app not found");
}
render(<App />, root);
