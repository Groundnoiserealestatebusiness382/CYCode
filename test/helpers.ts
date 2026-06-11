import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ToolContext } from "../src/tools/types.js";
import type { AgentEvent } from "../src/agent/events.js";

export function makeTmpDir(prefix = "cycode-test-"): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function makeCtx(
  cwd: string,
  overrides: Partial<ToolContext> = {},
): ToolContext & { events: AgentEvent[] } {
  const events: AgentEvent[] = [];
  return {
    cwd,
    config: {},
    emit: (e) => events.push(e),
    todos: [],
    runDiagnostics: async () => undefined,
    events,
    ...overrides,
  };
}
