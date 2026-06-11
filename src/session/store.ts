import fs from "node:fs";
import path from "node:path";
import type { ModelMessage } from "ai";
import { sessionsDir } from "../util/paths.js";

export interface SessionMeta {
  id: string;
  cwd: string;
  createdAt: string;
  model: string;
}

type SessionEntry =
  | { type: "meta"; meta: SessionMeta }
  | { type: "message"; message: ModelMessage }
  | { type: "compaction"; summary: string };

/**
 * Append-only JSONL session log (Codex-style rollouts).
 * A "compaction" entry resets the replayed history to a single summary message.
 */
export class SessionStore {
  readonly filePath: string;
  readonly meta: SessionMeta;

  private constructor(filePath: string, meta: SessionMeta) {
    this.filePath = filePath;
    this.meta = meta;
  }

  static create(cwd: string, model: string): SessionStore {
    const id =
      new Date().toISOString().replace(/[:.]/g, "-") +
      "-" +
      Math.random().toString(36).slice(2, 8);
    const meta: SessionMeta = {
      id,
      cwd: path.resolve(cwd),
      createdAt: new Date().toISOString(),
      model,
    };
    const store = new SessionStore(path.join(sessionsDir(cwd), `${id}.jsonl`), meta);
    store.writeLine({ type: "meta", meta });
    return store;
  }

  static list(cwd: string): SessionMeta[] {
    const dir = sessionsDir(cwd);
    const metas: SessionMeta[] = [];
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"))) {
      try {
        const first = fs
          .readFileSync(path.join(dir, f), "utf8")
          .split("\n", 1)[0]!;
        const entry = JSON.parse(first) as SessionEntry;
        if (entry.type === "meta") metas.push(entry.meta);
      } catch {
        // skip corrupt session files
      }
    }
    return metas.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  static open(cwd: string, id: string): SessionStore {
    const file = path.join(sessionsDir(cwd), `${id}.jsonl`);
    if (!fs.existsSync(file)) throw new Error(`Session not found: ${id}`);
    const first = fs.readFileSync(file, "utf8").split("\n", 1)[0]!;
    const entry = JSON.parse(first) as SessionEntry;
    if (entry.type !== "meta") throw new Error(`Corrupt session file: ${file}`);
    return new SessionStore(file, entry.meta);
  }

  static latest(cwd: string): SessionStore | null {
    const metas = SessionStore.list(cwd);
    const last = metas[metas.length - 1];
    return last ? SessionStore.open(cwd, last.id) : null;
  }

  private writeLine(entry: SessionEntry): void {
    fs.appendFileSync(this.filePath, JSON.stringify(entry) + "\n");
  }

  appendMessage(message: ModelMessage): void {
    this.writeLine({ type: "message", message });
  }

  appendCompaction(summary: string): void {
    this.writeLine({ type: "compaction", summary });
  }

  /** Replay the log into the message history the agent should resume with. */
  loadMessages(): ModelMessage[] {
    let messages: ModelMessage[] = [];
    const lines = fs.readFileSync(this.filePath, "utf8").split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      let entry: SessionEntry;
      try {
        entry = JSON.parse(line) as SessionEntry;
      } catch {
        continue; // tolerate a torn final line
      }
      if (entry.type === "message") messages.push(entry.message);
      else if (entry.type === "compaction") {
        messages = [
          {
            role: "user",
            content: `[Summary of the conversation so far]\n\n${entry.summary}`,
          },
        ];
      }
    }
    return messages;
  }
}
