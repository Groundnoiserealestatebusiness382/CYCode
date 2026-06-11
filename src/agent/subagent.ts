import { z } from "zod";
import type { LanguageModel } from "ai";
import type { CycodeConfig } from "../config.js";
import type { CycodeTool } from "../tools/types.js";
import { buildSystemPrompt } from "../context/context.js";
import { Agent } from "./loop.js";
import { EventBus } from "./events.js";

/**
 * The explore tool runs a nested read-only agent for broad searches
 * (codebase or literature) so the main context stays small. Only the
 * subagent's final report comes back to the main loop.
 */
export function createExploreTool(deps: {
  cwd: string;
  config: CycodeConfig;
  model: LanguageModel;
  modelSpec: string;
  contextWindow: number;
  /** Read-only tools the subagent may use. */
  tools: CycodeTool[];
  onProgress?: (toolDescription: string) => void;
}): CycodeTool<{ task: string }> {
  return {
    name: "explore",
    description:
      "Spawn a read-only subagent to investigate a question and report back. Use for broad " +
      "codebase exploration or literature surveys that would need many search/read calls. " +
      "The task must be self-contained: the subagent cannot see this conversation.",
    inputSchema: z.object({
      task: z.string().describe("Self-contained description of what to investigate and report"),
    }),
    readOnly: true,
    describeCall: (i) =>
      `explore(${i.task.length > 100 ? i.task.slice(0, 100) + "…" : i.task})`,
    async execute(input, ctx) {
      const bus = new EventBus();
      bus.on((event) => {
        if (event.type === "tool-start") deps.onProgress?.(event.description);
      });
      const sub = new Agent({
        cwd: deps.cwd,
        config: deps.config,
        model: deps.model,
        systemPrompt: buildSystemPrompt({
          cwd: deps.cwd,
          modelSpec: deps.modelSpec,
          mode: "plan",
          contextFiles: [],
          skills: [],
          isSubagent: true,
        }),
        mode: "plan",
        arbiter: async () => ({ behavior: "deny", message: "Subagents are read-only" }),
        tools: deps.tools.filter((t) => t.readOnly),
        bus,
        contextWindow: deps.contextWindow,
        maxStepsPerTurn: 30,
      });
      const abort = () => sub.abort();
      ctx.abortSignal?.addEventListener("abort", abort, { once: true });
      try {
        const report = await sub.runTurn(input.task);
        return report || "(subagent returned no report)";
      } finally {
        ctx.abortSignal?.removeEventListener("abort", abort);
      }
    },
  };
}
