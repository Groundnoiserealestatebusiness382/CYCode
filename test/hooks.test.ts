import { describe, expect, it } from "vitest";
import { runHooks } from "../src/agent/hooks.js";
import { makeTmpDir } from "./helpers.js";

describe("runHooks", () => {
  const ctx = (overrides = {}) => ({
    cwd: makeTmpDir(),
    toolName: "bash",
    key: "bash(git push)",
    input: { command: "git push" },
    ...overrides,
  });

  it("skips hooks whose match pattern doesn't apply", async () => {
    const result = await runHooks(
      [{ match: "edit", command: "exit 2" }],
      ctx(),
    );
    expect(result.signal).toBeUndefined();
    expect(result.warnings).toEqual([]);
  });

  it("returns the output of an exit-2 hook as a signal", async () => {
    const result = await runHooks(
      [{ match: "bash(git push*)", command: "echo 'not on Fridays' >&2; exit 2" }],
      ctx(),
    );
    expect(result.signal).toBe("not on Fridays");
  });

  it("treats other non-zero exits as warnings, not signals", async () => {
    const result = await runHooks(
      [{ match: "bash", command: "echo broken; exit 1" }],
      ctx(),
    );
    expect(result.signal).toBeUndefined();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("exited 1");
  });

  it("exposes the call context through environment variables", async () => {
    const result = await runHooks(
      [
        {
          match: "bash",
          command: 'echo "$CYCODE_TOOL_NAME|$CYCODE_TOOL_KEY|$CYCODE_TOOL_INPUT"; exit 2',
        },
      ],
      ctx(),
    );
    expect(result.signal).toBe('bash|bash(git push)|{"command":"git push"}');
  });

  it("passes tool output to postToolUse hooks", async () => {
    const result = await runHooks(
      [{ match: "read", command: 'echo "saw: $CYCODE_TOOL_OUTPUT"; exit 2' }],
      ctx({ toolName: "read", key: "read", output: "file contents" }),
    );
    expect(result.signal).toBe("saw: file contents");
  });

  it("runs hooks in order and stops at the first signal", async () => {
    const dir = makeTmpDir();
    const result = await runHooks(
      [
        { match: "bash", command: `touch ${dir}/first` },
        { match: "bash", command: "echo stop; exit 2" },
        { match: "bash", command: `touch ${dir}/third` },
      ],
      ctx({ cwd: dir }),
    );
    expect(result.signal).toBe("stop");
    const fs = await import("node:fs");
    expect(fs.existsSync(`${dir}/first`)).toBe(true);
    expect(fs.existsSync(`${dir}/third`)).toBe(false);
  });
});
