# Changelog

All notable changes to CYCode are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-06-11

Initial release.

### Added
- Agent core: streaming turn loop with manually-executed tool calls, permission gate,
  context compaction (~80% threshold), abort recovery, event bus.
- Core tools: `read`, `write`, `edit`, `glob`, `grep` (ripgrep + JS fallback), `bash`,
  `web_fetch`, `todo_write`, `explore` subagent.
- Research toolkit: `arxiv_search`, `paper_read`, `semantic_scholar`,
  `notebook_read`/`notebook_edit`, `exp_run`/`exp_status`/`exp_stop`, `latex_build`.
- Built-in skills: `/lit-review`, `/watch-run`, `/paper-draft`, `/repro-check`;
  user/project skill loading with Claude Code-compatible frontmatter.
- Multi-provider models via Vercel AI SDK: Anthropic, OpenAI, Google, Ollama,
  OpenRouter, and arbitrary OpenAI-compatible endpoints.
- Permission system: four modes, allow/deny rules with prefix wildcards, per-project
  persistence of "always allow".
- JSONL session rollouts with `-c` / `--resume` and compaction replay.
- MCP client (stdio + streamable HTTP).
- Three frontends: Ink terminal REPL, local web GUI (`cycode ui`), headless
  `cycode exec --json`.
- GUI: sessions sidebar with one-click resume (transcript replay), markdown
  rendering, live task panel, permission dialogs, auto-opens the browser
  (`--no-open` to disable).
- Standalone binaries for macOS (arm64/x64), Linux (x64/arm64), and Windows (x64),
  compiled with Bun and attached to GitHub Releases — no Node required.
- Post-edit diagnostics command with model feedback.
- 51 vitest tests including mock-model agent-loop integration.

[Unreleased]: https://github.com/ChaoYue0307/CYCode/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ChaoYue0307/CYCode/releases/tag/v0.1.0
