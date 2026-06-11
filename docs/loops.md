# Driving CYCode from loops

`cycode exec` is the loop-engineering surface: one self-contained agent turn, no
prompts, machine-readable output, meaningful exit codes. A supervising loop —
shell script, cron job, CI stage, or another agent — discovers work, hands a task to
`cycode exec`, verifies the result, records state, and decides what happens next.

## Contract

```sh
cycode exec "<prompt or /skill>" [--json] [--mode <mode>] [--model <spec>] [--max-steps N] [-c]
```

- **Permissions**: anything not pre-approved by mode or allow-rules is **denied, not
  prompted** — the run continues and the model is told why. Pick the authority level
  per loop: `--mode acceptEdits` + explicit `bash(...)` allow rules is the sane default;
  `--mode bypass` only inside a sandbox.
- **Exit code**: `0` if the turn completed, `1` on fatal error. With `--json`, the last
  stdout line is always `{"type":"result","text":"...","exitCode":0|1}`.
- **`--max-steps`** (default 60) caps model/tool round-trips per run.
- **`-c`** continues the project's latest session for stateful multi-run workflows;
  omit it for isolated runs.

## Event stream (`--json`)

One JSON object per stdout line, each with a `ts` timestamp:

| `type` | Payload highlights |
|---|---|
| `turn-start` / `turn-end` | `usage.inputTokens` on end |
| `text-delta` / `text-end` | streamed assistant text / complete message |
| `tool-start` | `toolName`, `description`, `input` |
| `tool-end` | `ok`, `output`, `durationMs` |
| `tool-denied` | `reason` (rule or non-interactive denial) |
| `todos` | current plan state |
| `compaction`, `notice`, `error` | housekeeping |
| `result` | final: `text`, `exitCode` (always last) |

Without `--json`: assistant text streams to **stdout**; tool activity and notices go to
**stderr** — so `cycode exec "..." > answer.txt` captures just the answer.

## Patterns

**Task queue** (one isolated run per task, failures collected):
see [`examples/task-loop.sh`](../examples/task-loop.sh).

**Experiment babysitter** (cron or CI schedule):

```sh
*/30 * * * * cd ~/proj && cycode exec "/watch-run" >> watch.log 2>&1
```

**Gate on verification** — trust exit codes and your own checks, not the model's claim:

```sh
cycode exec "fix the failing test" --mode acceptEdits --json > run.jsonl
npm test || cycode exec "tests still failing, keep fixing" -c --mode acceptEdits
```

**Fan-out research** (independent surveys in parallel):

```sh
printf '%s\n' "diffusion distillation" "kv-cache compression" |
  xargs -P 2 -I{} cycode exec "/lit-review {}" --json
```

## Loop design checklist

- Define **done** as something the loop can verify (tests pass, file exists, build clean).
- Always bound: `--max-steps`, task timeouts, retry budgets.
- Persist `runs.jsonl` — the event log is your audit trail when a loop misbehaves.
- Keep loop authority minimal: allow-rules for exactly the commands the job needs.
