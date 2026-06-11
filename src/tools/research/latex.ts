import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { CycodeTool } from "../types.js";
import { resolveIn } from "../../util/paths.js";

export interface LatexDiagnostics {
  errors: string[];
  warnings: number;
}

/** Parse pdflatex/latexmk output (with -file-line-error) into structured diagnostics. */
export function parseLatexLog(log: string): LatexDiagnostics {
  const errors: string[] = [];
  let warnings = 0;
  const lines = log.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // -file-line-error format: ./main.tex:12: Undefined control sequence.
    const fle = /^(\.?[^:\n]+\.tex):(\d+):\s*(.+)$/.exec(line);
    if (fle) {
      errors.push(`${fle[1]}:${fle[2]}: ${fle[3]}`);
      continue;
    }
    if (line.startsWith("! ")) {
      // bare TeX error; the offending line number often follows as "l.<n> ..."
      const context = lines[i + 1]?.startsWith("l.") ? ` (${lines[i + 1]!.trim()})` : "";
      errors.push(line.slice(2) + context);
      continue;
    }
    if (/^(LaTeX|Package|Class).* Warning:/.test(line)) warnings++;
  }
  return { errors: [...new Set(errors)].slice(0, 20), warnings };
}

function run(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd });
    let out = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
}

export const latexBuildTool: CycodeTool<{
  main?: string;
  dir?: string;
  engine?: "pdflatex" | "xelatex" | "lualatex";
}> = {
  name: "latex_build",
  description:
    "Build a LaTeX project to PDF (latexmk if available, otherwise two passes of the " +
    "engine directly). Returns structured compile errors with file:line locations.",
  inputSchema: z.object({
    main: z.string().optional().describe("Main .tex file (default: main.tex)"),
    dir: z.string().optional().describe("Project directory (default: cwd)"),
    engine: z.enum(["pdflatex", "xelatex", "lualatex"]).optional(),
  }),
  readOnly: false,
  permissionKey: (i) => `latex_build(${i.main ?? "main.tex"})`,
  describeCall: (i) => `latex_build(${i.main ?? "main.tex"})`,
  async execute(input, ctx) {
    const dir = input.dir ? resolveIn(ctx.cwd, input.dir) : ctx.cwd;
    const main = input.main ?? "main.tex";
    const engine = input.engine ?? "pdflatex";
    if (!fs.existsSync(path.join(dir, main))) {
      throw new Error(`${main} not found in ${dir}`);
    }
    const engineFlag = engine === "pdflatex" ? "-pdf" : engine === "xelatex" ? "-xelatex" : "-lualatex";

    let result: { code: number | null; out: string };
    try {
      result = await run(
        "latexmk",
        [engineFlag, "-interaction=nonstopmode", "-file-line-error", main],
        dir,
        300_000,
      );
    } catch {
      // latexmk not installed — run the engine twice for references
      result = await run(engine, ["-interaction=nonstopmode", "-file-line-error", main], dir, 300_000);
      if (result.code === 0) {
        result = await run(engine, ["-interaction=nonstopmode", "-file-line-error", main], dir, 300_000);
      }
    }

    const { errors, warnings } = parseLatexLog(result.out);
    const pdf = path.join(dir, main.replace(/\.tex$/, ".pdf"));
    if (result.code === 0 && fs.existsSync(pdf)) {
      return `Build succeeded: ${pdf}${warnings ? ` (${warnings} warnings)` : ""}`;
    }
    return (
      `Build FAILED (exit ${result.code}, ${warnings} warnings)\n\nErrors:\n` +
      (errors.length ? errors.map((e) => `- ${e}`).join("\n") : "(no structured errors found; check the log)") +
      `\n\nLast 30 log lines:\n${result.out.trimEnd().split("\n").slice(-30).join("\n")}`
    );
  },
};
