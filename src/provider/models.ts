import type { CycodeConfig } from "../config.js";

/** Static context-window catalog (prefix-matched). Used for compaction decisions only. */
const CONTEXT_WINDOWS: [prefix: string, tokens: number][] = [
  ["anthropic/claude", 200_000],
  ["openai/gpt-5", 256_000],
  ["openai/gpt-4", 128_000],
  ["google/gemini-2", 1_000_000],
  ["google/gemini", 1_000_000],
];

const DEFAULT_CONTEXT_WINDOW = 128_000;

export function getContextWindow(spec: string, config: CycodeConfig): number {
  if (config.contextWindow) return config.contextWindow;
  for (const [prefix, tokens] of CONTEXT_WINDOWS) {
    if (spec.startsWith(prefix)) return tokens;
  }
  return DEFAULT_CONTEXT_WINDOW;
}
