import fg from "fast-glob";
import { z } from "zod";
import type { CycodeTool } from "../types.js";
import { resolveIn } from "../../util/paths.js";

const MAX_RESULTS = 200;

export const globTool: CycodeTool<{ pattern: string; path?: string }> = {
  name: "glob",
  description:
    "Find files matching a glob pattern (e.g. \"**/*.py\", \"src/**/*.ts\"). " +
    "Results are sorted by modification time, newest first.",
  inputSchema: z.object({
    pattern: z.string(),
    path: z.string().optional().describe("Directory to search in (default: cwd)"),
  }),
  readOnly: true,
  describeCall: (i) => `glob(${i.pattern})`,
  async execute(input, ctx) {
    const cwd = input.path ? resolveIn(ctx.cwd, input.path) : ctx.cwd;
    const entries = await fg(input.pattern, {
      cwd,
      dot: false,
      ignore: ["**/node_modules/**", "**/.git/**"],
      stats: true,
      suppressErrors: true,
    });
    if (entries.length === 0) return "No files matched";
    const sorted = entries
      .sort((a, b) => (b.stats?.mtimeMs ?? 0) - (a.stats?.mtimeMs ?? 0))
      .slice(0, MAX_RESULTS)
      .map((e) => e.path);
    const more =
      entries.length > MAX_RESULTS
        ? `\n(${entries.length - MAX_RESULTS} more not shown)`
        : "";
    return sorted.join("\n") + more;
  },
};
