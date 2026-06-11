import { generateText, type LanguageModel, type ModelMessage } from "ai";

/** Compact when the last step's prompt grew past this share of the context window. */
const COMPACTION_THRESHOLD = 0.8;

export function shouldCompact(
  lastPromptTokens: number | undefined,
  contextWindow: number,
): boolean {
  if (!lastPromptTokens) return false;
  return lastPromptTokens > contextWindow * COMPACTION_THRESHOLD;
}

export async function summarizeConversation(
  model: LanguageModel,
  messages: ModelMessage[],
): Promise<string> {
  const { text } = await generateText({
    model,
    system:
      "Summarize this coding-agent conversation so the agent can seamlessly continue. " +
      "Capture: the user's overall goal and constraints; what has been done so far " +
      "(files created/edited with paths, commands run, experiments launched); key findings " +
      "and decisions; current state; and precisely what remains to be done next. " +
      "Be specific about file paths and identifiers. Output only the summary.",
    messages: [
      ...messages,
      {
        role: "user",
        content: "Summarize the conversation above as instructed.",
      },
    ],
  });
  return text;
}
