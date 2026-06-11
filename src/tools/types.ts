import type { FlexibleSchema } from "ai";
import type { CycodeConfig } from "../config.js";
import type { AgentEvent, TodoItem } from "../agent/events.js";

export interface ToolContext {
  cwd: string;
  config: CycodeConfig;
  emit: (event: AgentEvent) => void;
  abortSignal?: AbortSignal;
  /** Shared, mutable todo list for the session. */
  todos: TodoItem[];
  /** Runs the configured diagnostics command after an edit; returns failure output if any. */
  runDiagnostics: () => Promise<string | undefined>;
}

export interface CycodeTool<I = any> {
  name: string;
  description: string;
  inputSchema: FlexibleSchema<I>;
  /** Read-only tools run without permission prompts (still subject to deny rules). */
  readOnly: boolean;
  /** Permission key for rule matching, e.g. `bash(git status)`. Defaults to the tool name. */
  permissionKey?: (input: I) => string;
  /** One-line human-readable summary of a call, shown in the UI and permission prompts. */
  describeCall?: (input: I) => string;
  execute: (input: I, ctx: ToolContext) => Promise<string>;
}

export function permissionKeyFor(tool: CycodeTool, input: unknown): string {
  return tool.permissionKey ? tool.permissionKey(input) : tool.name;
}

export function describeCall(tool: CycodeTool, input: unknown): string {
  try {
    return tool.describeCall ? tool.describeCall(input) : tool.name;
  } catch {
    return tool.name;
  }
}
