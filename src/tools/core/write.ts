import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { CycodeTool } from "../types.js";
import { resolveIn } from "../../util/paths.js";

export const writeTool: CycodeTool<{ file_path: string; content: string }> = {
  name: "write",
  description:
    "Write a file, creating parent directories and overwriting any existing content. " +
    "Prefer the edit tool for partial changes to existing files.",
  inputSchema: z.object({
    file_path: z.string(),
    content: z.string(),
  }),
  readOnly: false,
  permissionKey: (i) => `write(${i.file_path})`,
  describeCall: (i) => `write(${i.file_path})`,
  async execute(input, ctx) {
    const file = resolveIn(ctx.cwd, input.file_path);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, input.content);
    let result = `Wrote ${Buffer.byteLength(input.content)} bytes to ${file}`;
    const diag = await ctx.runDiagnostics();
    if (diag) result += `\n\nDIAGNOSTICS (fix before proceeding):\n${diag}`;
    return result;
  },
};
