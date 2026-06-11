import { z } from "zod";
import type { CycodeTool } from "../types.js";

const MAX_CHARS = 20_000;
const MAX_BYTES = 5 * 1024 * 1024;

/** Crude but dependency-free HTML → text conversion. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const webFetchTool: CycodeTool<{ url: string }> = {
  name: "web_fetch",
  description:
    "Fetch a URL and return its content as text (HTML is converted to plain text). " +
    "Useful for documentation, blog posts, and APIs returning JSON.",
  inputSchema: z.object({
    url: z.string().url(),
  }),
  readOnly: true,
  describeCall: (i) => `web_fetch(${i.url})`,
  async execute(input, ctx) {
    const res = await fetch(input.url, {
      signal: ctx.abortSignal ?? AbortSignal.timeout(30_000),
      headers: { "user-agent": "cycode (+https://github.com/ChaoYue0307/CYCode)" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${input.url}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new Error("Response too large (>5MB)");
    const raw = new TextDecoder().decode(buf);
    const contentType = res.headers.get("content-type") ?? "";
    const text = contentType.includes("html") ? htmlToText(raw) : raw;
    return text.length > MAX_CHARS
      ? text.slice(0, MAX_CHARS) + `\n… [truncated, ${text.length} chars total]`
      : text;
  },
};
