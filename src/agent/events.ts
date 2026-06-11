export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

export type AgentEvent =
  | { type: "turn-start" }
  | { type: "text-delta"; text: string }
  | { type: "text-end"; text: string }
  | { type: "reasoning-delta"; text: string }
  | {
      type: "tool-start";
      callId: string;
      toolName: string;
      description: string;
      input: unknown;
    }
  | {
      type: "tool-end";
      callId: string;
      toolName: string;
      ok: boolean;
      output: string;
      durationMs: number;
    }
  | { type: "tool-denied"; callId: string; toolName: string; reason: string }
  | { type: "todos"; todos: TodoItem[] }
  | { type: "compaction"; summary: string }
  | {
      type: "turn-end";
      usage: { inputTokens?: number; outputTokens?: number };
    }
  | { type: "notice"; message: string }
  | { type: "error"; message: string };

export type AgentEventHandler = (event: AgentEvent) => void;

/** Minimal pub/sub bus connecting the agent loop to whichever UI is driving it. */
export class EventBus {
  private handlers: AgentEventHandler[] = [];

  on(handler: AgentEventHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  emit(event: AgentEvent): void {
    for (const h of this.handlers) h(event);
  }
}
