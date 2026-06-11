import type { CycodeTool } from "../types.js";
import { readTool } from "./read.js";
import { writeTool } from "./write.js";
import { editTool } from "./edit.js";
import { globTool } from "./glob.js";
import { grepTool } from "./grep.js";
import { bashTool } from "./bash.js";
import { webFetchTool } from "./web_fetch.js";
import { todoTool } from "./todo.js";

export const coreTools: CycodeTool[] = [
  readTool,
  writeTool,
  editTool,
  globTool,
  grepTool,
  bashTool,
  webFetchTool,
  todoTool,
];

export {
  readTool,
  writeTool,
  editTool,
  globTool,
  grepTool,
  bashTool,
  webFetchTool,
  todoTool,
};
