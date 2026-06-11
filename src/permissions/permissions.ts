import type { CycodeTool } from "../tools/types.js";
import { permissionKeyFor, describeCall } from "../tools/types.js";

export type PermissionMode = "default" | "acceptEdits" | "plan" | "bypass";

export const PERMISSION_MODES: PermissionMode[] = [
  "default",
  "acceptEdits",
  "plan",
  "bypass",
];

export interface PermissionRequest {
  toolName: string;
  /** Rule key, e.g. `bash(git status)`. */
  key: string;
  /** Human-readable description of the call. */
  description: string;
  input: unknown;
}

export interface PermissionDecision {
  behavior: "allow" | "deny";
  /** Allow this exact key for the rest of the session (and persist it). */
  always?: boolean;
  message?: string;
}

export type PermissionArbiter = (
  req: PermissionRequest,
) => Promise<PermissionDecision>;

/** Tools auto-approved in acceptEdits mode. */
const EDIT_TOOLS = new Set(["write", "edit", "notebook_edit"]);

/**
 * Rule grammar (Claude Code style):
 *   "bash"            – any bash call
 *   "bash(git *)"     – bash calls whose command starts with "git "
 *   "write(/tmp/x)"   – exact-argument match
 */
export function ruleMatches(rule: string, key: string): boolean {
  const parse = (s: string): { name: string; arg: string | null } => {
    const m = /^([^()]+)\((.*)\)$/s.exec(s);
    return m ? { name: m[1]!, arg: m[2]! } : { name: s, arg: null };
  };
  const r = parse(rule.trim());
  const k = parse(key);
  if (r.name !== k.name) return false;
  if (r.arg === null) return true;
  if (r.arg.endsWith("*")) return (k.arg ?? "").startsWith(r.arg.slice(0, -1));
  return r.arg === k.arg;
}

function anyMatch(rules: string[], key: string): boolean {
  return rules.some((r) => ruleMatches(r, key));
}

export interface GateResult {
  allowed: boolean;
  reason?: string;
}

export class PermissionGate {
  mode: PermissionMode;
  private allowRules: string[];
  private denyRules: string[];
  private sessionAllow: string[] = [];
  private arbiter: PermissionArbiter;
  /** Called when the user picks "always allow"; lets the host persist the rule. */
  onAlwaysAllow?: (rule: string) => void;

  constructor(opts: {
    mode: PermissionMode;
    allow?: string[];
    deny?: string[];
    arbiter: PermissionArbiter;
  }) {
    this.mode = opts.mode;
    this.allowRules = opts.allow ?? [];
    this.denyRules = opts.deny ?? [];
    this.arbiter = opts.arbiter;
  }

  async check(tool: CycodeTool, input: unknown): Promise<GateResult> {
    const key = permissionKeyFor(tool, input);
    if (anyMatch(this.denyRules, key)) {
      return { allowed: false, reason: `Denied by config rule for "${key}"` };
    }
    if (tool.readOnly) return { allowed: true };
    if (this.mode === "bypass") return { allowed: true };
    if (this.mode === "plan") {
      return {
        allowed: false,
        reason: "Plan mode is read-only; switch modes to make changes",
      };
    }
    if (this.mode === "acceptEdits" && EDIT_TOOLS.has(tool.name)) {
      return { allowed: true };
    }
    if (anyMatch([...this.allowRules, ...this.sessionAllow], key)) {
      return { allowed: true };
    }
    const decision = await this.arbiter({
      toolName: tool.name,
      key,
      description: describeCall(tool, input),
      input,
    });
    if (decision.behavior === "allow") {
      if (decision.always) {
        this.sessionAllow.push(key);
        this.onAlwaysAllow?.(key);
      }
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: decision.message ?? "User denied this action",
    };
  }
}
