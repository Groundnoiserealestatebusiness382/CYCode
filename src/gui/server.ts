import crypto from "node:crypto";
import http from "node:http";
import { spawn } from "node:child_process";
import type { ModelMessage } from "ai";
import { createRuntime } from "../runtime.js";
import { expandSlashCommand } from "../skills/skills.js";
import { SessionStore } from "../session/store.js";
import {
  PERMISSION_MODES,
  type PermissionDecision,
  type PermissionMode,
} from "../permissions/permissions.js";
import { PAGE_HTML } from "./page.js";

export interface GuiOptions {
  cwd: string;
  modelSpec?: string;
  mode?: PermissionMode;
  port: number;
  continueSession?: boolean;
  /** Open the system browser once the server is listening (default true). */
  openBrowser?: boolean;
}

/** Condense persisted ModelMessages into displayable events for transcript replay. */
export function messagesToEvents(messages: ModelMessage[]): unknown[] {
  const events: unknown[] = [];
  // tool results indexed by call id so calls and outcomes render as one card
  const results = new Map<string, { output: string; ok: boolean }>();
  for (const m of messages) {
    if (m.role !== "tool" || !Array.isArray(m.content)) continue;
    for (const part of m.content) {
      if (part.type !== "tool-result") continue;
      const out = part.output;
      if (out.type === "text" || out.type === "error-text") {
        results.set(part.toolCallId, { output: out.value, ok: out.type === "text" });
      } else if (out.type === "execution-denied") {
        results.set(part.toolCallId, { output: out.reason ?? "denied", ok: false });
      }
    }
  }
  for (const m of messages) {
    if (m.role === "user" && typeof m.content === "string") {
      events.push({ type: "user", text: m.content });
    } else if (m.role === "assistant") {
      if (typeof m.content === "string") {
        if (m.content) events.push({ type: "text-end", text: m.content });
        continue;
      }
      for (const part of m.content) {
        if (part.type === "text" && part.text) {
          events.push({ type: "text-end", text: part.text });
        } else if (part.type === "tool-call") {
          const result = results.get(part.toolCallId);
          events.push({
            type: "tool-start",
            callId: part.toolCallId,
            toolName: part.toolName,
            description: part.toolName,
            input: part.input,
          });
          events.push({
            type: "tool-end",
            callId: part.toolCallId,
            toolName: part.toolName,
            ok: result?.ok ?? true,
            output: result?.output ?? "",
            durationMs: 0,
          });
        }
      }
    }
  }
  return events;
}

function openInBrowser(url: string): void {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  try {
    spawn(cmd, args as string[], { stdio: "ignore", detached: true }).unref();
  } catch {
    // user can open the printed URL themselves
  }
}

function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

/** Local web GUI: SSE event stream + JSON endpoints, bound to localhost only. */
export async function startGui(opts: GuiOptions): Promise<void> {
  const sseClients = new Set<http.ServerResponse>();
  const pendingPermissions = new Map<string, (d: PermissionDecision) => void>();
  const transcript: unknown[] = [];

  const broadcast = (obj: unknown): void => {
    transcript.push(obj);
    if (transcript.length > 5000) transcript.splice(0, transcript.length - 5000);
    const frame = `data: ${JSON.stringify(obj)}\n\n`;
    for (const client of sseClients) client.write(frame);
  };

  const runtime = await createRuntime({
    cwd: opts.cwd,
    modelSpec: opts.modelSpec,
    mode: opts.mode,
    continueSession: opts.continueSession,
    arbiter: (req) =>
      new Promise<PermissionDecision>((resolve) => {
        const id = crypto.randomUUID();
        pendingPermissions.set(id, resolve);
        broadcast({
          type: "permission-request",
          id,
          description: req.description,
          key: req.key,
        });
      }),
    onNotice: (message) => broadcast({ type: "notice", message }),
  });
  runtime.bus.on(broadcast);

  const state = () => ({
    type: "state",
    cwd: opts.cwd,
    modelSpec: runtime.modelSpec,
    mode: runtime.agent.mode,
    busy: runtime.agent.busy,
    modes: PERMISSION_MODES,
    skills: runtime.skills.map((s) => ({ name: s.name, description: s.description })),
    todos: runtime.agent.todos,
    sessionId: runtime.agent.sessionMeta?.id ?? null,
    usage: {
      inputTokens: runtime.agent.totalInputTokens,
      outputTokens: runtime.agent.totalOutputTokens,
    },
  });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(PAGE_HTML);
      } else if (req.method === "GET" && url.pathname === "/api/events") {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        res.write(`data: ${JSON.stringify(state())}\n\n`);
        for (const past of transcript) {
          res.write(`data: ${JSON.stringify(past)}\n\n`);
        }
        sseClients.add(res);
        req.on("close", () => sseClients.delete(res));
      } else if (req.method === "GET" && url.pathname === "/api/state") {
        json(res, 200, state());
      } else if (req.method === "POST" && url.pathname === "/api/message") {
        const { text } = await readBody(req);
        if (typeof text !== "string" || !text.trim()) {
          return json(res, 400, { error: "text required" });
        }
        if (runtime.agent.busy) return json(res, 409, { error: "agent is busy" });
        broadcast({ type: "user", text });
        const prompt = expandSlashCommand(text, runtime.skills) ?? text;
        json(res, 202, { ok: true });
        runtime.agent.runTurn(prompt).catch(() => {
          // error event already broadcast by the agent loop
        });
      } else if (req.method === "POST" && url.pathname === "/api/permission") {
        const { id, behavior, always } = await readBody(req);
        const resolve = pendingPermissions.get(id);
        if (!resolve) return json(res, 404, { error: "unknown permission id" });
        pendingPermissions.delete(id);
        resolve({ behavior: behavior === "allow" ? "allow" : "deny", always: !!always });
        json(res, 200, { ok: true });
      } else if (req.method === "GET" && url.pathname === "/api/sessions") {
        json(res, 200, {
          sessions: SessionStore.list(opts.cwd).reverse(),
          current: runtime.agent.sessionMeta?.id ?? null,
        });
      } else if (req.method === "POST" && url.pathname === "/api/session/load") {
        const { id } = await readBody(req);
        if (runtime.agent.busy) return json(res, 409, { error: "agent is busy" });
        const store = SessionStore.open(opts.cwd, String(id));
        runtime.agent.loadSession(store);
        transcript.length = 0;
        broadcast({ type: "reset" });
        for (const event of messagesToEvents(runtime.agent.messages)) broadcast(event);
        broadcast(state());
        json(res, 200, { ok: true });
      } else if (req.method === "POST" && url.pathname === "/api/abort") {
        runtime.agent.abort();
        json(res, 200, { ok: true });
      } else if (req.method === "POST" && url.pathname === "/api/model") {
        const { spec } = await readBody(req);
        if (runtime.agent.busy) return json(res, 409, { error: "agent is busy" });
        try {
          runtime.switchModel(String(spec));
          broadcast({ type: "notice", message: `Model switched to ${spec}` });
          broadcast(state());
          json(res, 200, { ok: true });
        } catch (err) {
          json(res, 400, { error: err instanceof Error ? err.message : String(err) });
        }
      } else if (req.method === "POST" && url.pathname === "/api/mode") {
        const { mode } = await readBody(req);
        if (!PERMISSION_MODES.includes(mode)) return json(res, 400, { error: "bad mode" });
        runtime.agent.setMode(mode);
        broadcast({ type: "notice", message: `Permission mode: ${mode}` });
        broadcast(state());
        json(res, 200, { ok: true });
      } else {
        json(res, 404, { error: "not found" });
      }
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  });

  await new Promise<void>((resolve) => {
    // localhost only: never expose the agent (and its shell access) to the network
    server.listen(opts.port, "127.0.0.1", resolve);
  });
  const address = `http://127.0.0.1:${opts.port}`;
  process.stderr.write(`CYCode GUI: ${address}  (ctrl+c to stop)\n`);
  if (opts.openBrowser !== false) openInBrowser(address);
}
