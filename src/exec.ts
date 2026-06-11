import { createRuntime } from "./runtime.js";
import { expandSlashCommand } from "./skills/skills.js";
import type { PermissionMode } from "./permissions/permissions.js";

export interface ExecOptions {
  prompt: string;
  cwd: string;
  modelSpec?: string;
  mode?: PermissionMode;
  json: boolean;
  maxSteps?: number;
  continueSession?: boolean;
}

/**
 * Non-interactive mode (Codex-style `exec`): runs one turn and exits.
 * Designed to be driven by scripts, CI, and recurring agent loops.
 * With --json, every agent event is emitted as a JSON line on stdout.
 */
export async function runExec(opts: ExecOptions): Promise<number> {
  const emitJson = (obj: unknown) =>
    process.stdout.write(JSON.stringify(obj) + "\n");

  const runtime = await createRuntime({
    cwd: opts.cwd,
    modelSpec: opts.modelSpec,
    mode: opts.mode ?? "default",
    maxStepsPerTurn: opts.maxSteps ?? 60,
    // Without a human present, anything not pre-authorized by mode/rules is denied.
    arbiter: async (req) => ({
      behavior: "deny",
      message:
        `Non-interactive mode: "${req.key}" requires approval. ` +
        "Run with --mode acceptEdits / --mode bypass, or add an allow rule to .cycode/config.json.",
    }),
    noSession: !opts.continueSession,
    continueSession: opts.continueSession,
    onNotice: (message) => {
      if (opts.json) emitJson({ type: "notice", message });
      else process.stderr.write(`[cycode] ${message}\n`);
    },
  });

  let finalText = "";
  runtime.bus.on((event) => {
    if (opts.json) {
      emitJson({ ts: new Date().toISOString(), ...event });
      return;
    }
    switch (event.type) {
      case "text-delta":
        process.stdout.write(event.text);
        break;
      case "text-end":
        process.stdout.write("\n");
        break;
      case "tool-start":
        process.stderr.write(`⏺ ${event.description}\n`);
        break;
      case "tool-denied":
        process.stderr.write(`✗ denied: ${event.toolName} — ${event.reason}\n`);
        break;
      case "notice":
        process.stderr.write(`[cycode] ${event.message}\n`);
        break;
      case "error":
        process.stderr.write(`[cycode] error: ${event.message}\n`);
        break;
    }
  });

  let exitCode = 0;
  try {
    const prompt = expandSlashCommand(opts.prompt, runtime.skills) ?? opts.prompt;
    finalText = await runtime.agent.runTurn(prompt);
  } catch (err) {
    exitCode = 1;
    if (!opts.json) {
      process.stderr.write(`[cycode] fatal: ${err instanceof Error ? err.message : err}\n`);
    }
  } finally {
    await runtime.close();
  }
  if (opts.json) {
    emitJson({ type: "result", text: finalText, exitCode });
  }
  return exitCode;
}
