import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cycodeHome } from "../util/paths.js";
import type { PermissionMode } from "../permissions/permissions.js";
import type { SkillMeta } from "../skills/skills.js";

const MAX_CONTEXT_FILE_CHARS = 20_000;

export interface ContextFile {
  path: string;
  content: string;
}

/** Load project memory files: global ~/.cycode/AGENTS.md plus the first of AGENTS.md / CLAUDE.md in cwd. */
export function loadContextFiles(cwd: string): ContextFile[] {
  const home = cycodeHome();
  const candidates = [
    path.join(home, "AGENTS.md"),
    path.join(cwd, "AGENTS.md"),
    path.join(cwd, "CLAUDE.md"),
  ];
  const files: ContextFile[] = [];
  let projectFileFound = false;
  for (const p of candidates) {
    const isProject = !p.startsWith(home);
    if (isProject && projectFileFound) continue;
    try {
      const content = fs.readFileSync(p, "utf8").slice(0, MAX_CONTEXT_FILE_CHARS);
      if (content.trim()) {
        files.push({ path: p, content });
        if (isProject) projectFileFound = true;
      }
    } catch {
      // file absent
    }
  }
  return files;
}

export function buildSystemPrompt(opts: {
  cwd: string;
  modelSpec: string;
  mode: PermissionMode;
  contextFiles: ContextFile[];
  skills: SkillMeta[];
  isSubagent?: boolean;
}): string {
  const parts: string[] = [];

  parts.push(
    opts.isSubagent
      ? "You are a CYCode subagent performing a focused, read-only exploration task. " +
          "Investigate thoroughly, then end with a complete, self-contained report — " +
          "your final message is the only thing returned to the main agent."
      : "You are CYCode, an open-source terminal coding agent specialized for AI research. " +
          "You help with code, papers (arXiv/Semantic Scholar), experiments, Jupyter notebooks, and LaTeX.",
  );

  parts.push(
    [
      "# Working style",
      "- Be concise. Answer directly; skip preamble and avoid restating the question.",
      "- Read files before editing them. Prefer edit over write for existing files.",
      "- Use todo_write to plan multi-step tasks and keep it updated as you work.",
      "- Use the explore tool for broad codebase or literature searches so the main context stays focused.",
      "- After making changes, verify them (run tests, build, or execute the code) before declaring success.",
      "- For research tasks: cite papers by title and arXiv id; never fabricate citations.",
      "- If a long-running experiment is involved, launch it with exp_run and check on it with exp_status rather than blocking.",
    ].join("\n"),
  );

  parts.push(
    [
      "# Environment",
      `Working directory: ${opts.cwd}`,
      `Platform: ${process.platform} (${os.release()})`,
      `Date: ${new Date().toISOString().slice(0, 10)}`,
      `Model: ${opts.modelSpec}`,
      `Permission mode: ${opts.mode}${opts.mode === "plan" ? " (read-only; propose changes instead of making them)" : ""}`,
    ].join("\n"),
  );

  if (opts.skills.length > 0) {
    parts.push(
      "# Available skills (user invokes with /name)\n" +
        opts.skills.map((s) => `- /${s.name}: ${s.description}`).join("\n"),
    );
  }

  for (const f of opts.contextFiles) {
    parts.push(`# Context from ${f.path}\n\n${f.content}`);
  }

  return parts.join("\n\n");
}
