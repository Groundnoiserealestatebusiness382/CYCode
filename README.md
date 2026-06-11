# CYCode

> An open-source terminal coding agent built for **AI research** — papers, experiments, notebooks, LaTeX, and code.

CYCode is a lean agent harness in the spirit of Claude Code, Codex CLI, and OpenCode, written from scratch in TypeScript and specialized for research workflows. It deliberately combines the best ideas from each: Claude Code's permission modes, context files, and skills; Codex CLI's resumable JSONL sessions and non-interactive `exec` mode; OpenCode's provider-agnostic model layer.

**Status: early development — not yet released.**

## Why CYCode

General coding agents stop at code. Research work is code **plus** literature, experiments, notebooks, and papers:

- **Papers** — search arXiv and Semantic Scholar, read PDFs, produce literature reviews with BibTeX.
- **Experiments** — launch training runs in the background, monitor logs, parse metrics, report when runs finish or diverge.
- **Notebooks** — first-class `.ipynb` read/edit/execute.
- **LaTeX** — build papers, parse compiler errors, manage bibliographies.
- **Code** — the full coding-agent toolkit: read/edit/search files, run commands, fix bugs, with permission gating.
- **Loops** — `cycode exec` runs headless with JSON output, designed to be driven by recurring agent loops and CI.

## Install

```sh
npm install -g cycode   # not yet published
cycode
```

## Quickstart

```sh
export ANTHROPIC_API_KEY=...   # or OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, ...
cd your-project
cycode                          # interactive REPL
cycode exec "summarize recent papers on test-time compute" --json
cycode -c                       # continue last session
```

## Architecture

```
src/
├── agent/        # turn loop, compaction, subagents
├── provider/     # multi-provider model registry (Vercel AI SDK)
├── tools/core    # read, write, edit, glob, grep, bash, web_fetch, todo
├── tools/research# arxiv, papers, notebooks, experiments, latex
├── permissions/  # modes + allowlist rules + interactive prompts
├── session/      # JSONL rollouts, resume
├── context/      # AGENTS.md / CLAUDE.md discovery
├── skills/       # markdown skills + slash commands
├── mcp/          # MCP client (stdio + HTTP)
└── tui/          # Ink terminal UI
```

## License

[MIT](LICENSE)
