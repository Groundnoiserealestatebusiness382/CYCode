import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { CycodeConfig } from "../config.js";

/**
 * Model specs are "provider/model-id", e.g.:
 *   anthropic/claude-sonnet-4-6
 *   openai/gpt-5.1
 *   google/gemini-2.5-pro
 *   ollama/llama3.3
 *   openrouter/anthropic/claude-sonnet-4-6
 * Extra OpenAI-compatible providers can be defined in config.providers.
 */
export function resolveModel(spec: string, config: CycodeConfig): LanguageModel {
  const slash = spec.indexOf("/");
  if (slash === -1) {
    throw new Error(
      `Invalid model spec "${spec}" — expected "provider/model-id" (e.g. anthropic/claude-sonnet-4-6)`,
    );
  }
  const provider = spec.slice(0, slash);
  const modelId = spec.slice(slash + 1);
  const custom = config.providers?.[provider];

  switch (provider) {
    case "anthropic":
      return createAnthropic({ baseURL: custom?.baseURL })(modelId);
    case "openai":
      return createOpenAI({ baseURL: custom?.baseURL })(modelId);
    case "google":
      return createGoogleGenerativeAI({ baseURL: custom?.baseURL })(modelId);
    case "ollama":
      return createOpenAICompatible({
        name: "ollama",
        baseURL: custom?.baseURL ?? "http://localhost:11434/v1",
      })(modelId);
    case "openrouter":
      return createOpenAICompatible({
        name: "openrouter",
        baseURL: custom?.baseURL ?? "https://openrouter.ai/api/v1",
        apiKey: process.env[custom?.apiKeyEnv ?? "OPENROUTER_API_KEY"],
      })(modelId);
    default: {
      if (custom?.baseURL) {
        return createOpenAICompatible({
          name: provider,
          baseURL: custom.baseURL,
          apiKey: custom.apiKeyEnv ? process.env[custom.apiKeyEnv] : undefined,
        })(modelId);
      }
      throw new Error(
        `Unknown provider "${provider}". Built-ins: anthropic, openai, google, ollama, openrouter. ` +
          `Define others under "providers" in your config with a baseURL.`,
      );
    }
  }
}

/** Pick a default model from config or whichever API key is present. */
export function defaultModelSpec(config: CycodeConfig): string {
  if (config.model) return config.model;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic/claude-sonnet-4-6";
  if (process.env.OPENAI_API_KEY) return "openai/gpt-5.1";
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return "google/gemini-2.5-pro";
  if (process.env.OPENROUTER_API_KEY) return "openrouter/anthropic/claude-sonnet-4-6";
  throw new Error(
    "No model configured. Set ANTHROPIC_API_KEY / OPENAI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY / " +
      'OPENROUTER_API_KEY, or set "model" in ~/.cycode/config.json (e.g. "ollama/llama3.3").',
  );
}

/** Model used for compaction summaries and subagents. */
export function smallModelSpec(config: CycodeConfig, mainSpec: string): string {
  if (config.smallModel) return config.smallModel;
  if (mainSpec.startsWith("anthropic/")) return "anthropic/claude-haiku-4-5-20251001";
  return mainSpec;
}
