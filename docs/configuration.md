# Configuration

CYCode merges two JSON files; the project file wins on scalars, and permission lists
concatenate:

1. `~/.cycode/config.json` — user defaults (override the location with `$CYCODE_HOME`)
2. `<project>/.cycode/config.json` — per-project settings (commit this to share with collaborators)

```jsonc
{
  // default model as provider/model-id (CLI --model overrides)
  "model": "anthropic/claude-sonnet-4-6",

  // cheaper model for compaction summaries and subagents
  "smallModel": "anthropic/claude-haiku-4-5-20251001",

  "permissions": {
    "allow": ["bash(git *)", "bash(npm run *)", "latex_build"],
    "deny":  ["bash(rm -rf *)"]
  },

  // run after write/edit/notebook_edit; non-zero output is fed back to the model
  "diagnostics": { "command": "npm run typecheck", "timeoutMs": 60000 },

  // MCP servers: stdio (command) or streamable HTTP (url)
  "mcpServers": {
    "github": { "command": "gh-mcp-server", "args": [], "env": {} },
    "docs":   { "url": "http://localhost:3845/mcp" }
  },

  // extra OpenAI-compatible providers, usable as --model vllm/my-model
  "providers": {
    "vllm": { "baseURL": "http://localhost:8000/v1", "apiKeyEnv": "VLLM_API_KEY" }
  },

  // override the context window used for compaction decisions
  "contextWindow": 200000
}
```

## Environment variables

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | `anthropic/*` models (default provider when present) |
| `OPENAI_API_KEY` | `openai/*` models |
| `GOOGLE_GENERATIVE_AI_API_KEY` | `google/*` models |
| `OPENROUTER_API_KEY` | `openrouter/*` models |
| `SEMANTIC_SCHOLAR_API_KEY` | higher rate limits for `semantic_scholar` (optional) |
| `CYCODE_HOME` | relocate config/sessions/papers (default `~/.cycode`) |

## Permission modes

| Mode | File edits | Commands & other tools | Read-only tools |
|---|---|---|---|
| `default` | ask | ask | run freely |
| `acceptEdits` | auto-approve | ask | run freely |
| `plan` | deny | deny | run freely |
| `bypass` | auto-approve | auto-approve | run freely |

Set with `--mode <mode>` or `/mode` in the REPL. **Deny rules always win** — over
read-only status and over `bypass`.

## Rule grammar

```
toolname              matches every call of that tool
toolname(exact arg)   matches one exact argument
toolname(prefix *)    prefix wildcard (the * must be last)
```

The argument is the tool's permission key — the command for `bash`, the file path for
`write`/`edit` (see [tools.md](tools.md)). Answering **a**lways in a permission prompt
appends the exact key to the project config's allow list.

## Context files

CYCode loads into every session's system prompt:

1. `~/.cycode/AGENTS.md` — your global preferences
2. `<project>/AGENTS.md`, falling back to `<project>/CLAUDE.md` — project conventions

Keep them short (truncated at 20 KB): build commands, code style, what to never touch.

## Where things live

| Path | Contents |
|---|---|
| `~/.cycode/sessions/<project>/` | JSONL session rollouts |
| `~/.cycode/papers/` | cached paper PDFs (by URL hash) |
| `~/.cycode/skills/` | your user-level skills |
| `<project>/.cycode/skills/` | project skills |
| `<project>/.cycode/runs/` | experiment logs + index (gitignore this) |
