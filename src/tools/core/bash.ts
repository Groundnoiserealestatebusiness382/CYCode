import { spawn } from "node:child_process";
import { z } from "zod";
import type { CycodeTool } from "../types.js";

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 600_000;
const MAX_OUTPUT_CHARS = 30_000;

export function truncateMiddle(text: string, max = MAX_OUTPUT_CHARS): string {
  if (text.length <= max) return text;
  const half = Math.floor(max / 2);
  return (
    text.slice(0, half) +
    `\n… [${text.length - max} characters truncated] …\n` +
    text.slice(-half)
  );
}

export const bashTool: CycodeTool<{
  command: string;
  timeout_ms?: number;
  description?: string;
}> = {
  name: "bash",
  description:
    "Run a shell command from the project directory. Returns combined stdout/stderr. " +
    "Commands run non-interactively; avoid commands that wait for input.",
  inputSchema: z.object({
    command: z.string(),
    timeout_ms: z.number().int().min(1000).max(MAX_TIMEOUT_MS).optional(),
    description: z.string().optional().describe("Short summary of what this command does"),
  }),
  readOnly: false,
  permissionKey: (i) => `bash(${i.command})`,
  describeCall: (i) => `bash(${i.command.length > 120 ? i.command.slice(0, 120) + "…" : i.command})`,
  async execute(input, ctx) {
    const timeout = Math.min(input.timeout_ms ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
    return new Promise<string>((resolve, reject) => {
      const child = spawn("/bin/bash", ["-c", input.command], {
        cwd: ctx.cwd,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let out = "";
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeout);
      const onAbort = () => child.kill("SIGKILL");
      ctx.abortSignal?.addEventListener("abort", onAbort, { once: true });
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (out += d));
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        ctx.abortSignal?.removeEventListener("abort", onAbort);
        const body = truncateMiddle(out.trimEnd());
        if (timedOut) {
          reject(new Error(`Command timed out after ${timeout}ms\n${body}`));
        } else if (ctx.abortSignal?.aborted) {
          reject(new Error("Command aborted"));
        } else if (code !== 0) {
          resolve(`Exit code ${code}\n${body}`);
        } else {
          resolve(body || "(no output)");
        }
      });
    });
  },
};
