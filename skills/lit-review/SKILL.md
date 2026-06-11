---
name: lit-review
description: Survey recent papers on a topic and produce structured literature notes with BibTeX.
---

Produce a literature review on the topic in the user request. Work in this order:

1. Search broadly: run 2–3 `arxiv_search` queries with different phrasings (use field
   prefixes like `ti:` and `cat:` when helpful) and one `semantic_scholar` search to
   catch non-arXiv venues. Prefer `sort_by: submittedDate` for "recent work" requests.
2. Select the 6–12 most relevant papers. Favor: directly on-topic > influential
   (citations) > recent. Note disagreements and competing approaches, not just one line.
3. For the 3–5 most central papers, read the abstract/intro/method with `paper_read`
   (first ~8 pages) to capture the actual contribution, not just the abstract.
4. Write the review to `lit-review-<topic-slug>.md` in the working directory:
   - **Overview** — 2-3 paragraphs: the problem, main lines of attack, open questions.
   - **Paper notes** — per paper: full citation with arXiv id, 3-5 sentence summary
     (contribution, method, key result, limitation), and how it relates to the others.
   - **Comparison table** — papers × (approach, data/benchmark, key number, year).
   - **Gaps and directions** — what nobody has done yet; concrete follow-up ideas.
5. Append a valid BibTeX block covering every cited paper (use arXiv eprint entries).

Rules: never invent papers, results, or numbers — every claim must come from a tool
result. If two sources conflict, say so. Cite by title + arXiv id throughout.
