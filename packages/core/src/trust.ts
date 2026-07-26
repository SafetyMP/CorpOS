import { eq } from "drizzle-orm";
import type { Db } from "./db.js";
import { agents } from "./schema.js";
import type { AuditLog } from "./audit.js";

export function computeMaxAutonomousRisk(stats: {
  accepts: number;
  rejects: number;
  violations: number;
}): number {
  if (stats.violations >= 3 || stats.rejects >= 3) return 0;
  if (stats.accepts >= 2 && stats.rejects === 0) return 2;
  if (stats.accepts >= 1) return 1;
  return 1;
}

export class TrustLedger {
  constructor(
    private db: Db,
    private audit: AuditLog,
  ) {}

  async recordAccept(agentId: string): Promise<void> {
    const agent = (await this.db.select().from(agents).where(eq(agents.id, agentId)))[0];
    if (!agent) return;
    const accepts = agent.accepts + 1;
    const maxAutonomousRisk = computeMaxAutonomousRisk({
      accepts,
      rejects: agent.rejects,
      violations: agent.violations,
    });
    await this.db
      .update(agents)
      .set({
        accepts,
        maxAutonomousRisk,
        trustScore: accepts - agent.rejects - agent.violations,
      })
      .where(eq(agents.id, agentId));
    await this.audit.append("trust.accept", { agentId, maxAutonomousRisk });
  }

  async recordReject(agentId: string): Promise<void> {
    const agent = (await this.db.select().from(agents).where(eq(agents.id, agentId)))[0];
    if (!agent) return;
    const rejects = agent.rejects + 1;
    const maxAutonomousRisk = computeMaxAutonomousRisk({
      accepts: agent.accepts,
      rejects,
      violations: agent.violations,
    });
    await this.db
      .update(agents)
      .set({
        rejects,
        maxAutonomousRisk,
        trustScore: agent.accepts - rejects - agent.violations,
      })
      .where(eq(agents.id, agentId));
    await this.audit.append("trust.reject", { agentId, maxAutonomousRisk });
  }

  async get(agentId: string) {
    return (await this.db.select().from(agents).where(eq(agents.id, agentId)))[0];
  }
}
