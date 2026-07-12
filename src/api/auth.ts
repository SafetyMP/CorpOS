import express, { type Request, type Response, type NextFunction } from "express";

/**
 * Bearer-token gate for dashboard mutating API routes.
 * Set DASHBOARD_API_TOKEN in the environment; when unset, auth is disabled (dev only).
 */
export function requireDashboardAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.DASHBOARD_API_TOKEN?.trim();
  if (!expected) {
    next();
    return;
  }
  const header = req.headers.authorization ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) {
    res.status(401).json({ error: "dashboard authentication required" });
    return;
  }
  const token = header.slice(prefix.length).trim();
  if (token.length !== expected.length || !timingSafeEqual(token, expected)) {
    res.status(401).json({ error: "dashboard authentication required" });
    return;
  }
  next();
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function installDashboardAuth(app: express.Application): void {
  app.use("/api/approvals", requireDashboardAuth);
  app.post("/api/approvals/:id/decide", requireDashboardAuth);
}
