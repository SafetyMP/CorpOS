import { newId } from "./id.js";
import type { Effect, PolicyDecision, Tool } from "./types.js";

/** Three-layer agentic authorization (Cedar model; isomorphic Rego-shaped PDP). */
export type EnforcementMode = "strict" | "audit";

export interface DelegationContext {
  delegatedBy?: string;
  originatingAuthority: string;
  depth: number;
  maxDepth?: number;
  /** Tools the originator may authorize */
  originatorToolAllowlist?: string[];
}

export interface AuthzInput {
  agentId: string;
  agentActive: boolean;
  tool: Tool | undefined;
  toolName: string;
  agentToolAllowlist?: string[];
  delegation: DelegationContext;
  mode?: EnforcementMode;
}

export interface AuthzResult {
  decisionId: string;
  allowed: boolean;
  layer?: "L1" | "L2" | "L3" | "membership";
  reason: string;
  effect: Effect;
}

const DEFAULT_MAX_DEPTH = 3;

/** Fail-closed Rego-shaped default: allow := false unless all layers pass. */
export function evaluateThreeLayer(input: AuthzInput): AuthzResult {
  const decisionId = newId("dec");
  const mode = input.mode ?? "strict";

  if (!input.agentActive) {
    return deny(decisionId, "membership", "inactive agent cannot act (G1)", mode);
  }
  if (!input.agentId) {
    return deny(decisionId, "L1", "missing agent identity", mode);
  }
  if (!input.tool) {
    return deny(decisionId, "L1", "unknown tool (fail-closed)", mode);
  }

  // L1 agent → tool
  const allow = input.agentToolAllowlist;
  if (allow && allow.length > 0 && !allow.includes(input.toolName) && !allow.includes("*")) {
    return deny(decisionId, "L1", `agent not authorized for tool ${input.toolName}`, mode);
  }

  // L2 agent → agent delegation depth
  const maxDepth = input.delegation.maxDepth ?? DEFAULT_MAX_DEPTH;
  if (input.delegation.depth > maxDepth) {
    return deny(
      decisionId,
      "L2",
      `delegation depth ${input.delegation.depth} exceeds max ${maxDepth}`,
      mode,
    );
  }

  // L3 originating authority still permits the action
  const originAllow = input.delegation.originatorToolAllowlist;
  if (
    originAllow &&
    originAllow.length > 0 &&
    !originAllow.includes(input.toolName) &&
    !originAllow.includes("*")
  ) {
    return deny(
      decisionId,
      "L3",
      `originating authority cannot authorize ${input.toolName} (ASI03)`,
      mode,
    );
  }

  if (!input.delegation.originatingAuthority) {
    return deny(decisionId, "L3", "missing originating authority", mode);
  }

  return {
    decisionId,
    allowed: true,
    reason: "three-layer allow",
    effect: "allow",
  };
}

function deny(
  decisionId: string,
  layer: AuthzResult["layer"],
  reason: string,
  mode: EnforcementMode,
): AuthzResult {
  if (mode === "audit") {
    return {
      decisionId,
      allowed: true,
      layer,
      reason: `audit-mode would deny: ${reason}`,
      effect: "allow",
    };
  }
  return {
    decisionId,
    allowed: false,
    layer,
    reason,
    effect: "deny",
  };
}

export function toPolicyDecision(authz: AuthzResult): PolicyDecision {
  return {
    effect: authz.effect,
    reason: authz.reason,
    decisionId: authz.decisionId,
  };
}
