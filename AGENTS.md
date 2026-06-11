# CYCode — agent notes

TypeScript ESM project, Node >= 20. npm (not pnpm). Build: tsup. Test: vitest. Entry: `src/cli.ts`.

- One `Tool` interface (`src/tools/types.ts`) for everything — core, research, and MCP tools all flow through the same permission gate.
- The agent loop (`src/agent/loop.ts`) executes tool calls manually (no AI SDK auto-execute) so permissions stay in one place.
- Keep the core lean; research features live in `src/tools/research/` and `skills/`.
- All code is written fresh. Design patterns may be borrowed from Codex CLI (Apache-2.0) and OpenCode (MIT); never copy code from Claude Code (proprietary).
- Commits: author identity `ChaoYue0307 <hechaoyue0307@gmail.com>` only, no Co-Authored-By trailers.

Run checks before committing: `npm run typecheck && npm test`.
