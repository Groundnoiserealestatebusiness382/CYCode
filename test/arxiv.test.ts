import { describe, expect, it } from "vitest";
import { parseArxivAtom } from "../src/tools/research/arxiv.js";

const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2401.12345v2</id>
    <title>Scaling Laws for
      Test-Time Compute</title>
    <summary>  We study how   compute at inference time scales. </summary>
    <published>2024-01-23T18:00:00Z</published>
    <author><name>Ada Lovelace</name></author>
    <author><name>Alan Turing</name></author>
    <category term="cs.LG" scheme="http://arxiv.org/schemas/atom"/>
    <category term="cs.AI" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
  <entry>
    <id>http://arxiv.org/abs/2502.00001v1</id>
    <title>A Single-Author Paper</title>
    <summary>One author only.</summary>
    <published>2025-02-01T00:00:00Z</published>
    <author><name>Solo Researcher</name></author>
    <category term="stat.ML" scheme="http://arxiv.org/schemas/atom"/>
  </entry>
</feed>`;

describe("parseArxivAtom", () => {
  it("parses entries with normalized whitespace", () => {
    const entries = parseArxivAtom(FIXTURE);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      id: "2401.12345v2",
      title: "Scaling Laws for Test-Time Compute",
      authors: ["Ada Lovelace", "Alan Turing"],
      published: "2024-01-23",
      categories: ["cs.LG", "cs.AI"],
      pdf_url: "https://arxiv.org/pdf/2401.12345v2",
    });
    expect(entries[0]!.summary).toBe("We study how compute at inference time scales.");
  });

  it("handles single author and single category (non-array XML)", () => {
    const entries = parseArxivAtom(FIXTURE);
    expect(entries[1]!.authors).toEqual(["Solo Researcher"]);
    expect(entries[1]!.categories).toEqual(["stat.ML"]);
  });

  it("returns empty for a feed without entries", () => {
    expect(parseArxivAtom('<feed xmlns="http://www.w3.org/2005/Atom"></feed>')).toEqual([]);
  });
});
