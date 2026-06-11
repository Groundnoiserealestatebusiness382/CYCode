import fs from "node:fs";
import { z } from "zod";
import type { CycodeTool } from "../types.js";
import { resolveIn } from "../../util/paths.js";

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

export const editTool: CycodeTool<{
  file_path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}> = {
  name: "edit",
  description:
    "Replace an exact string in a file. old_string must match the file content exactly " +
    "(including whitespace) and must be unique unless replace_all is true.",
  inputSchema: z.object({
    file_path: z.string(),
    old_string: z.string(),
    new_string: z.string(),
    replace_all: z.boolean().optional(),
  }),
  readOnly: false,
  permissionKey: (i) => `edit(${i.file_path})`,
  describeCall: (i) => `edit(${i.file_path})`,
  async execute(input, ctx) {
    const file = resolveIn(ctx.cwd, input.file_path);
    if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
    if (input.old_string === input.new_string) {
      throw new Error("old_string and new_string are identical");
    }
    const content = fs.readFileSync(file, "utf8");
    const count = countOccurrences(content, input.old_string);
    if (count === 0) {
      throw new Error(
        "old_string not found in file. Read the file and match the content exactly.",
      );
    }
    if (count > 1 && !input.replace_all) {
      throw new Error(
        `old_string occurs ${count} times; provide more context to make it unique, or set replace_all`,
      );
    }
    const next = input.replace_all
      ? content.split(input.old_string).join(input.new_string)
      : content.replace(input.old_string, () => input.new_string);
    fs.writeFileSync(file, next);
    let result = `Edited ${file} (${count} replacement${count === 1 ? "" : "s"})`;
    const diag = await ctx.runDiagnostics();
    if (diag) result += `\n\nDIAGNOSTICS (fix before proceeding):\n${diag}`;
    return result;
  },
};
