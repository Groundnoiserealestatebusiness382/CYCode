import path from "node:path";
import { createRuntime } from "./runtime.js";
import { runExec } from "./exec.js";
import { startGui } from "./gui/server.js";
import { startRepl, type ArbiterRef } from "./tui/app.js";
import { SessionStore } from "./session/store.js";
import { PERMISSION_MODES, type PermissionMode } from "./permissions/permissions.js";

const VERSION = "0.1.0";

const USAGE = `cycode — an open-source terminal coding agent for AI research

Usage:
  cycode [prompt]              interactive REPL (optional initial prompt)
  cycode exec <prompt>         non-interactive: run one task and exit
  cycode ui                    local web GUI (http://127.0.0.1:7833)
  cycode sessions              list saved sessions for this project

Options:
  -m, --model <spec>           model as provider/model-id (e.g. anthropic/claude-sonnet-4-6)
      --mode <mode>            permission mode: ${PERMISSION_MODES.join(" | ")}
  -c, --continue               resume the most recent session
      --resume <id>            resume a specific session
      --cwd <dir>              project directory (default: current directory)
      --json                   (exec) emit JSONL events on stdout
      --max-steps <n>          (exec) cap model/tool round-trips (default 60)
      --port <n>               (ui) port to listen on (default 7833)
      --no-open                (ui) don't open the browser automatically
  -v, --version                print version
  -h, --help                   show this help

Environment:
  ANTHROPIC_API_KEY / OPENAI_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY / OPENROUTER_API_KEY
  Config: ~/.cycode/config.json and <project>/.cycode/config.json
`;

interface ParsedArgs {
  command: "repl" | "exec" | "ui" | "sessions";
  prompt?: string;
  model?: string;
  mode?: PermissionMode;
  continueSession: boolean;
  resumeId?: string;
  cwd: string;
  json: boolean;
  maxSteps?: number;
  port: number;
  open: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    command: "repl",
    continueSession: false,
    cwd: process.cwd(),
    json: false,
    port: 7833,
    open: true,
  };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Missing value for ${a}`);
      return v;
    };
    switch (a) {
      case "-h":
      case "--help":
        process.stdout.write(USAGE);
        process.exit(0);
        break;
      case "-v":
      case "--version":
        process.stdout.write(`cycode ${VERSION}\n`);
        process.exit(0);
        break;
      case "-m":
      case "--model":
        args.model = next();
        break;
      case "--mode": {
        const mode = next() as PermissionMode;
        if (!PERMISSION_MODES.includes(mode)) {
          throw new Error(`Invalid mode "${mode}" (valid: ${PERMISSION_MODES.join(", ")})`);
        }
        args.mode = mode;
        break;
      }
      case "-c":
      case "--continue":
        args.continueSession = true;
        break;
      case "--resume":
        args.resumeId = next();
        break;
      case "--cwd":
        args.cwd = path.resolve(next());
        break;
      case "--json":
        args.json = true;
        break;
      case "--max-steps":
        args.maxSteps = Number(next());
        break;
      case "--port":
        args.port = Number(next());
        break;
      case "--no-open":
        args.open = false;
        break;
      default:
        if (a.startsWith("-")) throw new Error(`Unknown option: ${a} (see --help)`);
        positional.push(a);
    }
  }
  const first = positional[0];
  if (first === "exec" || first === "ui" || first === "sessions") {
    args.command = first;
    positional.shift();
  }
  if (positional.length > 0) args.prompt = positional.join(" ");
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === "sessions") {
    const sessions = SessionStore.list(args.cwd);
    if (sessions.length === 0) {
      process.stdout.write("No sessions for this project\n");
      return;
    }
    for (const s of sessions) {
      process.stdout.write(`${s.id}  ${s.createdAt}  ${s.model}\n`);
    }
    return;
  }

  if (args.command === "exec") {
    if (!args.prompt) throw new Error('exec requires a prompt: cycode exec "..."');
    const code = await runExec({
      prompt: args.prompt,
      cwd: args.cwd,
      modelSpec: args.model,
      mode: args.mode,
      json: args.json,
      maxSteps: args.maxSteps,
      continueSession: args.continueSession,
    });
    process.exit(code);
  }

  if (args.command === "ui") {
    await startGui({
      cwd: args.cwd,
      modelSpec: args.model,
      mode: args.mode,
      port: args.port,
      continueSession: args.continueSession,
      openBrowser: args.open,
    });
    return; // server keeps the process alive
  }

  // Interactive REPL
  const arbiterRef: ArbiterRef = { current: null };
  const initialNotices: string[] = [];
  const runtime = await createRuntime({
    cwd: args.cwd,
    modelSpec: args.model,
    mode: args.mode,
    continueSession: args.continueSession,
    resumeId: args.resumeId,
    arbiter: (req) =>
      arbiterRef.current
        ? arbiterRef.current(req)
        : Promise.resolve({ behavior: "deny" as const, message: "UI not ready" }),
    onNotice: (m) => initialNotices.push(m),
  });
  initialNotices.push(
    `CYCode v${VERSION} · ${runtime.modelSpec} · ${args.mode ?? "default"} mode · /help for commands`,
  );
  startRepl({
    runtime,
    arbiterRef,
    initialNotices,
    initialPrompt: args.prompt,
  });
}

main().catch((err) => {
  process.stderr.write(`cycode: ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
