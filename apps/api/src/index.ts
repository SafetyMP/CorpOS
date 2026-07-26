import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp, createDefaultCompany, startTtlScheduler } from "./app.js";
import { runCompanyDay } from "@corpos/core";

const scenario = process.argv.includes("--scenario");
if (scenario) {
  const { result, company } = await runCompanyDay({ dbPath: ":memory:" });
  console.log(JSON.stringify(result, null, 2));
  company.close();
  process.exit(result.ok ? 0 : 1);
}

const { company, mode } = await createDefaultCompany();
startTtlScheduler(company);
const app = buildApp(company, mode);

const here = path.dirname(fileURLToPath(import.meta.url));
const consoleDist = path.resolve(here, "../../console/dist");
app.use("/*", serveStatic({ root: consoleDist }));

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, () => {
  console.log(`CorpOS ops console on http://localhost:${port} (mode=${mode})`);
});
