import { defineTool, now } from "../core";
import type { Tool } from "../core";
import { state, asStr } from "./state";

export function systemTools(): Tool[] {
  return [
    defineTool({
      name: "system.get_health",
      description: "Report current health of all managed services.",
      permission: { category: "read" },
      parameters: { type: "object", properties: {} },
      async execute() {
        const services = state.systemServices.map((s) => ({
          id: s.id,
          name: s.name,
          status: s.status,
          health: s.health,
        }));
        const notHealthy = services.filter((s) => s.status !== "healthy").length;
        return {
          ok: true,
          data: services,
          note: notHealthy ? `${notHealthy} service(s) not healthy.` : "All services healthy.",
        };
      },
    }),
    defineTool({
      name: "system.list_alerts",
      description: "List system alerts, optionally filtered by status.",
      permission: { category: "read" },
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["open", "acknowledged", "resolved"] },
        },
      },
      async execute(args) {
        const status = asStr(args.status);
        let alerts = [...state.alerts];
        if (status) alerts = alerts.filter((a) => a.status === status);
        alerts.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return { ok: true, data: alerts, note: `${alerts.length} alert(s).` };
      },
    }),
    defineTool({
      name: "system.restart_service",
      description: "Restart a managed service to recover from a degraded state. Requires approval.",
      permission: { category: "system", requiresApproval: true },
      parameters: {
        type: "object",
        properties: {
          serviceId: { type: "string", description: "Service id to restart." },
        },
        required: ["serviceId"],
      },
      async execute(args) {
        const serviceId = asStr(args.serviceId);
        const service = state.systemServices.find((s) => s.id === serviceId);
        if (!service) return { ok: false, error: `No service with id ${serviceId}` };
        service.status = "healthy";
        service.health = {
          status: "healthy",
          latencyMs: 38,
          uptimePct: 99.99,
          lastCheck: now(),
        };
        for (const alert of state.alerts) {
          if (alert.serviceId === serviceId && alert.status === "open") {
            alert.status = "resolved";
          }
        }
        return {
          ok: true,
          data: { serviceId: service.id, name: service.name, status: service.status },
          note: `Restarted ${service.name}; health now healthy.`,
        };
      },
    }),
  ];
}
