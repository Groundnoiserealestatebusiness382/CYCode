import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { editTool } from "../src/tools/core/edit.js";
import { writeTool } from "../src/tools/core/write.js";
import { readTool } from "../src/tools/core/read.js";
import { makeCtx, makeTmpDir } from "./helpers.js";

describe("write + read + edit tools", () => {
  it("writes and reads a file with numbered lines", async () => {
    const dir = makeTmpDir();
    const ctx = makeCtx(dir);
    await writeTool.execute({ file_path: "a.txt", content: "alpha\nbeta" }, ctx);
    const out = await readTool.execute({ file_path: "a.txt" }, ctx);
    expect(out).toContain("1\talpha");
    expect(out).toContain("2\tbeta");
  });

  it("replaces a unique string", async () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "f.txt");
    fs.writeFileSync(file, "hello world");
    const ctx = makeCtx(dir);
    await editTool.execute(
      { file_path: "f.txt", old_string: "world", new_string: "cycode" },
      ctx,
    );
    expect(fs.readFileSync(file, "utf8")).toBe("hello cycode");
  });

  it("rejects ambiguous matches unless replace_all", async () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "f.txt");
    fs.writeFileSync(file, "x x x");
    const ctx = makeCtx(dir);
    await expect(
      editTool.execute({ file_path: "f.txt", old_string: "x", new_string: "y" }, ctx),
    ).rejects.toThrow(/3 times/);
    await editTool.execute(
      { file_path: "f.txt", old_string: "x", new_string: "y", replace_all: true },
      ctx,
    );
    expect(fs.readFileSync(file, "utf8")).toBe("y y y");
  });

  it("rejects missing old_string and identical strings", async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "f.txt"), "abc");
    const ctx = makeCtx(dir);
    await expect(
      editTool.execute({ file_path: "f.txt", old_string: "zzz", new_string: "y" }, ctx),
    ).rejects.toThrow(/not found/);
    await expect(
      editTool.execute({ file_path: "f.txt", old_string: "abc", new_string: "abc" }, ctx),
    ).rejects.toThrow(/identical/);
  });

  it("appends diagnostics output on failure", async () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "f.txt"), "abc");
    const ctx = makeCtx(dir, { runDiagnostics: async () => "type error in f.txt" });
    const out = await editTool.execute(
      { file_path: "f.txt", old_string: "abc", new_string: "xyz" },
      ctx,
    );
    expect(out).toContain("DIAGNOSTICS");
    expect(out).toContain("type error in f.txt");
  });
});
