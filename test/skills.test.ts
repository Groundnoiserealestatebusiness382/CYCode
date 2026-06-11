import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { expandSlashCommand, loadSkills } from "../src/skills/skills.js";
import { makeTmpDir } from "./helpers.js";

describe("skills", () => {
  let home: string;
  let project: string;

  beforeEach(() => {
    home = makeTmpDir("cycode-home-");
    project = makeTmpDir("cycode-proj-");
    process.env.CYCODE_HOME = home;
  });

  afterEach(() => {
    delete process.env.CYCODE_HOME;
  });

  it("loads built-in skills from the package", () => {
    const skills = loadSkills(project);
    const names = skills.map((s) => s.name);
    expect(names).toContain("lit-review");
    expect(names).toContain("watch-run");
  });

  it("project skills override built-ins of the same name", () => {
    const dir = path.join(project, ".cycode", "skills", "lit-review");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "SKILL.md"),
      "---\nname: lit-review\ndescription: project version\n---\nproject body",
    );
    const skill = loadSkills(project).find((s) => s.name === "lit-review")!;
    expect(skill.source).toBe("project");
    expect(skill.body).toBe("project body");
  });

  it("expands slash commands with arguments", () => {
    const skills = [
      { name: "demo", description: "d", body: "DO THE THING", source: "user" as const },
    ];
    const out = expandSlashCommand("/demo with args", skills)!;
    expect(out).toContain("DO THE THING");
    expect(out).toContain("User request: with args");
    expect(expandSlashCommand("/missing", skills)).toBeNull();
    expect(expandSlashCommand("not a command", skills)).toBeNull();
  });
});
