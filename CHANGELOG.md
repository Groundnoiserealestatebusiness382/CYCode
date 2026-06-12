# Changelog

All notable changes to CYCode are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[SemVer](https://semver.org/).

## [Unreleased]

## [0.4.0] - 2026-06-12

### Added
- **wandb integration**: `exp_status` now lists local `wandb/run-*` directories
  with their numeric summary metrics (from `wandb-summary.json`) — offline,
  no API key required. `/watch-run` picks them up automatically.

## [0.3.0] - 2026-06-12

### Added
- **OS-level sandbox** for shell commands (`bash`, `exp_run`): writes confined to
  the project directory + tmp, enforced by the kernel. macOS via Seatbelt
  (`sandbox-exec`), Linux via bubblewrap; **fails closed** when the backend is
  unavailable. Enable with `"sandbox": { "bash": true }` in config or the
  `--sandbox` flag on any command. `allowNetwork: false` additionally cuts off
  outbound network. Combined with permission rules and hooks this completes the
  layered model for unattended loops: `cycode exec --mode bypass --sandbox`.

## [0.2.0] - 2026-06-11

### Added
- **Hooks**: `preToolUse` / `postToolUse` shell hooks in config — deterministic
  guardrails around tool execution. Exit code 2 blocks a call (pre) or feeds the
  hook's output back to the model (post); hooks receive the call via
  `CYCODE_TOOL_*` environment variables.
- **Runtime model switching**: `/model <spec>` now switches mid-session in the
  REPL and the GUI (no restart).
- **Parallel tool execution**: batches consisting only of read-only tool calls
  (multiple greps, parallel `explore` subagents) run concurrently.
- **Session token tracking**: cumulative input/output tokens shown in the TUI
  status line, the GUI header, and exec's stderr summary.
- **`web_search` tool** (Tavily), registered only when `TAVILY_API_KEY` is set.

### Changed
- New brand identity: hexagonal-C mark with a terminal cursor, applied across the
  logo, app icon, README figures, and the GUI (favicon + header).
- Banner, terminal, and architecture figures redesigned: tighter typography,
  window shadow and syntax-colored strings in the session mockup, rounded
  connector elbows and a stricter grid in the architecture diagram.
- `assets/logo.svg` (standalone mark) and `assets/icon.svg` (app icon, ready for
  the planned desktop app) added.
- Version is now a single constant (`src/version.ts`) shared by the CLI and the
  MCP client identity.

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

[Unreleased]: https://github.com/ChaoYue0307/CYCode/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/ChaoYue0307/CYCode/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/ChaoYue0307/CYCode/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ChaoYue0307/CYCode/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ChaoYue0307/CYCode/releases/tag/v0.1.0
