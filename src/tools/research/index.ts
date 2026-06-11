import type { CycodeTool } from "../types.js";
import { arxivSearchTool } from "./arxiv.js";
import { paperReadTool, semanticScholarTool } from "./papers.js";
import { notebookReadTool, notebookEditTool } from "./notebook.js";
import { expRunTool, expStatusTool, expStopTool } from "./experiments.js";
import { latexBuildTool } from "./latex.js";

export const researchTools: CycodeTool[] = [
  arxivSearchTool,
  paperReadTool,
  semanticScholarTool,
  notebookReadTool,
  notebookEditTool,
  expRunTool,
  expStatusTool,
  expStopTool,
  latexBuildTool,
];

export {
  arxivSearchTool,
  paperReadTool,
  semanticScholarTool,
  notebookReadTool,
  notebookEditTool,
  expRunTool,
  expStatusTool,
  expStopTool,
  latexBuildTool,
};
