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

  // shell hooks around tool execution (see "Hooks" below)
  "hooks": {
    "preToolUse":  [{ "match": "bash(git push*)", "command": "./scripts/guard-push.sh" }],
    "postToolUse": [{ "match": "edit", "command": "./scripts/style-check.sh" }]
  },

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
| `TAVILY_API_KEY` | enables the `web_search` tool (absent → tool not registered) |
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

## Hooks

Hooks are shell commands that run around tool execution — deterministic guardrails
the model can't talk its way past. `match` uses the same pattern grammar as
permission rules, against the same per-call keys.

- **`preToolUse`** runs before the tool. **Exit code 2 blocks the call**; the hook's
  output is returned to the model as the error. Any other non-zero exit is a
  warning notice and the call proceeds.
- **`postToolUse`** runs after a successful call. **Exit code 2 appends the hook's
  output to the tool result** as feedback the model must address. Other non-zero
  exits are warnings.

Hooks receive the call as environment variables: `CYCODE_TOOL_NAME`,
`CYCODE_TOOL_KEY` (e.g. `bash(git push)`), `CYCODE_TOOL_INPUT` (JSON), and — for
postToolUse — `CYCODE_TOOL_OUTPUT` (first 8 KB). Default timeout 30 s
(`timeoutMs` to change). User and project hook lists concatenate.

```jsonc
// block force-pushes no matter what the model decides
{ "match": "bash(git push*)",
  "command": "echo \\"$CYCODE_TOOL_INPUT\\" | grep -q -- --force && { echo 'no force pushes' >&2; exit 2; } || exit 0" }
```

## Sandbox

Opt-in OS-level confinement for shell commands (`bash` and `exp_run`):

```jsonc
{ "sandbox": { "bash": true, "allowNetwork": true } }
```

or per-invocation with `--sandbox` (works with `cycode`, `cycode ui`, and
`cycode exec`). When enabled, commands can **read anything but write only inside
the project directory and tmp** — enforced by the kernel, not by prompts:

- **macOS**: Seatbelt (`sandbox-exec`) with a workspace-write profile.
- **Linux**: bubblewrap (`bwrap`); install it or the sandbox **fails closed**
  (the command errors rather than running unconfined).
- `allowNetwork: false` additionally cuts off outbound network.

The layered model for unattended runs: permission rules decide *which* commands
run, hooks veto specific calls deterministically, and the sandbox bounds what any
command can touch even if the first two layers were misconfigured. For full
autonomy inside a write-fence: `cycode exec "..." --mode bypass --sandbox`.

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
