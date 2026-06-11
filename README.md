# CYCode

> An open-source terminal coding agent built for **AI research** — papers, experiments, notebooks, LaTeX, and code.

CYCode is a lean agent harness (~5K lines of TypeScript) in the spirit of Claude Code, Codex CLI, and OpenCode, written from scratch and specialized for research workflows. It deliberately combines the best ideas from each lineage:

| Lineage | What CYCode adopts |
|---|---|
| Claude Code (design patterns) | permission modes, `AGENTS.md` context files, markdown skills with slash commands, todo planning, explore subagents, context compaction |
| Codex CLI (Apache-2.0) | resumable JSONL session rollouts, headless `cycode exec --json` for CI and agent loops |
| OpenCode (MIT) | provider-agnostic model layer (Anthropic, OpenAI, Google, Ollama, OpenRouter, any OpenAI-compatible endpoint), post-edit diagnostics fed back to the model |

All code is original; no proprietary source was used.

## Why CYCode

General coding agents stop at code. Research work is code **plus** literature, experiments, notebooks, and papers — so those are first-class tools, not afterthoughts:

- **Papers** — `arxiv_search`, `paper_read` (PDF → text with page ranges), `semantic_scholar` (search + references). `/lit-review` produces structured notes with BibTeX.
- **Experiments** — `exp_run` launches training scripts detached in the background; `exp_status` tails logs and extracts metrics by regex; `/watch-run` reports trends and divergence.
- **Notebooks** — `notebook_read` / `notebook_edit` operate on `.ipynb` cells directly.
- **LaTeX** — `latex_build` compiles via latexmk/pdflatex and returns structured `file:line` errors. `/paper-draft` writes grounded in your actual results and real citations.
- **Code** — the full coding toolkit: `read`, `write`, `edit`, `glob`, `grep`, `bash`, `web_fetch`, with permission gating on everything.
- **Loops** — `cycode exec "task" --json` emits machine-readable events and meaningful exit codes, designed to be driven by recurring agent loops, cron, and CI.

## Install

```sh
git clone https://github.com/ChaoYue0307/CYCode && cd CYCode
npm install && npm run build && npm link   # then: cycode
# (npm package publication is planned; not yet on the registry)
```

Requires Node ≥ 20. Optional extras it will use when present: `rg` (faster grep), `latexmk`, `jupyter`.

## Quickstart

```sh
export ANTHROPIC_API_KEY=...   # or OPENAI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY / OPENROUTER_API_KEY
cd your-project

cycode                         # interactive terminal REPL
cycode ui                      # local web GUI at http://127.0.0.1:7833
cycode -c                      # continue the most recent session
cycode exec "run the test suite and fix any failures" --mode acceptEdits
cycode exec "/watch-run" --json   # headless skill run with JSONL event output
```

In the REPL: `/help`, `/mode`, `/compact`, `/skills`, `esc` interrupts, and any `/skill-name` runs a skill.

### Three interfaces, one agent

- **`cycode`** — Ink-based terminal REPL with streaming output, tool-call log, permission prompts, and a live todo list.
- **`cycode ui`** — local web GUI (dark theme, tool-call cards, permission dialogs, task sidebar). Bound to `127.0.0.1` only; no frontend build, works offline.
- **`cycode exec`** — non-interactive single turn for scripts and loops. Anything not pre-authorized by mode or allow-rules is denied rather than prompted.

## Models

Specify models as `provider/model-id`:

```sh
cycode --model anthropic/claude-sonnet-4-6
cycode --model openai/gpt-5.1
cycode --model google/gemini-2.5-pro
cycode --model ollama/llama3.3            # local, via http://localhost:11434/v1
cycode --model openrouter/anthropic/claude-sonnet-4-6
```

Any OpenAI-compatible endpoint (vLLM, llama.cpp server, litellm proxy) can be added under `providers` in config.

## Permissions

Read-only tools run freely; everything else passes a gate. Modes: `default` (ask), `acceptEdits` (file edits auto-approved, commands still ask), `plan` (read-only), `bypass` (everything approved — use with care).

Allow/deny rules use Claude Code-style patterns, and "always allow" answers are persisted per-project:

```jsonc
// .cycode/config.json
{
  "permissions": {
    "allow": ["bash(git *)", "bash(npm run *)", "latex_build"],
    "deny": ["bash(rm -rf *)"]
  }
}
```

## Configuration

`~/.cycode/config.json` (user) merged with `<project>/.cycode/config.json` (project wins; permission lists concatenate):

```jsonc
{
  "model": "anthropic/claude-sonnet-4-6",
  "smallModel": "anthropic/claude-haiku-4-5-20251001",  // compaction + subagents
  "permissions": { "allow": [], "deny": [] },
  "diagnostics": { "command": "npm run typecheck" },     // run after edits; failures fed back to the model
  "mcpServers": {
    "github": { "command": "gh-mcp-server" },
    "docs": { "url": "http://localhost:3845/mcp" }
  },
  "providers": {
    "vllm": { "baseURL": "http://localhost:8000/v1", "apiKeyEnv": "VLLM_KEY" }
  }
}
```

Project memory: CYCode reads `AGENTS.md` (or `CLAUDE.md`) from the project root and `~/.cycode/AGENTS.md` into every session.

## Skills

Skills are markdown files with YAML frontmatter — the same shape Claude Code uses — loaded from the package (`built-in`), `~/.cycode/skills/`, and `<project>/.cycode/skills/` (later overrides earlier). Invoke with `/name args`.

Built-ins: `/lit-review`, `/watch-run`, `/paper-draft`, `/repro-check`.

```
.cycode/skills/my-skill/SKILL.md
---
name: my-skill
description: One-line description shown in /skills and the system prompt.
---
Instructions the agent follows when you type /my-skill ...
```

## Sessions

Every interactive session is an append-only JSONL rollout under `~/.cycode/sessions/<project>/`. `cycode -c` continues the latest, `cycode --resume <id>` a specific one, `cycode sessions` lists them. Long conversations auto-compact at ~80% of the context window (summarized with `smallModel`).

## Driving CYCode from a loop

```sh
# process a task list, one isolated agent run per line
while read -r task; do
  cycode exec "$task" --mode acceptEdits --json >> runs.jsonl || echo "FAILED: $task"
done < tasks.txt
```

Each JSON line is an agent event (`tool-start`, `text-end`, `turn-end`, …) ending with `{"type":"result","text":...,"exitCode":...}` — everything a supervising loop needs to verify, retry, or escalate.

## Architecture

```
src/
├── agent/        # turn loop, compaction, explore subagent, event bus
├── provider/     # model registry (Vercel AI SDK) + context-window catalog
├── tools/core/   # read, write, edit, glob, grep, bash, web_fetch, todo
├── tools/research/ # arxiv, papers, semantic scholar, notebooks, experiments, latex
├── permissions/  # modes + rule matching + arbiter interface
├── session/      # JSONL rollouts, resume, compaction replay
├── context/      # AGENTS.md discovery + system prompt assembly
├── skills/       # markdown skills + slash commands
├── mcp/          # MCP client (stdio + streamable HTTP)
├── tui/          # Ink terminal UI
├── gui/          # local web GUI (SSE + embedded single-file page)
└── cli.ts        # repl | exec | ui | sessions
```

One `Tool` interface; every execution — core, research, or MCP — flows through the same permission gate. The model never executes tools directly: the loop receives tool calls, gates them, runs them, and feeds results back.

## Development

```sh
npm install
npm run dev          # tsx src/cli.ts
npm test             # vitest (51 tests, no API key needed — mock model)
npm run typecheck && npm run lint && npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Acknowledgments

CYCode stands on ideas from [Claude Code](https://github.com/anthropics/claude-code) (Anthropic), [Codex CLI](https://github.com/openai/codex) (OpenAI, Apache-2.0), and [OpenCode](https://github.com/sst/opencode) (SST, MIT). Built with the [Vercel AI SDK](https://github.com/vercel/ai), [Ink](https://github.com/vadimdemedes/ink), and the [MCP SDK](https://github.com/modelcontextprotocol/typescript-sdk).

## License

[MIT](LICENSE) © ChaoYue0307
