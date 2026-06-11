# Skills

Skills are reusable prompts — markdown files with YAML frontmatter, the same shape
Claude Code uses, so existing skills mostly port over unchanged. Prefer a skill over a
new tool whenever the capability is "a procedure the model should follow" rather than
"a new ability it doesn't have."

## Format

```
<project>/.cycode/skills/my-skill/SKILL.md
```

```markdown
---
name: my-skill
description: One line shown in /skills and the system prompt.
---

Instructions the agent follows when the user types /my-skill ...
Write them like you'd brief a careful colleague: ordered steps,
what tools to use, what the output must contain, what never to do.
```

Plain `<name>.md` files directly in a skills directory also work.

## Locations and precedence

Later sources override earlier ones by `name`:

1. **built-in** — shipped in the package's `skills/`
2. **user** — `~/.cycode/skills/`
3. **project** — `<project>/.cycode/skills/` (commit these; they're team knowledge)

## Invocation

- REPL / GUI: `/my-skill optional arguments`
- Headless: `cycode exec "/my-skill arguments" --json`

The skill body is injected into the turn wrapped in a `<skill>` block, followed by
`User request: <arguments>`. Skill names also appear in the system prompt so the model
knows what's available.

## Built-ins

| Skill | What it does |
|---|---|
| `/lit-review <topic>` | multi-query arXiv + Semantic Scholar survey → structured notes, comparison table, BibTeX |
| `/watch-run [id]` | check experiment runs: progress, metric trends, divergence/anomaly flags |
| `/paper-draft <section>` | draft/revise a LaTeX section grounded in project artifacts and real citations, then build clean |
| `/repro-check` | audit the repo for reproducibility gaps (seeds, pins, configs, data provenance) → ✅/⚠️/❌ checklist |

## Writing good skills

- **Order the steps** and name the exact tools (`arxiv_search`, then `paper_read`…).
- **Specify the artifact**: file name, required sections, format of the output.
- **State the invariants**: "never invent citations", "only report numbers from tool results".
- **Bound the work**: "6–12 papers", "first ~8 pages" — skills run inside a finite turn.
- Keep one skill per job; compose by telling the user to run another skill next.
