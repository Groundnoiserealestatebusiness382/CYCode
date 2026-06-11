import fs from "node:fs";
import path from "node:path";
import { cycodeHome } from "./util/paths.js";

export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /** URL of a streamable-HTTP MCP server. Mutually exclusive with `command`. */
  url?: string;
}

export interface ProviderConfig {
  /** Base URL for an OpenAI-compatible endpoint. */
  baseURL?: string;
  /** Name of the environment variable holding the API key. */
  apiKeyEnv?: string;
}

export interface HookConfig {
  /** Permission-key pattern the hook applies to, e.g. "bash(git push*)" or "edit". */
  match: string;
  /** Shell command to run. See docs/configuration.md for the env contract. */
  command: string;
  timeoutMs?: number;
}

export interface CycodeConfig {
  /** Default model spec, e.g. "anthropic/claude-sonnet-4-6". */
  model?: string;
  /** Cheaper model used for compaction summaries and subagents. */
  smallModel?: string;
  permissions?: { allow?: string[]; deny?: string[] };
  /** Command run after file edits; non-zero output is fed back to the model. */
  diagnostics?: { command?: string; timeoutMs?: number };
  /**
   * Shell hooks around tool execution. preToolUse runs before a tool
   * (exit code 2 blocks the call); postToolUse runs after it succeeds
   * (exit code 2 feeds the hook's output back to the model).
   */
  hooks?: { preToolUse?: HookConfig[]; postToolUse?: HookConfig[] };
  /**
   * OS-level sandbox for shell commands (bash, exp_run): writes confined to
   * the project dir + tmp. macOS: Seatbelt; Linux: bubblewrap. Fails closed
   * when the backend is unavailable.
   */
  sandbox?: { bash?: boolean; allowNetwork?: boolean };
  mcpServers?: Record<string, McpServerConfig>;
  /** Extra OpenAI-compatible providers keyed by name. */
  providers?: Record<string, ProviderConfig>;
  /** Override the context window used for compaction decisions. */
  contextWindow?: number;
}

function readJson(file: string): CycodeConfig {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as CycodeConfig;
  } catch {
    return {};
  }
}

export function userConfigPath(): string {
  return path.join(cycodeHome(), "config.json");
}

export function projectConfigPath(cwd: string): string {
  return path.join(cwd, ".cycode", "config.json");
}

/** Merge user config with project config. Project scalars win; permission lists concatenate. */
export function loadConfig(cwd: string): CycodeConfig {
  const user = readJson(userConfigPath());
  const project = readJson(projectConfigPath(cwd));
  return {
    ...user,
    ...project,
    permissions: {
      allow: [
        ...(user.permissions?.allow ?? []),
        ...(project.permissions?.allow ?? []),
      ],
      deny: [
        ...(user.permissions?.deny ?? []),
        ...(project.permissions?.deny ?? []),
      ],
    },
    hooks: {
      preToolUse: [
        ...(user.hooks?.preToolUse ?? []),
        ...(project.hooks?.preToolUse ?? []),
      ],
      postToolUse: [
        ...(user.hooks?.postToolUse ?? []),
        ...(project.hooks?.postToolUse ?? []),
      ],
    },
    mcpServers: { ...user.mcpServers, ...project.mcpServers },
    providers: { ...user.providers, ...project.providers },
  };
}

/** Persist an "always allow" permission rule into the project config. */
export function saveProjectPermission(cwd: string, rule: string): void {
  const file = projectConfigPath(cwd);
  const existing = readJson(file);
  const allow = existing.permissions?.allow ?? [];
  if (allow.includes(rule)) return;
  const next: CycodeConfig = {
    ...existing,
    permissions: { ...existing.permissions, allow: [...allow, rule] },
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + "\n");
}
