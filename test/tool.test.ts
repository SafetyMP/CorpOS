import { describe, it, expect } from "vitest";
import { defineTool, ToolRegistry, validateArgs, schemaOf } from "../src/core/index";
import { mkCtx } from "./helpers";

const echo = defineTool({
  name: "echo",
  description: "Echoes back its arguments.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string" },
      count: { type: "integer" },
      tier: { type: "string", enum: ["free", "pro"] },
    },
    required: ["name"],
  },
  permission: { category: "read" },
  execute: async (args) => ({ ok: true, data: args }),
});

describe("ToolRegistry registration", () => {
  it("registers tools and exposes them via list/get/has", () => {
    const reg = new ToolRegistry();
    reg.register(echo);
    expect(reg.has("echo")).toBe(true);
    expect(reg.has("missing")).toBe(false);
    expect(reg.get("echo")?.name).toBe("echo");
    expect(reg.list().map((t) => t.name)).toEqual(["echo"]);
  });

  it("rejects duplicate registration", () => {
    const reg = new ToolRegistry();
    reg.register(echo);
    expect(() => reg.register(echo)).toThrow(/already registered/);
  });

  it("resolves aliases to the canonical tool", () => {
    const reg = new ToolRegistry();
    reg.register(echo);
    reg.alias("support.echo", "echo");
    expect(reg.has("support.echo")).toBe(true);
    expect(reg.get("support.echo")?.name).toBe("echo");
  });

  it("schemasFor builds schemas only for known tools in the subset", () => {
    const reg = new ToolRegistry();
    reg.register(echo);
    const schemas = reg.schemasFor(["echo", "unknown"]);
    expect(schemas).toHaveLength(1);
    expect(schemas[0]?.name).toBe("echo");
    expect(schemas[0]?.parameters).toHaveProperty("properties");
  });

  it("schemaOf returns name, description and parameters", () => {
    const s = schemaOf(echo);
    expect(s).toMatchObject({ name: "echo", description: expect.any(String) });
    expect(s.parameters).toBeDefined();
  });
});

describe("validateArgs", () => {
  it("accepts valid arguments", () => {
    expect(validateArgs(echo, { name: "alice", count: 3, tier: "pro" })).toEqual({ ok: true });
  });

  it("rejects a missing required field", () => {
    const r = validateArgs(echo, { count: 3 });
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/missing required 'name'/);
  });

  it("rejects a wrong-typed field", () => {
    const r = validateArgs(echo, { name: "alice", count: "no" });
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/expected integer/);
  });

  it("rejects a value outside the enum", () => {
    const r = validateArgs(echo, { name: "alice", tier: "enterprise" });
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/not in enum/);
  });
});

describe("ToolRegistry.invoke", () => {
  it("validates and executes on success", async () => {
    const reg = new ToolRegistry();
    reg.register(echo);
    const res = await reg.invoke("echo", { name: "alice" }, mkCtx());
    expect(res.ok).toBe(true);
    expect(res.data).toMatchObject({ name: "alice" });
  });

  it("returns an error result for unknown tools", async () => {
    const reg = new ToolRegistry();
    const res = await reg.invoke("nope", {}, mkCtx());
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Unknown tool/);
  });

  it("returns an error result for invalid arguments (never executes)", async () => {
    const reg = new ToolRegistry();
    reg.register(echo);
    const res = await reg.invoke("echo", {}, mkCtx());
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Invalid arguments/);
  });

  it("traps a throwing handler and reports the error", async () => {
    const boom = defineTool({
      name: "boom",
      description: "always throws",
      parameters: { type: "object", properties: {} },
      permission: { category: "read" },
      execute: async () => {
        throw new Error("kaboom");
      },
    });
    const reg = new ToolRegistry();
    reg.register(boom);
    const res = await reg.invoke("boom", {}, mkCtx());
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/threw/);
    expect(res.error).toMatch(/kaboom/);
  });
});
