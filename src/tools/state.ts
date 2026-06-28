export interface Contact {
  id: string;
  name: string;
  email: string;
  company?: string;
  plan?: string;
  status: string;
  createdAt: string;
}

export interface Deal {
  id: string;
  contactId: string;
  title: string;
  value: number;
  currency: string;
  stage: string;
  createdAt: string;
}

export interface Subscription {
  id: string;
  contactId: string;
  plan: string;
  status: string;
  amount: number;
  currency: string;
  startedAt: string;
  renewalAt?: string;
}

export interface KbArticle {
  id: string;
  title: string;
  tags: string[];
  summary: string;
  body: string;
}

export interface CommRecord {
  id: string;
  channel: "email" | "slack";
  direction: "inbound" | "outbound";
  to?: string;
  subject?: string;
  body: string;
  contactId?: string;
  contactEmail?: string;
  threadId: string;
  ts: string;
}

export type ServiceStatus = "healthy" | "degraded" | "down";

export interface ServiceHealth {
  status: ServiceStatus;
  latencyMs: number;
  uptimePct: number;
  lastCheck: string;
}

export interface SystemService {
  id: string;
  name: string;
  status: ServiceStatus;
  health: ServiceHealth;
}

export type AlertSeverity = "low" | "medium" | "high" | "critical";

export interface Alert {
  id: string;
  severity: AlertSeverity;
  serviceId?: string;
  message: string;
  status: "open" | "acknowledged" | "resolved";
  createdAt: string;
}

export interface CompanyState {
  contacts: Contact[];
  deals: Deal[];
  subscriptions: Subscription[];
  kbArticles: KbArticle[];
  commsLog: CommRecord[];
  systemServices: SystemService[];
  alerts: Alert[];
}

function freshState(): CompanyState {
  return {
    contacts: [
      {
        id: "ct_ada",
        name: "Ada Lovelace",
        email: "ada@example.com",
        company: "Analytical Engines Inc",
        plan: "Pro",
        status: "active",
        createdAt: "2025-01-12T09:30:00.000Z",
      },
      {
        id: "ct_grace",
        name: "Grace Hopper",
        email: "grace@example.com",
        company: "COBOL Corp",
        plan: "Team",
        status: "active",
        createdAt: "2025-02-03T14:05:00.000Z",
      },
      {
        id: "ct_alan",
        name: "Alan Turing",
        email: "alan@example.com",
        company: "Enigma Ltd",
        plan: "Free",
        status: "churned",
        createdAt: "2024-11-21T18:42:00.000Z",
      },
    ],
    deals: [
      {
        id: "deal_grace_team",
        contactId: "ct_grace",
        title: "COBOL Corp — Team plan expansion",
        value: 12000,
        currency: "USD",
        stage: "negotiation",
        createdAt: "2025-03-01T10:00:00.000Z",
      },
      {
        id: "deal_alan_reeng",
        contactId: "ct_alan",
        title: "Enigma Ltd — Re-engagement",
        value: 4800,
        currency: "USD",
        stage: "lead",
        createdAt: "2025-03-10T11:20:00.000Z",
      },
    ],
    subscriptions: [
      {
        id: "sub_ada_pro",
        contactId: "ct_ada",
        plan: "Pro",
        status: "active",
        amount: 99,
        currency: "USD",
        startedAt: "2025-01-12T09:30:00.000Z",
        renewalAt: "2026-01-12T09:30:00.000Z",
      },
      {
        id: "sub_grace_team",
        contactId: "ct_grace",
        plan: "Team",
        status: "active",
        amount: 499,
        currency: "USD",
        startedAt: "2025-02-03T14:05:00.000Z",
        renewalAt: "2026-02-03T14:05:00.000Z",
      },
    ],
    kbArticles: [
      {
        id: "kb_refund_policy",
        title: "30-day refund policy",
        tags: ["refund", "billing", "policy"],
        summary:
          "Customers can request a full refund within 30 days of purchase or renewal.",
        body: [
          "Refund policy:",
          "- A full refund is available within 30 days of the initial purchase or a renewal.",
          "- After 30 days, partial refunds may be issued as account credit at Finance's discretion.",
          "- Refunds are returned to the original payment method within 5-7 business days.",
          "- To issue a refund, use billing.issue_refund with the subscriptionId and amount; amounts over $100 require manager approval.",
          "- Cancel the subscription first if the customer does not want future renewals.",
        ].join("\n"),
      },
      {
        id: "kb_cancel_subscription",
        title: "Canceling a subscription",
        tags: ["subscription", "billing", "cancel"],
        summary:
          "How to cancel a customer subscription and what happens to access.",
        body: [
          "Cancellation:",
          "- Set the subscription status to 'cancelled' to stop future renewals.",
          "- The customer retains access until the current paid period ends.",
          "- No further charges occur after cancellation; a confirmation email is recommended.",
        ].join("\n"),
      },
    ],
    commsLog: [
      {
        id: "comm_ada_welcome",
        channel: "email",
        direction: "outbound",
        to: "ada@example.com",
        subject: "Welcome to the Pro plan",
        body: "Hi Ada, thanks for upgrading to Pro. Your subscription is active.",
        contactId: "ct_ada",
        contactEmail: "ada@example.com",
        threadId: "thread_ada",
        ts: "2025-01-12T09:35:00.000Z",
      },
      {
        id: "comm_ada_refund_q",
        channel: "email",
        direction: "inbound",
        to: "support@example.com",
        subject: "Question about a refund",
        body: "Hi, I was double charged this month. Can I get a refund?",
        contactId: "ct_ada",
        contactEmail: "ada@example.com",
        threadId: "thread_ada",
        ts: "2025-03-15T08:10:00.000Z",
      },
    ],
    systemServices: [
      {
        id: "svc_api",
        name: "API Gateway",
        status: "healthy",
        health: {
          status: "healthy",
          latencyMs: 42,
          uptimePct: 99.98,
          lastCheck: "2025-03-15T12:00:00.000Z",
        },
      },
      {
        id: "svc_db",
        name: "Primary Database",
        status: "degraded",
        health: {
          status: "degraded",
          latencyMs: 880,
          uptimePct: 99.5,
          lastCheck: "2025-03-15T12:00:00.000Z",
        },
      },
      {
        id: "svc_dash",
        name: "Dashboard",
        status: "healthy",
        health: {
          status: "healthy",
          latencyMs: 110,
          uptimePct: 99.95,
          lastCheck: "2025-03-15T12:00:00.000Z",
        },
      },
    ],
    alerts: [
      {
        id: "alert_db_latency",
        severity: "high",
        serviceId: "svc_db",
        message: "Primary database latency elevated (p95 > 800ms).",
        status: "open",
        createdAt: "2025-03-15T11:45:00.000Z",
      },
      {
        id: "alert_api_deploy",
        severity: "low",
        serviceId: "svc_api",
        message: "API Gateway deploy completed.",
        status: "resolved",
        createdAt: "2025-03-14T22:10:00.000Z",
      },
    ],
  };
}

export const state: CompanyState = freshState();

export function resetState(): void {
  const fresh = freshState();
  state.contacts = fresh.contacts;
  state.deals = fresh.deals;
  state.subscriptions = fresh.subscriptions;
  state.kbArticles = fresh.kbArticles;
  state.commsLog = fresh.commsLog;
  state.systemServices = fresh.systemServices;
  state.alerts = fresh.alerts;
}

export function asStr(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export function asNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function asInt(v: unknown): number | undefined {
  const n = asNum(v);
  return n !== undefined && Number.isInteger(n) ? n : undefined;
}
