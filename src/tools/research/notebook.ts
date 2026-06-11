import fs from "node:fs";
import { z } from "zod";
import type { CycodeTool } from "../types.js";
import { resolveIn } from "../../util/paths.js";

const MAX_OUTPUT_CHARS = 2000;

interface NotebookCell {
  cell_type: "code" | "markdown" | "raw";
  source: string[] | string;
  outputs?: any[];
  metadata?: Record<string, unknown>;
  execution_count?: number | null;
}

interface Notebook {
  cells: NotebookCell[];
  nbformat: number;
  [key: string]: unknown;
}

function readNotebook(file: string): Notebook {
  const nb = JSON.parse(fs.readFileSync(file, "utf8")) as Notebook;
  if (!Array.isArray(nb.cells)) throw new Error("Not a valid notebook: no cells array");
  return nb;
}

function sourceText(cell: NotebookCell): string {
  return Array.isArray(cell.source) ? cell.source.join("") : (cell.source ?? "");
}

/** nbformat stores source as lines, each (except possibly the last) ending in \n. */
export function toSourceLines(text: string): string[] {
  const lines = text.split("\n");
  return lines.map((l, i) => (i < lines.length - 1 ? l + "\n" : l)).filter(
    (l, i, arr) => !(i === arr.length - 1 && l === ""),
  );
}

function renderOutput(output: any): string {
  if (output.output_type === "stream") {
    return Array.isArray(output.text) ? output.text.join("") : String(output.text ?? "");
  }
  if (output.output_type === "execute_result" || output.output_type === "display_data") {
    const plain = output.data?.["text/plain"];
    if (plain) return Array.isArray(plain) ? plain.join("") : String(plain);
    return `[${Object.keys(output.data ?? {}).join(", ") || "no data"}]`;
  }
  if (output.output_type === "error") {
    return `${output.ename}: ${output.evalue}`;
  }
  return `[${output.output_type}]`;
}

export const notebookReadTool: CycodeTool<{
  path: string;
  include_outputs?: boolean;
}> = {
  name: "notebook_read",
  description:
    "Read a Jupyter notebook (.ipynb): all cells with indices, types, sources, and " +
    "(optionally) outputs. Use the cell indices with notebook_edit.",
  inputSchema: z.object({
    path: z.string(),
    include_outputs: z.boolean().optional().describe("Default true"),
  }),
  readOnly: true,
  describeCall: (i) => `notebook_read(${i.path})`,
  async execute(input, ctx) {
    const nb = readNotebook(resolveIn(ctx.cwd, input.path));
    const includeOutputs = input.include_outputs !== false;
    return nb.cells
      .map((cell, i) => {
        let block = `[cell ${i}] ${cell.cell_type}\n${sourceText(cell)}`;
        if (includeOutputs && cell.cell_type === "code" && cell.outputs?.length) {
          const out = cell.outputs.map(renderOutput).join("\n");
          const shown =
            out.length > MAX_OUTPUT_CHARS ? out.slice(0, MAX_OUTPUT_CHARS) + "…" : out;
          block += `\n--- output ---\n${shown}`;
        }
        return block;
      })
      .join("\n\n");
  },
};

export const notebookEditTool: CycodeTool<{
  path: string;
  mode: "replace" | "insert_after" | "insert_before" | "delete" | "append";
  index?: number;
  source?: string;
  cell_type?: "code" | "markdown";
}> = {
  name: "notebook_edit",
  description:
    "Edit a Jupyter notebook cell by index: replace its source, insert a new cell " +
    "before/after it, delete it, or append a cell at the end. Outputs of an edited " +
    "cell are cleared (re-run via bash: jupyter nbconvert --execute --inplace).",
  inputSchema: z.object({
    path: z.string(),
    mode: z.enum(["replace", "insert_after", "insert_before", "delete", "append"]),
    index: z.number().int().min(0).optional(),
    source: z.string().optional(),
    cell_type: z.enum(["code", "markdown"]).optional(),
  }),
  readOnly: false,
  permissionKey: (i) => `notebook_edit(${i.path})`,
  describeCall: (i) => `notebook_edit(${i.path} ${i.mode}${i.index !== undefined ? " @" + i.index : ""})`,
  async execute(input, ctx) {
    const file = resolveIn(ctx.cwd, input.path);
    const nb = readNotebook(file);
    const needsIndex = input.mode !== "append";
    if (needsIndex) {
      if (input.index === undefined) throw new Error(`mode "${input.mode}" requires index`);
      if (input.index >= nb.cells.length) {
        throw new Error(`index ${input.index} out of range (${nb.cells.length} cells)`);
      }
    }
    const makeCell = (): NotebookCell => {
      const type = input.cell_type ?? "code";
      const cell: NotebookCell = {
        cell_type: type,
        source: toSourceLines(input.source ?? ""),
        metadata: {},
      };
      if (type === "code") {
        cell.outputs = [];
        cell.execution_count = null;
      }
      return cell;
    };
    let action: string;
    switch (input.mode) {
      case "replace": {
        const cell = nb.cells[input.index!]!;
        if (input.source === undefined) throw new Error("replace requires source");
        cell.source = toSourceLines(input.source);
        if (input.cell_type) cell.cell_type = input.cell_type;
        if (cell.cell_type === "code") {
          cell.outputs = [];
          cell.execution_count = null;
        }
        action = `Replaced cell ${input.index}`;
        break;
      }
      case "insert_before":
      case "insert_after": {
        const at = input.mode === "insert_before" ? input.index! : input.index! + 1;
        nb.cells.splice(at, 0, makeCell());
        action = `Inserted ${input.cell_type ?? "code"} cell at index ${at}`;
        break;
      }
      case "delete":
        nb.cells.splice(input.index!, 1);
        action = `Deleted cell ${input.index}`;
        break;
      case "append":
        nb.cells.push(makeCell());
        action = `Appended ${input.cell_type ?? "code"} cell at index ${nb.cells.length - 1}`;
        break;
    }
    fs.writeFileSync(file, JSON.stringify(nb, null, 1) + "\n");
    let result = `${action} (${nb.cells.length} cells total)`;
    const diag = await ctx.runDiagnostics();
    if (diag) result += `\n\nDIAGNOSTICS (fix before proceeding):\n${diag}`;
    return result;
  },
};
