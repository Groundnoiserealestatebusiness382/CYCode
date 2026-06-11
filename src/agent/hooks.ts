import { spawn } from "node:child_process";
import type { HookConfig } from "../config.js";
import { ruleMatches } from "../permissions/permissions.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_HOOK_OUTPUT = 4000;

export interface HookContext {
  cwd: string;
  toolName: string;
  /** Permission key, e.g. "bash(git push)". */
  key: string;
  input: unknown;
  /** Tool output; present for postToolUse hooks only. */
  output?: string;
}

export interface HookResult {
  /** Set when an exit-code-2 hook fired: the trimmed hook output. */
  signal?: string;
  /** Non-blocking hook failures, reported as notices. */
  warnings: string[];
}

function runHook(hook: HookConfig, ctx: HookContext): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = spawn("/bin/bash", ["-c", hook.command], {
      cwd: ctx.cwd,
      env: {
        ...process.env,
        CYCODE_TOOL_NAME: ctx.toolName,
        CYCODE_TOOL_KEY: ctx.key,
        CYCODE_TOOL_INPUT: JSON.stringify(ctx.input ?? null),
        ...(ctx.output !== undefined
          ? { CYCODE_TOOL_OUTPUT: ctx.output.slice(0, 8000) }
          : {}),
      },
    });
    let out = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), hook.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: null, out: String(err) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out: out.trim().slice(0, MAX_HOOK_OUTPUT) });
    });
  });
}

/**
 * Run all hooks whose `match` pattern matches the call's permission key.
 * Exit code 2 is the hook's signal channel: for preToolUse it blocks the
 * call, for postToolUse it feeds the hook output back to the model.
 * Any other non-zero exit is a warning and never affects the tool call.
 */
export async function runHooks(
  hooks: HookConfig[] | undefined,
  ctx: HookContext,
): Promise<HookResult> {
  const result: HookResult = { warnings: [] };
  for (const hook of hooks ?? []) {
    if (!ruleMatches(hook.match, ctx.key)) continue;
    const { code, out } = await runHook(hook, ctx);
    if (code === 2) {
      result.signal = out || "(hook exited 2 with no output)";
      return result;
    }
    if (code !== 0) {
      result.warnings.push(
        `hook "${hook.command.slice(0, 60)}" exited ${code}${out ? `: ${out.slice(0, 200)}` : ""}`,
      );
    }
  }
  return result;
}
