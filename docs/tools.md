# Tool reference

Every tool — core, research, or MCP — implements one interface and flows through the
same permission gate. **Read-only** tools execute without prompting (deny rules still
apply); all others require approval via mode, allow-rule, or interactive prompt.

## Core

| Tool | Read-only | Description | Key inputs |
|---|---|---|---|
| `read` | ✅ | Read a file as numbered lines (max 2000/call, use `offset`/`limit`) | `file_path`, `offset?`, `limit?` |
| `write` | ❌ | Create/overwrite a file, creating parent dirs | `file_path`, `content` |
| `edit` | ❌ | Exact-string replacement; `old_string` must be unique unless `replace_all` | `file_path`, `old_string`, `new_string`, `replace_all?` |
| `glob` | ✅ | Find files by pattern, newest first (max 200) | `pattern`, `path?` |
| `grep` | ✅ | Regex search returning `file:line:text` (ripgrep when available, JS fallback) | `pattern`, `path?`, `glob?`, `ignore_case?` |
| `bash` | ❌ | Run a shell command from the project dir; combined output, middle-truncated at 30 KB | `command`, `timeout_ms?` (default 120s, max 600s) |
| `web_fetch` | ✅ | Fetch a URL; HTML converted to text, 20 KB cap | `url` |
| `todo_write` | ✅ | Replace the session todo list (rendered live in the TUI/GUI) | `todos[]` |
| `explore` | ✅ | Spawn a read-only subagent for broad investigation; only its final report returns | `task` |

After `write`, `edit`, and `notebook_edit` succeed, the configured
[`diagnostics.command`](configuration.md) runs; non-zero output is appended to the tool
result so the model can self-correct immediately.

## Research

| Tool | Read-only | Description | Key inputs |
|---|---|---|---|
| `arxiv_search` | ✅ | arXiv API search; supports field prefixes (`ti:`, `au:`, `cat:`) | `query`, `max_results?` (≤50), `sort_by?` |
| `paper_read` | ✅ | PDF → text from an arXiv id, URL, or local path; cached in `~/.cycode/papers/` | `source`, `start_page?`, `end_page?` |
| `semantic_scholar` | ✅ | Keyword search, or a paper's references via `paper_id` (arXiv:/DOI/S2). Uses `SEMANTIC_SCHOLAR_API_KEY` if set | `query?`, `paper_id?`, `limit?` |
| `notebook_read` | ✅ | All `.ipynb` cells with indices, sources, and truncated outputs | `path`, `include_outputs?` |
| `notebook_edit` | ❌ | Replace/insert/delete/append a cell by index; edited code cells get outputs cleared | `path`, `mode`, `index?`, `source?`, `cell_type?` |
| `exp_run` | ❌ | Launch a command detached in the background; log → `.cycode/runs/<id>.log` | `command`, `name?` |
| `exp_status` | ✅ | List runs, or tail one run's log with optional `metric_regex` extraction | `id?`, `tail_lines?`, `metric_regex?` |
| `exp_stop` | ❌ | SIGTERM a run's process group | `id` |
| `latex_build` | ❌ | Build to PDF via latexmk (engine fallback); structured `file:line` errors | `main?`, `dir?`, `engine?` |

Notebook execution is intentionally left to `bash`
(`jupyter nbconvert --to notebook --execute --inplace nb.ipynb`) so it goes through
command permissions like any other code execution.

## MCP tools

Servers declared under `mcpServers` in [config](configuration.md) are connected at
startup; their tools appear as `mcp__<server>__<tool>`. A tool is treated as read-only
only if the server sets the `readOnlyHint` annotation. Connection failures are reported
as notices, never fatal.

## Permission keys

Rules match against per-call keys:

| Tool | Key example |
|---|---|
| `bash` | `bash(git status)` |
| `write` / `edit` | `write(src/x.ts)`, `edit(src/x.ts)` |
| `notebook_edit` | `notebook_edit(nb.ipynb)` |
| `exp_run` / `exp_stop` | `exp_run(python train.py)`, `exp_stop(<id>)` |
| `latex_build` | `latex_build(main.tex)` |
| everything else | the tool name |
