import { z } from "zod";
import type { CycodeTool } from "../types.js";

/**
 * Web search via the Tavily API. Only registered when TAVILY_API_KEY is set —
 * CYCode never calls third-party services the user hasn't opted into.
 */
export const webSearchTool: CycodeTool<{ query: string; max_results?: number }> = {
  name: "web_search",
  description:
    "Search the web (Tavily). Returns titles, URLs, and content snippets; " +
    "fetch promising results with web_fetch. Good for docs, blog posts, and news " +
    "that arxiv_search/semantic_scholar won't cover.",
  inputSchema: z.object({
    query: z.string(),
    max_results: z.number().int().min(1).max(10).optional(),
  }),
  readOnly: true,
  describeCall: (i) => `web_search(${i.query})`,
  async execute(input, ctx) {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: input.query,
        max_results: input.max_results ?? 6,
        include_answer: false,
      }),
      signal: ctx.abortSignal ?? AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Tavily API returned HTTP ${res.status}`);
    const body = (await res.json()) as {
      results?: { title: string; url: string; content: string }[];
    };
    const results = body.results ?? [];
    if (results.length === 0) return "No results";
    return results
      .map(
        (r, i) =>
          `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.content.slice(0, 400)}${r.content.length > 400 ? "…" : ""}`,
      )
      .join("\n\n");
  },
};

export function webSearchAvailable(): boolean {
  return !!process.env.TAVILY_API_KEY;
}
