# Security Policy

## Reporting a vulnerability

Please report vulnerabilities privately via
[GitHub Security Advisories](https://github.com/ChaoYue0307/CYCode/security/advisories/new)
— do not open a public issue. You can expect an initial response within a week.

## Threat model notes

CYCode is an agent that **executes commands and edits files on your machine** under a
permission system. Things to understand before filing:

- `bypass` mode and broad allow-rules intentionally remove guardrails; damage done by a
  model under permissions you granted is not a vulnerability by itself. Escaping the
  permission gate (e.g., a non-read-only action executing without a gate check, or a
  deny rule being bypassed) **is** — please report it.
- Prompt injection via fetched web pages, papers, or MCP tool output is an inherent
  risk of agentic tools. The permission gate is the mitigation; reports that
  demonstrate gate bypass through injected content are very welcome.
- When the sandbox is enabled (`--sandbox`), shell commands writing outside the
  project directory + tmp, or the sandbox silently degrading to unconfined
  execution instead of failing closed, are vulnerabilities — please report them.
- The web GUI binds to `127.0.0.1` only and must stay that way; anything that exposes
  it to the network is a vulnerability.
- API keys are read from environment variables and never written to disk by CYCode.

## Supported versions

Only the latest release receives security fixes.
