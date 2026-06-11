# Contributing to CYCode

Thanks for your interest! CYCode aims to stay a **lean** harness — the bar for adding
core complexity is high; the bar for research tools and skills is lower.

## Setup

```sh
git clone https://github.com/ChaoYue0307/CYCode && cd CYCode
npm install
npm run dev        # run from source
npm test           # vitest — no API keys needed (mock model)
```

Before opening a PR: `npm run typecheck && npm run lint && npm test`.

## Where things go

- New **tools**: `src/tools/research/` (or `core/` only if universally useful).
  Implement the `CycodeTool` interface in `src/tools/types.ts`, register it in the
  folder's `index.ts`, and add a unit test with a tmpdir fixture. Mark `readOnly`
  honestly — it controls permission gating.
- New **skills**: a folder in `skills/<name>/SKILL.md` with `name` + `description`
  frontmatter. Skills are prompts, not code — prefer them over tools when possible.
- Loop/agent changes: `src/agent/loop.ts` is the most sensitive file in the repo;
  include a `test/loop.test.ts` case using the mock model for any behavior change.

## Ground rules

- All code must be original or from compatibly-licensed sources (Apache-2.0/MIT
  with attribution). Never port code from Claude Code or other proprietary sources;
  design patterns are fine, code is not.
- No new runtime dependencies without discussion in an issue first.
- Keep tool output plain text and bounded (truncate long output) — it goes straight
  into model context.
