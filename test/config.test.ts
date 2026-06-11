import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, saveProjectPermission } from "../src/config.js";
import { makeTmpDir } from "./helpers.js";

describe("config", () => {
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

  it("merges user and project config, project scalars winning", () => {
    fs.writeFileSync(
      path.join(home, "config.json"),
      JSON.stringify({
        model: "anthropic/claude-sonnet-4-6",
        permissions: { allow: ["bash(git *)"] },
      }),
    );
    fs.mkdirSync(path.join(project, ".cycode"), { recursive: true });
    fs.writeFileSync(
      path.join(project, ".cycode", "config.json"),
      JSON.stringify({
        model: "openai/gpt-5.1",
        permissions: { allow: ["bash(npm *)"] },
      }),
    );
    const config = loadConfig(project);
    expect(config.model).toBe("openai/gpt-5.1");
    expect(config.permissions!.allow).toEqual(["bash(git *)", "bash(npm *)"]);
  });

  it("returns empty config when files are missing", () => {
    const config = loadConfig(project);
    expect(config.permissions!.allow).toEqual([]);
    expect(config.model).toBeUndefined();
  });

  it("persists always-allow rules without duplicates", () => {
    saveProjectPermission(project, "bash(ls -la)");
    saveProjectPermission(project, "bash(ls -la)");
    const config = loadConfig(project);
    expect(config.permissions!.allow).toEqual(["bash(ls -la)"]);
  });
});
