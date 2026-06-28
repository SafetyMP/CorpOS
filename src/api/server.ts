import { createServer, type Server as HttpServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import { WebSocketServer, WebSocket } from "ws";

import { newTask, type CompanyServices, type TaskState } from "../core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, "../dashboard/public");

export interface HttpServerHandles {
  app: express.Application;
  server: HttpServer;
  wss: WebSocketServer;
}

export function createHttpServer(services: CompanyServices): HttpServerHandles {
  const app = express();
  app.use(express.json());

  // Suppress the browser's default favicon request (no asset shipped).
  app.get("/favicon.ico", (_req, res) => {
    res.status(204).end();
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  app.get("/api/tasks", (req, res) => {
    const raw = req.query.state;
    const state = typeof raw === "string" ? (raw as TaskState) : undefined;
    res.json(services.store.listTasks(state));
  });

  app.get("/api/tasks/:id", (req, res) => {
    const task = services.store.getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: "task not found" });
      return;
    }
    res.json(task);
  });

  app.post("/api/tasks", async (req, res) => {
    const body = req.body ?? {};
    const title = typeof body.title === "string" ? body.title : "";
    const description = typeof body.description === "string" ? body.description : "";
    if (!title || !description) {
      res.status(400).json({ error: "title and description are required" });
      return;
    }
    const task = newTask({
      tenantId: typeof body.tenantId === "string" ? body.tenantId : "tenant_default",
      title,
      description,
      createdBy: "human",
      assignedTo: typeof body.assignedTo === "string" ? body.assignedTo : undefined,
      priority: typeof body.priority === "number" ? body.priority : 0,
      input: isRecord(body.input) ? body.input : undefined,
    });
    await services.orchestrator.enqueue(task);
    res.status(201).json(task);
  });

  app.get("/api/agents", (_req, res) => {
    res.json(agentSummary(services));
  });

  app.get("/api/events", (req, res) => {
    const raw = req.query.limit;
    const limit = typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : 100;
    res.json(services.store.recentEvents(limit));
  });

  app.get("/api/approvals", (_req, res) => {
    res.json(services.store.pendingApprovals());
  });

  app.post("/api/approvals/:id/decide", async (req, res) => {
    const id = req.params.id;
    const body = req.body ?? {};
    const decision = body.decision;
    const by = typeof body.by === "string" ? body.by : "human";
    if (decision !== "approved" && decision !== "rejected") {
      res.status(400).json({ error: "decision must be 'approved' or 'rejected'" });
      return;
    }
    const approval = services.policy.decide(id, decision, by);
    if (!approval) {
      res.status(404).json({ error: "approval not found" });
      return;
    }
    if (decision === "approved") {
      void services.orchestrator.resume(id).catch((err) => {
        services.log.error("approval.resume.failed", { approvalId: id, error: String(err) });
      });
    }
    res.json(approval);
  });

  app.get("/api/spend", (_req, res) => {
    res.json(aggregateSpend(services));
  });

  app.use(express.static(PUBLIC_DIR));

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (socket) => {
    send(socket, {
      type: "snapshot",
      payload: {
        tasks: services.store.listTasks(),
        agents: agentSummary(services),
        approvals: services.store.pendingApprovals(),
      },
    });

    const unsubscribe = services.bus.onAll((event) => {
      send(socket, event);
    });

    socket.on("close", () => unsubscribe());
    socket.on("error", () => unsubscribe());
  });

  return { app, server, wss };
}

function send(socket: WebSocket, data: unknown): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}

function agentSummary(services: CompanyServices) {
  return services.orchestrator.getAgents().map((a) => ({
    id: a.def.id,
    name: a.def.name,
    role: a.def.role,
    tools: a.def.tools,
  }));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function aggregateSpend(services: CompanyServices): {
  total: number;
  count: number;
  byTool: Array<{ tool: string; total: number; count: number }>;
  byTenant: Array<{ tenantId: string; total: number; count: number }>;
} {
  const db = services.store.db;
  const overall = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM spend")
    .get() as { total: number; count: number } | undefined;
  const byTool = db
    .prepare(
      "SELECT tool, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM spend GROUP BY tool ORDER BY total DESC"
    )
    .all() as Array<{ tool: string; total: number; count: number }>;
  const byTenant = db
    .prepare(
      "SELECT tenant_id AS tenantId, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM spend GROUP BY tenant_id ORDER BY total DESC"
    )
    .all() as Array<{ tenantId: string; total: number; count: number }>;
  return {
    total: overall?.total ?? 0,
    count: overall?.count ?? 0,
    byTool,
    byTenant,
  };
}
