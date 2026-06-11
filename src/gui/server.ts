import crypto from "node:crypto";
import http from "node:http";
import { createRuntime } from "../runtime.js";
import { expandSlashCommand } from "../skills/skills.js";
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
      } else if (req.method === "POST" && url.pathname === "/api/abort") {
        runtime.agent.abort();
        json(res, 200, { ok: true });
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
}
