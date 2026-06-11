import { spawn } from "node:child_process";
import fs from "node:fs";
import fg from "fast-glob";
import { z } from "zod";
import type { CycodeTool } from "../types.js";
import { resolveIn } from "../../util/paths.js";

const MAX_RESULTS = 100;

function runRipgrep(args: string[], cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("rg", args, { cwd });
    let out = "";
    let resolved = false;
    child.stdout.on("data", (d) => (out += d));
    child.on("error", () => {
      // rg not installed
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    });
    child.on("close", (code) => {
      if (resolved) return;
      resolved = true;
      // rg exits 1 on "no matches", which is a valid empty result
      resolve(code === 0 || code === 1 ? out : null);
    });
  });
}

async function jsGrep(
  pattern: string,
  cwd: string,
  globPattern: string | undefined,
  ignoreCase: boolean,
): Promise<string> {
  const re = new RegExp(pattern, ignoreCase ? "i" : "");
  const files = await fg(globPattern ?? "**/*", {
    cwd,
    dot: false,
    onlyFiles: true,
    absolute: false,
    ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**"],
    suppressErrors: true,
  });
  const hits: string[] = [];
  for (const f of files) {
    if (hits.length >= MAX_RESULTS) break;
    let content: string;
    try {
      content = fs.readFileSync(resolveIn(cwd, f), "utf8");
    } catch {
      continue;
    }
    if (content.includes("\0")) continue; // skip binary
    const lines = content.split("\n");
    for (let i = 0; i < lines.length && hits.length < MAX_RESULTS; i++) {
      if (re.test(lines[i]!)) hits.push(`${f}:${i + 1}:${lines[i]!.slice(0, 400)}`);
    }
  }
  return hits.join("\n");
}

export const grepTool: CycodeTool<{
  pattern: string;
  path?: string;
  glob?: string;
  ignore_case?: boolean;
}> = {
  name: "grep",
  description:
    "Search file contents with a regular expression. Returns file:line:text matches. " +
    "Use the glob parameter to restrict file types (e.g. \"*.py\").",
  inputSchema: z.object({
    pattern: z.string().describe("Regular expression to search for"),
    path: z.string().optional().describe("Directory to search in (default: cwd)"),
    glob: z.string().optional().describe("Glob filter for files, e.g. \"*.ts\""),
    ignore_case: z.boolean().optional(),
  }),
  readOnly: true,
  describeCall: (i) => `grep(${i.pattern})`,
  async execute(input, ctx) {
    const cwd = input.path ? resolveIn(ctx.cwd, input.path) : ctx.cwd;
    const args = ["--line-number", "--no-heading", "--color", "never", "--max-count", "20"];
    if (input.ignore_case) args.push("-i");
    if (input.glob) args.push("-g", input.glob);
    args.push("-e", input.pattern, ".");
    let out = await runRipgrep(args, cwd);
    if (out === null) {
      out = await jsGrep(input.pattern, cwd, input.glob ? `**/${input.glob}` : undefined, !!input.ignore_case);
    }
    const lines = out.split("\n").filter(Boolean);
    if (lines.length === 0) return "No matches";
    const shown = lines.slice(0, MAX_RESULTS);
    const more =
      lines.length > MAX_RESULTS ? `\n(${lines.length - MAX_RESULTS} more not shown)` : "";
    return shown.join("\n") + more;
  },
};
