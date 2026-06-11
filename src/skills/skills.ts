import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { cycodeHome } from "../util/paths.js";
import { BUILTIN_SKILLS } from "./builtin.generated.js";

export interface SkillMeta {
  name: string;
  description: string;
  source: "builtin" | "user" | "project";
}

export interface Skill extends SkillMeta {
  body: string;
}

function builtinSkills(): Skill[] {
  // embedded at build time so they survive single-file binary compilation
  return BUILTIN_SKILLS.map((s) => ({ ...s, source: "builtin" as const }));
}

function loadFromDir(dir: string, source: Skill["source"]): Skill[] {
  if (!dir || !fs.existsSync(dir)) return [];
  const skills: Skill[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    let file: string | null = null;
    if (entry.isDirectory()) {
      const candidate = path.join(dir, entry.name, "SKILL.md");
      if (fs.existsSync(candidate)) file = candidate;
    } else if (entry.name.endsWith(".md")) {
      file = path.join(dir, entry.name);
    }
    if (!file) continue;
    try {
      const parsed = matter(fs.readFileSync(file, "utf8"));
      const name: string =
        parsed.data.name ??
        path.basename(path.dirname(file) === dir ? file : path.dirname(file), ".md");
      skills.push({
        name: String(name),
        description: String(parsed.data.description ?? "").trim(),
        body: parsed.content.trim(),
        source,
      });
    } catch {
      // skip malformed skill files
    }
  }
  return skills;
}

/** Later sources override earlier ones by name: builtin < user < project. */
export function loadSkills(cwd: string): Skill[] {
  const byName = new Map<string, Skill>();
  for (const skill of [
    ...builtinSkills(),
    ...loadFromDir(path.join(cycodeHome(), "skills"), "user"),
    ...loadFromDir(path.join(cwd, ".cycode", "skills"), "project"),
  ]) {
    byName.set(skill.name, skill);
  }
  return [...byName.values()];
}

/** Expand "/name args" into a prompt, or return null if it's not a skill invocation. */
export function expandSlashCommand(input: string, skills: Skill[]): string | null {
  const m = /^\/([a-zA-Z0-9_-]+)\s*([\s\S]*)$/.exec(input.trim());
  if (!m) return null;
  const skill = skills.find((s) => s.name === m[1]);
  if (!skill) return null;
  const args = m[2]!.trim();
  return (
    `<skill name="${skill.name}">\n${skill.body}\n</skill>\n\n` +
    (args ? `User request: ${args}` : "Follow the skill instructions above.")
  );
}
