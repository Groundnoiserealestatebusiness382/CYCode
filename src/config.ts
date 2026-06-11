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

export interface CycodeConfig {
  /** Default model spec, e.g. "anthropic/claude-sonnet-4-6". */
  model?: string;
  /** Cheaper model used for compaction summaries and subagents. */
  smallModel?: string;
  permissions?: { allow?: string[]; deny?: string[] };
  /** Command run after file edits; non-zero output is fed back to the model. */
  diagnostics?: { command?: string; timeoutMs?: number };
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
