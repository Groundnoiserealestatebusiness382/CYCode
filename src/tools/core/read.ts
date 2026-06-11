import fs from "node:fs";
import { z } from "zod";
import type { CycodeTool } from "../types.js";
import { resolveIn } from "../../util/paths.js";

const MAX_LINES = 2000;
const MAX_LINE_LENGTH = 2000;

export const readTool: CycodeTool<{
  file_path: string;
  offset?: number;
  limit?: number;
}> = {
  name: "read",
  description:
    "Read a file from the filesystem. Returns numbered lines (cat -n style). " +
    "Use offset/limit for large files. Always read a file before editing it.",
  inputSchema: z.object({
    file_path: z.string().describe("Path to the file (absolute or relative to cwd)"),
    offset: z.number().int().min(1).optional().describe("1-based line to start from"),
    limit: z.number().int().min(1).optional().describe("Max lines to read"),
  }),
  readOnly: true,
  describeCall: (i) => `read(${i.file_path})`,
  async execute(input, ctx) {
    const file = resolveIn(ctx.cwd, input.file_path);
    const stat = fs.statSync(file, { throwIfNoEntry: false });
    if (!stat) throw new Error(`File not found: ${file}`);
    if (stat.isDirectory()) throw new Error(`${file} is a directory`);
    const lines = fs.readFileSync(file, "utf8").split("\n");
    const start = (input.offset ?? 1) - 1;
    const limit = Math.min(input.limit ?? MAX_LINES, MAX_LINES);
    const slice = lines.slice(start, start + limit);
    if (slice.length === 0) return `(file has ${lines.length} lines; offset is past the end)`;
    const out = slice
      .map((line, i) => {
        const text =
          line.length > MAX_LINE_LENGTH ? line.slice(0, MAX_LINE_LENGTH) + "…" : line;
        return `${String(start + i + 1).padStart(6)}\t${text}`;
      })
      .join("\n");
    const more = start + slice.length < lines.length
      ? `\n(${lines.length - start - slice.length} more lines; use offset to continue)`
      : "";
    return out + more;
  },
};
