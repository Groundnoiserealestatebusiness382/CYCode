---
name: paper-draft
description: Draft or revise a LaTeX paper section grounded in the project's results and real citations.
---

Help draft the paper section described in the user request.

1. Ground yourself first: read the existing LaTeX sources (`glob` for `**/*.tex`,
   then `read` the main file and the target section) and any results the section
   must reference (logs via `exp_status`, result tables, notebooks via `notebook_read`).
2. If the section needs citations, find real ones with `arxiv_search` /
   `semantic_scholar` and add them to the project's `.bib` file (check for existing
   entries first to avoid duplicate keys). Never cite from memory.
3. Write in standard ML-paper register: precise, direct, no hype words
   ("novel", "remarkable"). Numbers must come from actual project artifacts —
   if a number is missing, insert `\\todo{...}` rather than inventing it.
4. Match the existing document's conventions: macros, citation style
   (`\\citep`/`\\citet`), section depth, tense.
5. After editing, run `latex_build` and fix any errors it reports until the build
   is clean.
