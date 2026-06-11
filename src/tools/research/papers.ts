import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { z } from "zod";
import type { CycodeTool } from "../types.js";
import { papersDir, resolveIn } from "../../util/paths.js";

const MAX_CHARS = 40_000;
const ARXIV_ID = /^(\d{4}\.\d{4,5})(v\d+)?$/;

async function loadPdf(source: string, cwd: string, signal?: AbortSignal): Promise<Buffer> {
  let url: string | null = null;
  const idMatch = ARXIV_ID.exec(source.replace(/^arXiv:/i, ""));
  if (idMatch) url = `https://arxiv.org/pdf/${source.replace(/^arXiv:/i, "")}`;
  else if (/^https?:\/\//.test(source)) url = source;

  if (!url) {
    return fs.readFileSync(resolveIn(cwd, source));
  }
  const cacheFile = path.join(
    papersDir(),
    crypto.createHash("sha1").update(url).digest("hex") + ".pdf",
  );
  if (fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile);
  const res = await fetch(url, {
    signal: signal ?? AbortSignal.timeout(60_000),
    headers: { "user-agent": "cycode (+https://github.com/ChaoYue0307/CYCode)" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(cacheFile, buf);
  return buf;
}

export const paperReadTool: CycodeTool<{
  source: string;
  start_page?: number;
  end_page?: number;
}> = {
  name: "paper_read",
  description:
    "Read a paper PDF as text. Source can be an arXiv id (e.g. 2401.12345), a PDF URL, " +
    "or a local file path. Long papers are paginated: use start_page/end_page.",
  inputSchema: z.object({
    source: z.string(),
    start_page: z.number().int().min(1).optional(),
    end_page: z.number().int().min(1).optional(),
  }),
  readOnly: true,
  describeCall: (i) => `paper_read(${i.source})`,
  async execute(input, ctx) {
    const buf = await loadPdf(input.source, ctx.cwd, ctx.abortSignal);
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const start = (input.start_page ?? 1) - 1;
    const end = Math.min(input.end_page ?? totalPages, totalPages);
    const pages = (text as string[]).slice(start, end);
    let out = pages
      .map((p, i) => `--- page ${start + i + 1} of ${totalPages} ---\n${p.trim()}`)
      .join("\n\n");
    if (out.length > MAX_CHARS) {
      out =
        out.slice(0, MAX_CHARS) +
        `\n… [truncated — request fewer pages via start_page/end_page]`;
    }
    return out || "(no extractable text — possibly a scanned PDF)";
  },
};

export const semanticScholarTool: CycodeTool<{
  query?: string;
  paper_id?: string;
  limit?: number;
}> = {
  name: "semantic_scholar",
  description:
    "Query Semantic Scholar. With `query`: keyword paper search. With `paper_id` " +
    "(e.g. arXiv:2401.12345, DOI, or S2 id): list that paper's references. " +
    "Returns titles, authors, year, venue, and citation counts.",
  inputSchema: z.object({
    query: z.string().optional(),
    paper_id: z.string().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  readOnly: true,
  describeCall: (i) => `semantic_scholar(${i.query ?? i.paper_id ?? ""})`,
  async execute(input, ctx) {
    const limit = input.limit ?? 10;
    const fields = "title,abstract,year,venue,authors,citationCount,externalIds";
    const headers: Record<string, string> = {};
    if (process.env.SEMANTIC_SCHOLAR_API_KEY) {
      headers["x-api-key"] = process.env.SEMANTIC_SCHOLAR_API_KEY;
    }
    let url: string;
    if (input.paper_id) {
      url =
        `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(input.paper_id)}` +
        `/references?fields=${fields}&limit=${limit}`;
    } else if (input.query) {
      url =
        `https://api.semanticscholar.org/graph/v1/paper/search` +
        `?query=${encodeURIComponent(input.query)}&fields=${fields}&limit=${limit}`;
    } else {
      throw new Error("Provide either query or paper_id");
    }
    const res = await fetch(url, {
      headers,
      signal: ctx.abortSignal ?? AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Semantic Scholar API returned HTTP ${res.status}`);
    const body = (await res.json()) as any;
    const items: any[] = (body.data ?? []).map((d: any) => d.citedPaper ?? d);
    if (items.length === 0) return "No results";
    return items
      .filter((p) => p && p.title)
      .map((p, i) => {
        const authors = (p.authors ?? []).map((a: any) => a.name);
        const arxiv = p.externalIds?.ArXiv ? ` | arXiv:${p.externalIds.ArXiv}` : "";
        const abstract = p.abstract
          ? `\n   ${String(p.abstract).slice(0, 400)}${p.abstract.length > 400 ? "…" : ""}`
          : "";
        return (
          `${i + 1}. ${p.title} (${p.year ?? "n.d."})\n` +
          `   ${authors.slice(0, 6).join(", ")}${authors.length > 6 ? " et al." : ""}\n` +
          `   ${p.citationCount ?? 0} citations | ${p.venue || "unknown venue"}${arxiv}` +
          abstract
        );
      })
      .join("\n\n");
  },
};
