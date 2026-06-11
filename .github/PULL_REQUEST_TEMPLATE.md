## What

<!-- One paragraph: what this changes and why. Link the issue if there is one. -->

## Checklist

- [ ] `npm run typecheck && npm run lint && npm test` pass locally
- [ ] New tools/loop changes have tests (mock model for loop behavior, tmpdir fixtures for tools)
- [ ] Tool output is plain text and bounded (truncated if potentially long)
- [ ] `readOnly` is set honestly on any new tool (it controls permission gating)
- [ ] No new runtime dependencies (or an issue was discussed first)
- [ ] All code is original or from compatibly-licensed (MIT/Apache-2.0) sources
- [ ] Docs updated if behavior changed (`README.md` / `docs/`)
