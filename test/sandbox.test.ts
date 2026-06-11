import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSeatbeltProfile, shellSpawn } from "../src/util/sandbox.js";
import { bashTool } from "../src/tools/core/bash.js";
import { makeCtx, makeTmpDir } from "./helpers.js";

describe("sandbox spec building", () => {
  it("returns plain bash when the sandbox is off", () => {
    const spec = shellSpawn("ls", {}, "/proj");
    expect(spec).toEqual({ file: "/bin/bash", args: ["-c", "ls"] });
  });

  it("builds a Seatbelt profile that denies writes outside the workspace", () => {
    const profile = buildSeatbeltProfile({ cwd: "/proj", allowNetwork: true });
    expect(profile).toContain("(deny file-write*)");
    expect(profile).toContain('(subpath "/proj")');
    expect(profile).not.toContain("(deny network*)");
  });

  it("denies network when allowNetwork is false", () => {
    const profile = buildSeatbeltProfile({ cwd: "/proj", allowNetwork: false });
    expect(profile).toContain("(deny network*)");
  });

  it("escapes quotes in workspace paths", () => {
    const profile = buildSeatbeltProfile({ cwd: '/pro"j', allowNetwork: true });
    expect(profile).toContain('\\"');
  });
});

// real Seatbelt integration — macOS only (CI on Linux skips these)
describe.skipIf(process.platform !== "darwin")("sandboxed bash on macOS", () => {
  const sandboxConfig = { sandbox: { bash: true } };

  it("allows writes inside the project directory", async () => {
    const dir = makeTmpDir();
    const ctx = makeCtx(fs.realpathSync(dir), { config: sandboxConfig });
    const out = await bashTool.execute({ command: "echo ok > inside.txt && cat inside.txt" }, ctx);
    expect(out).toContain("ok");
  });

  it("blocks writes outside the project directory", async () => {
    const dir = makeTmpDir();
    const ctx = makeCtx(fs.realpathSync(dir), { config: sandboxConfig });
    // tmp is writable by design, so target the home directory instead
    const target = path.join(process.env.HOME ?? "/", "cycode-sandbox-escape-test.txt");
    const out = await bashTool.execute(
      { command: `echo nope > "${target}" 2>&1; echo exit=$?` },
      ctx,
    );
    expect(out).not.toContain("exit=0");
    expect(fs.existsSync(target)).toBe(false);
  });

  it("still allows reading outside the project", async () => {
    const dir = makeTmpDir();
    const ctx = makeCtx(fs.realpathSync(dir), { config: sandboxConfig });
    const out = await bashTool.execute({ command: "head -1 /etc/hosts" }, ctx);
    expect(out.length).toBeGreaterThan(0);
  });
});
