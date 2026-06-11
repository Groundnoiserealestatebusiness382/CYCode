import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Static, Text, render, useApp, useInput } from "ink";
import TextInput from "ink-text-input";
import path from "node:path";
import type { Runtime } from "../runtime.js";
import type { AgentEvent, TodoItem } from "../agent/events.js";
import {
  PERMISSION_MODES,
  type PermissionDecision,
  type PermissionMode,
  type PermissionRequest,
} from "../permissions/permissions.js";
import { expandSlashCommand } from "../skills/skills.js";

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

type LogItem =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; desc: string; ok: boolean; detail: string; denied?: boolean }
  | { kind: "notice"; text: string }
  | { kind: "error"; text: string };

interface PendingPermission {
  req: PermissionRequest;
  resolve: (d: PermissionDecision) => void;
}

export interface ArbiterRef {
  current: ((req: PermissionRequest) => Promise<PermissionDecision>) | null;
}

const HELP = `Commands:
  /help              show this help
  /model <spec>      switch model (provider/model-id)
  /mode [mode]       show or set permission mode (${PERMISSION_MODES.join(" | ")})
  /compact           summarize the conversation to free context
  /clear             clear the screen log (history is kept)
  /skills            list available skills
  /quit              exit
  esc                interrupt the current turn
Any other /name runs the skill of that name.`;

function firstLines(text: string, n = 2, width = 100): string {
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  const shown = lines
    .slice(0, n)
    .map((l) => (l.length > width ? l.slice(0, width) + "…" : l));
  if (lines.length > n) shown.push(`… (+${lines.length - n} lines)`);
  return shown.join("\n");
}

function App(props: {
  runtime: Runtime;
  arbiterRef: ArbiterRef;
  initialNotices: string[];
  initialPrompt?: string;
}) {
  const { runtime } = props;
  const { exit } = useApp();
  const [log, setLog] = useState<LogItem[]>(
    props.initialNotices.map((text) => ({ kind: "notice", text })),
  );
  const [streamText, setStreamText] = useState("");
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [permission, setPermission] = useState<PendingPermission | null>(null);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<PermissionMode>(runtime.agent.mode);
  const [modelSpec] = useState(runtime.modelSpec);
  const [frame, setFrame] = useState(0);
  const history = useRef<string[]>([]);
  const historyPos = useRef(-1);

  const push = useCallback((item: LogItem) => setLog((l) => [...l, item]), []);
  const callDescriptions = useRef(new Map<string, string>());

  // Wire agent events into UI state.
  useEffect(() => {
    return runtime.bus.on((event: AgentEvent) => {
      switch (event.type) {
        case "text-delta":
          setStreamText((t) => t + event.text);
          break;
        case "text-end":
          setStreamText("");
          push({ kind: "assistant", text: event.text });
          break;
        case "tool-start":
          callDescriptions.current.set(event.callId, event.description);
          setActiveTool(event.description);
          break;
        case "tool-end":
          setActiveTool(null);
          push({
            kind: "tool",
            desc: callDescriptions.current.get(event.callId) ?? event.toolName,
            ok: event.ok,
            detail: firstLines(event.output) + ` (${(event.durationMs / 1000).toFixed(1)}s)`,
          });
          break;
        case "tool-denied":
          setActiveTool(null);
          push({
            kind: "tool",
            desc: callDescriptions.current.get(event.callId) ?? event.toolName,
            ok: false,
            detail: event.reason,
            denied: true,
          });
          break;
        case "todos":
          setTodos(event.todos);
          break;
        case "compaction":
          push({ kind: "notice", text: "Context compacted" });
          break;
        case "notice":
          push({ kind: "notice", text: event.message });
          break;
        case "error":
          push({ kind: "error", text: event.message });
          break;
      }
    });
  }, [runtime.bus, push]);

  // Permission arbiter bridge: agent loop → React state → keyboard.
  useEffect(() => {
    props.arbiterRef.current = (req) =>
      new Promise<PermissionDecision>((resolve) => setPermission({ req, resolve }));
    return () => {
      props.arbiterRef.current = null;
    };
  }, [props.arbiterRef]);

  // Spinner animation.
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setFrame((f) => (f + 1) % SPINNER.length), 80);
    return () => clearInterval(t);
  }, [busy]);

  const runPrompt = useCallback(
    async (text: string) => {
      push({ kind: "user", text });
      const expanded = expandSlashCommand(text, runtime.skills) ?? text;
      setBusy(true);
      try {
        await runtime.agent.runTurn(expanded);
      } catch {
        // error event already emitted by the agent
      } finally {
        setBusy(false);
        setActiveTool(null);
        setStreamText("");
      }
    },
    [push, runtime],
  );

  // Kick off an initial prompt if one was passed on the command line.
  const startedRef = useRef(false);
  useEffect(() => {
    if (props.initialPrompt && !startedRef.current) {
      startedRef.current = true;
      void runPrompt(props.initialPrompt);
    }
  }, [props.initialPrompt, runPrompt]);

  const handleCommand = useCallback(
    (text: string): boolean => {
      const [cmd, ...rest] = text.trim().split(/\s+/);
      const arg = rest.join(" ");
      switch (cmd) {
        case "/help":
          push({ kind: "notice", text: HELP });
          return true;
        case "/quit":
        case "/exit":
          exit();
          return true;
        case "/clear":
          setLog([]);
          return true;
        case "/mode": {
          if (arg && PERMISSION_MODES.includes(arg as PermissionMode)) {
            runtime.agent.setMode(arg as PermissionMode);
            setMode(arg as PermissionMode);
            push({ kind: "notice", text: `Permission mode: ${arg}` });
          } else {
            push({
              kind: "notice",
              text: `Mode: ${runtime.agent.mode}. Use /mode <${PERMISSION_MODES.join("|")}>`,
            });
          }
          return true;
        }
        case "/model": {
          if (!arg) {
            push({ kind: "notice", text: `Model: ${modelSpec}` });
            return true;
          }
          push({
            kind: "notice",
            text: `Model switching applies to new sessions; restart with --model ${arg}. (Current: ${modelSpec})`,
          });
          return true;
        }
        case "/compact":
          setBusy(true);
          runtime.agent
            .compactNow()
            .catch((err) => push({ kind: "error", text: String(err?.message ?? err) }))
            .finally(() => setBusy(false));
          return true;
        case "/skills":
          push({
            kind: "notice",
            text:
              runtime.skills.length === 0
                ? "No skills found"
                : runtime.skills
                    .map((s) => `/${s.name} (${s.source}) — ${s.description}`)
                    .join("\n"),
          });
          return true;
        default:
          return false;
      }
    },
    [exit, modelSpec, push, runtime],
  );

  const onSubmit = useCallback(
    (value: string) => {
      const text = value.trim();
      if (!text || busy) return;
      setInput("");
      history.current.push(text);
      historyPos.current = -1;
      if (text.startsWith("/") && handleCommand(text)) return;
      if (text.startsWith("/") && !expandSlashCommand(text, runtime.skills)) {
        push({ kind: "error", text: `Unknown command: ${text.split(/\s/)[0]} (try /help)` });
        return;
      }
      void runPrompt(text);
    },
    [busy, handleCommand, push, runPrompt, runtime.skills],
  );

  useInput((char, key) => {
    if (permission) {
      const decide = (d: PermissionDecision) => {
        permission.resolve(d);
        setPermission(null);
      };
      if (char === "y") decide({ behavior: "allow" });
      else if (char === "a") decide({ behavior: "allow", always: true });
      else if (char === "n" || key.escape) decide({ behavior: "deny" });
      return;
    }
    if (key.escape && busy) {
      runtime.agent.abort();
      return;
    }
    if (key.upArrow && !busy) {
      const h = history.current;
      if (h.length === 0) return;
      historyPos.current =
        historyPos.current === -1
          ? h.length - 1
          : Math.max(0, historyPos.current - 1);
      setInput(h[historyPos.current] ?? "");
    } else if (key.downArrow && !busy) {
      const h = history.current;
      if (historyPos.current === -1) return;
      historyPos.current = historyPos.current + 1;
      if (historyPos.current >= h.length) {
        historyPos.current = -1;
        setInput("");
      } else {
        setInput(h[historyPos.current] ?? "");
      }
    }
  });

  const cwdName = useMemo(() => path.basename(process.cwd()), []);

  return (
    <Box flexDirection="column">
      <Static items={log.map((item, i) => ({ item, key: i }))}>
        {({ item, key }) => <LogLine key={key} item={item} />}
      </Static>
      {streamText !== "" && (
        <Box marginTop={1}>
          <Text>{streamText}</Text>
        </Box>
      )}
      {todos.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {todos.map((t, i) => (
            <Text key={i} dimColor={t.status === "completed"}>
              {t.status === "completed" ? "☑" : t.status === "in_progress" ? "◉" : "☐"}{" "}
              {t.content}
            </Text>
          ))}
        </Box>
      )}
      {busy && (
        <Box marginTop={1}>
          <Text color="cyan">
            {SPINNER[frame]} {activeTool ?? "thinking…"}{" "}
          </Text>
          <Text dimColor>(esc to interrupt)</Text>
        </Box>
      )}
      {permission && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="yellow"
          paddingX={1}
          marginTop={1}
        >
          <Text color="yellow">Permission required</Text>
          <Text>{permission.req.description}</Text>
          <Text dimColor>y = allow once · a = always allow · n/esc = deny</Text>
        </Box>
      )}
      {!busy && !permission && (
        <Box marginTop={1}>
          <Text color="cyan">› </Text>
          <TextInput value={input} onChange={setInput} onSubmit={onSubmit} />
        </Box>
      )}
      <Box marginTop={1}>
        <Text dimColor>
          {cwdName} · {modelSpec} · {mode}
        </Text>
      </Box>
    </Box>
  );
}

function LogLine({ item }: { item: LogItem }) {
  switch (item.kind) {
    case "user":
      return (
        <Box marginTop={1}>
          <Text color="cyan">› {item.text}</Text>
        </Box>
      );
    case "assistant":
      return (
        <Box marginTop={1}>
          <Text>{item.text}</Text>
        </Box>
      );
    case "tool":
      return (
        <Box flexDirection="column">
          <Text color={item.ok ? "green" : item.denied ? "yellow" : "red"}>
            ⏺ {item.desc}
          </Text>
          {item.detail !== "" && <Text dimColor>  ⎿ {item.detail}</Text>}
        </Box>
      );
    case "notice":
      return <Text dimColor>{item.text}</Text>;
    case "error":
      return <Text color="red">✗ {item.text}</Text>;
  }
}

export function startRepl(opts: {
  runtime: Runtime;
  arbiterRef: ArbiterRef;
  initialNotices: string[];
  initialPrompt?: string;
}): void {
  render(
    <App
      runtime={opts.runtime}
      arbiterRef={opts.arbiterRef}
      initialNotices={opts.initialNotices}
      initialPrompt={opts.initialPrompt}
    />,
  );
}
