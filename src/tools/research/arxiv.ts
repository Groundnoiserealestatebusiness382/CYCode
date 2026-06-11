import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import type { CycodeTool } from "../types.js";

export interface ArxivEntry {
  id: string;
  title: string;
  authors: string[];
  summary: string;
  published: string;
  categories: string[];
  pdf_url: string;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function parseArxivAtom(xml: string): ArxivEntry[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const doc = parser.parse(xml);
  const entries = asArray<any>(doc?.feed?.entry);
  return entries.map((e) => {
    const absUrl: string = String(e.id ?? "");
    const shortId = absUrl.replace(/^https?:\/\/arxiv\.org\/abs\//, "");
    return {
      id: shortId,
      title: String(e.title ?? "").replace(/\s+/g, " ").trim(),
      authors: asArray<any>(e.author).map((a) => String(a?.name ?? "")),
      summary: String(e.summary ?? "").replace(/\s+/g, " ").trim(),
      published: String(e.published ?? "").slice(0, 10),
      categories: asArray<any>(e.category).map((c) => String(c?.["@_term"] ?? "")),
      pdf_url: `https://arxiv.org/pdf/${shortId}`,
    };
  });
}

export const arxivSearchTool: CycodeTool<{
  query: string;
  max_results?: number;
  sort_by?: "relevance" | "submittedDate";
}> = {
  name: "arxiv_search",
  description:
    "Search arXiv for papers. Supports field prefixes in the query " +
    '(e.g. "ti:diffusion AND cat:cs.LG", "au:hinton"). Returns id, title, authors, ' +
    "date, abstract, and PDF URL; read a result with paper_read.",
  inputSchema: z.object({
    query: z.string(),
    max_results: z.number().int().min(1).max(50).optional(),
    sort_by: z.enum(["relevance", "submittedDate"]).optional(),
  }),
  readOnly: true,
  describeCall: (i) => `arxiv_search(${i.query})`,
  async execute(input, ctx) {
    const params = new URLSearchParams({
      search_query: input.query,
      start: "0",
      max_results: String(input.max_results ?? 10),
      sortBy: input.sort_by ?? "relevance",
      sortOrder: "descending",
    });
    const res = await fetch(`https://export.arxiv.org/api/query?${params}`, {
      signal: ctx.abortSignal ?? AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`arXiv API returned HTTP ${res.status}`);
    const entries = parseArxivAtom(await res.text());
    if (entries.length === 0) return "No papers found";
    return entries
      .map(
        (e, i) =>
          `${i + 1}. ${e.title}\n` +
          `   arXiv:${e.id} | ${e.published} | ${e.categories.join(", ")}\n` +
          `   ${e.authors.slice(0, 8).join(", ")}${e.authors.length > 8 ? " et al." : ""}\n` +
          `   ${e.summary.length > 600 ? e.summary.slice(0, 600) + "…" : e.summary}`,
      )
      .join("\n\n");
  },
};
