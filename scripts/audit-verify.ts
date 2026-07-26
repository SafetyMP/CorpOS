import { createCompany } from "@corpos/core";

const company = await createCompany({ dbPath: process.env.CORPOS_DB ?? "data/company.db" });
await company.audit.append("boot", { ok: true });
const result = await company.audit.verify();
console.log(result);
company.close();
process.exit(result.ok ? 0 : 1);
