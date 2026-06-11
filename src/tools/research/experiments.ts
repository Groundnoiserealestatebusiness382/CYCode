import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { z } from "zod";
import type { CycodeTool } from "../types.js";
import { ensureDir } from "../../util/paths.js";

export interface RunRecord {
  id: string;
  name: string;
  command: string;
  pid: number;
  logFile: string;
  startedAt: string;
}

function runsDir(cwd: string): string {
  return ensureDir(path.join(cwd, ".cycode", "runs"));
}

function indexFile(cwd: string): string {
  return path.join(runsDir(cwd), "index.json");
}

function loadRuns(cwd: string): RunRecord[] {
  try {
    return JSON.parse(fs.readFileSync(indexFile(cwd), "utf8")) as RunRecord[];
  } catch {
    return [];
  }
}

function saveRuns(cwd: string, runs: RunRecord[]): void {
  fs.writeFileSync(indexFile(cwd), JSON.stringify(runs, null, 2) + "\n");
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function tailLines(text: string, n: number): string {
  const lines = text.trimEnd().split("\n");
  return lines.slice(-n).join("\n");
}

/** Extract metric matches (last `keep`) from a log using a regex with capture groups. */
export function parseMetrics(log: string, pattern: string, keep = 10): string[] {
  const re = new RegExp(pattern, "g");
  const matches: string[] = [];
  for (const m of log.matchAll(re)) matches.push(m[0]);
  return matches.slice(-keep);
}

export const expRunTool: CycodeTool<{ command: string; name?: string }> = {
  name: "exp_run",
  description:
    "Launch a long-running experiment (e.g. a training script) in the background. " +
    "Output goes to a log file under .cycode/runs/. Returns a run id; monitor it " +
    "with exp_status instead of blocking.",
  inputSchema: z.object({
    command: z.string(),
    name: z.string().optional().describe("Short label for the run"),
  }),
  readOnly: false,
  permissionKey: (i) => `exp_run(${i.command})`,
  describeCall: (i) => `exp_run(${i.name ?? i.command.slice(0, 80)})`,
  async execute(input, ctx) {
    const id =
      new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") +
      "-" +
      Math.random().toString(36).slice(2, 6);
    const logFile = path.join(runsDir(ctx.cwd), `${id}.log`);
    const fd = fs.openSync(logFile, "a");
    const child = spawn("/bin/bash", ["-c", input.command], {
      cwd: ctx.cwd,
      detached: true,
      stdio: ["ignore", fd, fd],
    });
    fs.closeSync(fd);
    child.unref();
    if (child.pid === undefined) throw new Error("Failed to spawn process");
    const record: RunRecord = {
      id,
      name: input.name ?? input.command.slice(0, 60),
      command: input.command,
      pid: child.pid,
      logFile,
      startedAt: new Date().toISOString(),
    };
    saveRuns(ctx.cwd, [...loadRuns(ctx.cwd), record]);
    return `Started run ${id} (pid ${child.pid}). Log: ${logFile}`;
  },
};

export const expStatusTool: CycodeTool<{
  id?: string;
  tail_lines?: number;
  metric_regex?: string;
}> = {
  name: "exp_status",
  description:
    "Check background experiment runs. Without id: list all runs and whether they are " +
    "still alive. With id: tail the log (default 40 lines) and optionally extract metric " +
    'lines via metric_regex (e.g. "loss[=:]\\\\s*[0-9.]+").',
  inputSchema: z.object({
    id: z.string().optional(),
    tail_lines: z.number().int().min(1).max(500).optional(),
    metric_regex: z.string().optional(),
  }),
  readOnly: true,
  describeCall: (i) => `exp_status(${i.id ?? "all"})`,
  async execute(input, ctx) {
    const runs = loadRuns(ctx.cwd);
    if (!input.id) {
      if (runs.length === 0) return "No runs recorded";
      return runs
        .map(
          (r) =>
            `${r.id}  ${isAlive(r.pid) ? "RUNNING" : "FINISHED"}  ${r.name}  (started ${r.startedAt})`,
        )
        .join("\n");
    }
    const run = runs.find((r) => r.id === input.id);
    if (!run) throw new Error(`Run not found: ${input.id}`);
    let log = "";
    try {
      log = fs.readFileSync(run.logFile, "utf8");
    } catch {
      log = "(log file missing)";
    }
    let out =
      `${run.id}  ${isAlive(run.pid) ? "RUNNING" : "FINISHED"}  ${run.name}\n` +
      `command: ${run.command}\nstarted: ${run.startedAt}\n\n` +
      `--- last ${input.tail_lines ?? 40} log lines ---\n` +
      tailLines(log, input.tail_lines ?? 40);
    if (input.metric_regex) {
      const metrics = parseMetrics(log, input.metric_regex);
      out += `\n\n--- metric matches (last ${metrics.length}) ---\n` + metrics.join("\n");
    }
    return out;
  },
};

export const expStopTool: CycodeTool<{ id: string }> = {
  name: "exp_stop",
  description: "Stop a background experiment run by id (SIGTERM to its process group).",
  inputSchema: z.object({ id: z.string() }),
  readOnly: false,
  permissionKey: (i) => `exp_stop(${i.id})`,
  describeCall: (i) => `exp_stop(${i.id})`,
  async execute(input, ctx) {
    const run = loadRuns(ctx.cwd).find((r) => r.id === input.id);
    if (!run) throw new Error(`Run not found: ${input.id}`);
    if (!isAlive(run.pid)) return `Run ${input.id} already finished`;
    try {
      // detached spawn → child leads its own process group
      process.kill(-run.pid, "SIGTERM");
    } catch {
      process.kill(run.pid, "SIGTERM");
    }
    return `Sent SIGTERM to run ${input.id} (pid ${run.pid})`;
  },
};
