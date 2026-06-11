import { describe, expect, it, vi } from "vitest";
import { PermissionGate, ruleMatches } from "../src/permissions/permissions.js";
import { bashTool } from "../src/tools/core/bash.js";
import { editTool } from "../src/tools/core/edit.js";
import { readTool } from "../src/tools/core/read.js";

describe("ruleMatches", () => {
  it("matches bare tool names against any call", () => {
    expect(ruleMatches("bash", "bash(git status)")).toBe(true);
    expect(ruleMatches("bash", "bash")).toBe(true);
    expect(ruleMatches("bash", "edit(/x)")).toBe(false);
  });

  it("matches prefix wildcards", () => {
    expect(ruleMatches("bash(git *)", "bash(git status)")).toBe(true);
    expect(ruleMatches("bash(git *)", "bash(gitx)")).toBe(false);
    expect(ruleMatches("bash(npm run *)", "bash(npm run test)")).toBe(true);
    expect(ruleMatches("bash(git *)", "bash(rm -rf /)")).toBe(false);
  });

  it("matches exact arguments", () => {
    expect(ruleMatches("write(/tmp/a)", "write(/tmp/a)")).toBe(true);
    expect(ruleMatches("write(/tmp/a)", "write(/tmp/b)")).toBe(false);
  });
});

describe("PermissionGate", () => {
  const denyArbiter = vi.fn(async () => ({ behavior: "deny" as const }));

  it("allows read-only tools without asking", async () => {
    const gate = new PermissionGate({ mode: "default", arbiter: denyArbiter });
    expect((await gate.check(readTool, { file_path: "x" })).allowed).toBe(true);
  });

  it("deny rules win even for read-only tools", async () => {
    const gate = new PermissionGate({
      mode: "bypass",
      deny: ["read"],
      arbiter: denyArbiter,
    });
    expect((await gate.check(readTool, { file_path: "x" })).allowed).toBe(false);
  });

  it("plan mode blocks non-read-only tools", async () => {
    const gate = new PermissionGate({ mode: "plan", arbiter: denyArbiter });
    const res = await gate.check(bashTool, { command: "ls" });
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/plan mode/i);
  });

  it("acceptEdits auto-allows edits but still asks for bash", async () => {
    const arbiter = vi.fn(async () => ({ behavior: "deny" as const }));
    const gate = new PermissionGate({ mode: "acceptEdits", arbiter });
    expect(
      (await gate.check(editTool, { file_path: "x", old_string: "a", new_string: "b" }))
        .allowed,
    ).toBe(true);
    expect(arbiter).not.toHaveBeenCalled();
    expect((await gate.check(bashTool, { command: "ls" })).allowed).toBe(false);
    expect(arbiter).toHaveBeenCalledOnce();
  });

  it("allow rules skip the arbiter", async () => {
    const arbiter = vi.fn(async () => ({ behavior: "deny" as const }));
    const gate = new PermissionGate({
      mode: "default",
      allow: ["bash(git *)"],
      arbiter,
    });
    expect((await gate.check(bashTool, { command: "git status" })).allowed).toBe(true);
    expect(arbiter).not.toHaveBeenCalled();
  });

  it("always-allow decisions persist for the session and notify the host", async () => {
    const arbiter = vi
      .fn()
      .mockResolvedValueOnce({ behavior: "allow", always: true });
    const gate = new PermissionGate({ mode: "default", arbiter });
    const persisted: string[] = [];
    gate.onAlwaysAllow = (rule) => persisted.push(rule);
    expect((await gate.check(bashTool, { command: "ls -la" })).allowed).toBe(true);
    expect((await gate.check(bashTool, { command: "ls -la" })).allowed).toBe(true);
    expect(arbiter).toHaveBeenCalledOnce();
    expect(persisted).toEqual(["bash(ls -la)"]);
  });
});
