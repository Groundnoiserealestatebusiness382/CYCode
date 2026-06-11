import { describe, expect, it } from "vitest";
import { shouldCompact } from "../src/agent/compaction.js";
import { truncateMiddle, bashTool } from "../src/tools/core/bash.js";
import { htmlToText } from "../src/tools/core/web_fetch.js";
import { makeCtx, makeTmpDir } from "./helpers.js";

describe("shouldCompact", () => {
  it("triggers above 80% of the context window", () => {
    expect(shouldCompact(170_000, 200_000)).toBe(true);
    expect(shouldCompact(100_000, 200_000)).toBe(false);
    expect(shouldCompact(undefined, 200_000)).toBe(false);
  });
});

describe("truncateMiddle", () => {
  it("keeps head and tail of long output", () => {
    const long = "A".repeat(20_000) + "MIDDLE" + "B".repeat(20_000);
    const out = truncateMiddle(long, 1000);
    expect(out.length).toBeLessThan(1200);
    expect(out.startsWith("A")).toBe(true);
    expect(out.endsWith("B")).toBe(true);
    expect(out).toContain("truncated");
  });

  it("leaves short output untouched", () => {
    expect(truncateMiddle("short", 1000)).toBe("short");
  });
});

describe("bash tool", () => {
  it("runs commands in the project cwd", async () => {
    const dir = makeTmpDir();
    const out = await bashTool.execute({ command: "pwd" }, makeCtx(dir));
    expect(out.trim().endsWith(dir.split("/").pop()!)).toBe(true);
  });

  it("reports non-zero exit codes in the output", async () => {
    const out = await bashTool.execute(
      { command: "echo oops >&2; exit 3" },
      makeCtx(makeTmpDir()),
    );
    expect(out).toContain("Exit code 3");
    expect(out).toContain("oops");
  });
});

describe("htmlToText", () => {
  it("strips tags, scripts, and entities", () => {
    const html =
      "<html><head><title>x</title></head><body><script>evil()</script>" +
      "<h1>Hello</h1><p>World &amp; <b>friends</b></p></body></html>";
    const text = htmlToText(html);
    expect(text).toContain("Hello");
    expect(text).toContain("World & friends");
    expect(text).not.toContain("evil");
    expect(text).not.toContain("<");
  });
});
