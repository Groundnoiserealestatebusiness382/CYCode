import { spawn } from "node:child_process";
import {
  streamText,
  tool,
  type LanguageModel,
  type ModelMessage,
  type ToolResultPart,
  type ToolSet,
} from "ai";
import type { CycodeConfig } from "../config.js";
import type { CycodeTool, ToolContext } from "../tools/types.js";
import { describeCall } from "../tools/types.js";
import {
  PermissionGate,
  type PermissionArbiter,
  type PermissionMode,
} from "../permissions/permissions.js";
import type { SessionStore } from "../session/store.js";
import { shouldCompact, summarizeConversation } from "./compaction.js";
import { EventBus, type TodoItem } from "./events.js";

export interface AgentOptions {
  cwd: string;
  config: CycodeConfig;
  model: LanguageModel;
  /** Cheaper model for compaction summaries; defaults to the main model. */
  smallModel?: LanguageModel;
  systemPrompt: string;
  mode: PermissionMode;
  arbiter: PermissionArbiter;
  tools: CycodeTool[];
  bus: EventBus;
  session?: SessionStore;
  contextWindow: number;
  /** Safety cap on model/tool round-trips per user turn. */
  maxStepsPerTurn?: number;
  onAlwaysAllow?: (rule: string) => void;
}

export class Agent {
  messages: ModelMessage[] = [];
  todos: TodoItem[] = [];
  systemPrompt: string;

  private readonly opts: AgentOptions;
  private readonly gate: PermissionGate;
  private readonly toolByName: Map<string, CycodeTool>;
  private readonly aiTools: ToolSet;
  private session?: SessionStore;
  private lastPromptTokens: number | undefined;
  private abortController: AbortController | null = null;
  busy = false;

  constructor(opts: AgentOptions) {
    this.opts = opts;
    this.systemPrompt = opts.systemPrompt;
    this.gate = new PermissionGate({
      mode: opts.mode,
      allow: opts.config.permissions?.allow,
      deny: opts.config.permissions?.deny,
      arbiter: opts.arbiter,
    });
    this.gate.onAlwaysAllow = opts.onAlwaysAllow;
    this.toolByName = new Map(opts.tools.map((t) => [t.name, t]));
    this.aiTools = Object.fromEntries(
      opts.tools.map((t) => [
        t.name,
        // Schema-only tools: no execute, so the SDK returns tool calls to us
        // and every execution flows through the permission gate below.
        tool({ description: t.description, inputSchema: t.inputSchema }),
      ]),
    );
    this.session = opts.session;
    if (this.session) this.messages = this.session.loadMessages();
  }

  get sessionMeta(): SessionStore["meta"] | undefined {
    return this.session?.meta;
  }

  /** Swap to another session's history (GUI session switching). */
  loadSession(store: SessionStore): void {
    if (this.busy) throw new Error("Cannot switch sessions while a turn is running");
    this.session = store;
    this.messages = store.loadMessages();
    this.todos = [];
  }

  get mode(): PermissionMode {
    return this.gate.mode;
  }

  setMode(mode: PermissionMode): void {
    this.gate.mode = mode;
  }

  abort(): void {
    this.abortController?.abort();
  }

  private emit = (event: Parameters<EventBus["emit"]>[0]) => {
    this.opts.bus.emit(event);
  };

  private pushMessage(message: ModelMessage): void {
    this.messages.push(message);
    this.session?.appendMessage(message);
  }

  private makeToolContext(signal: AbortSignal): ToolContext {
    return {
      cwd: this.opts.cwd,
      config: this.opts.config,
      emit: this.emit,
      abortSignal: signal,
      todos: this.todos,
      runDiagnostics: () => this.runDiagnostics(),
    };
  }

  /** Run the configured diagnostics command; returns trimmed output on failure. */
  private async runDiagnostics(): Promise<string | undefined> {
    const cmd = this.opts.config.diagnostics?.command;
    if (!cmd) return undefined;
    const timeout = this.opts.config.diagnostics?.timeoutMs ?? 60_000;
    return new Promise((resolve) => {
      const child = spawn("/bin/bash", ["-c", cmd], { cwd: this.opts.cwd });
      let out = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve(undefined);
      }, timeout);
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (out += d));
      child.on("error", () => {
        clearTimeout(timer);
        resolve(undefined);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve(code === 0 ? undefined : out.trim().slice(0, 4000));
      });
    });
  }

  async compactNow(): Promise<void> {
    const summary = await summarizeConversation(
      this.opts.smallModel ?? this.opts.model,
      this.messages,
    );
    this.messages = [
      {
        role: "user",
        content: `[Summary of the conversation so far]\n\n${summary}`,
      },
    ];
    this.lastPromptTokens = undefined;
    this.session?.appendCompaction(summary);
    this.emit({ type: "compaction", summary });
  }

  /** Run one user turn: stream model output, execute tool calls, repeat until a text-only reply. */
  async runTurn(userText: string): Promise<string> {
    if (this.busy) throw new Error("Agent is already running a turn");
    this.busy = true;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    const ctx = this.makeToolContext(signal);
    let finalText = "";

    this.emit({ type: "turn-start" });
    this.pushMessage({ role: "user", content: userText });

    try {
      const maxSteps = this.opts.maxStepsPerTurn ?? 100;
      for (let step = 0; step < maxSteps; step++) {
        if (shouldCompact(this.lastPromptTokens, this.opts.contextWindow)) {
          await this.compactNow();
        }

        const result = streamText({
          model: this.opts.model,
          system: this.systemPrompt,
          messages: this.messages,
          tools: this.aiTools,
          abortSignal: signal,
          // errors surface as 'error' stream parts handled below; the SDK default
          // would also dump them to console.error, corrupting the TUI
          onError: () => {},
        });
        // if the stream throws we bail before awaiting response; stop that
        // pending promise from becoming an unhandled rejection
        Promise.resolve(result.response).catch(() => {});

        const toolCalls: { toolCallId: string; toolName: string; input: unknown }[] = [];
        let stepText = "";
        for await (const part of result.fullStream) {
          switch (part.type) {
            case "text-delta":
              stepText += part.text;
              this.emit({ type: "text-delta", text: part.text });
              break;
            case "reasoning-delta":
              this.emit({ type: "reasoning-delta", text: part.text });
              break;
            case "tool-call":
              toolCalls.push({
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                input: part.input,
              });
              break;
            case "finish-step":
              this.lastPromptTokens =
                (part.usage.inputTokens ?? 0) + (part.usage.outputTokens ?? 0);
              break;
            case "abort":
              throw new Error("Turn aborted");
            case "error":
              throw part.error instanceof Error
                ? part.error
                : new Error(String(part.error));
          }
        }
        if (stepText) {
          this.emit({ type: "text-end", text: stepText });
          finalText = stepText;
        }

        const response = await result.response;
        for (const message of response.messages) this.pushMessage(message);

        if (toolCalls.length === 0) break;

        const resultParts: ToolResultPart[] = [];
        for (const call of toolCalls) {
          resultParts.push(await this.executeToolCall(call, ctx, signal));
        }
        this.pushMessage({ role: "tool", content: resultParts });
      }

      const usage = { inputTokens: this.lastPromptTokens, outputTokens: undefined };
      this.emit({ type: "turn-end", usage });
      return finalText;
    } catch (err) {
      if (signal.aborted) {
        this.recoverFromAbort();
        this.emit({ type: "notice", message: "Interrupted" });
        return finalText;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.emit({ type: "error", message });
      throw err;
    } finally {
      this.busy = false;
      this.abortController = null;
    }
  }

  private async executeToolCall(
    call: { toolCallId: string; toolName: string; input: unknown },
    ctx: ToolContext,
    signal: AbortSignal,
  ): Promise<ToolResultPart> {
    const cycTool = this.toolByName.get(call.toolName);
    const base = { toolCallId: call.toolCallId, toolName: call.toolName } as const;

    if (!cycTool) {
      return {
        type: "tool-result",
        ...base,
        output: { type: "error-text", value: `Unknown tool: ${call.toolName}` },
      };
    }

    const description = describeCall(cycTool, call.input);
    this.emit({
      type: "tool-start",
      callId: call.toolCallId,
      toolName: call.toolName,
      description,
      input: call.input,
    });
    const startedAt = Date.now();

    if (signal.aborted) {
      return {
        type: "tool-result",
        ...base,
        output: { type: "execution-denied", reason: "Turn was interrupted" },
      };
    }

    const gateResult = await this.gate.check(cycTool, call.input);
    if (!gateResult.allowed) {
      this.emit({
        type: "tool-denied",
        callId: call.toolCallId,
        toolName: call.toolName,
        reason: gateResult.reason ?? "Denied",
      });
      return {
        type: "tool-result",
        ...base,
        output: { type: "execution-denied", reason: gateResult.reason },
      };
    }

    try {
      const output = await cycTool.execute(call.input, ctx);
      this.emit({
        type: "tool-end",
        callId: call.toolCallId,
        toolName: call.toolName,
        ok: true,
        output,
        durationMs: Date.now() - startedAt,
      });
      return { type: "tool-result", ...base, output: { type: "text", value: output } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit({
        type: "tool-end",
        callId: call.toolCallId,
        toolName: call.toolName,
        ok: false,
        output: message,
        durationMs: Date.now() - startedAt,
      });
      return {
        type: "tool-result",
        ...base,
        output: { type: "error-text", value: message },
      };
    }
  }

  /** Keep history valid after an abort: every tool call needs a matching tool result. */
  private recoverFromAbort(): void {
    const last = this.messages[this.messages.length - 1];
    if (!last || last.role !== "assistant" || !Array.isArray(last.content)) return;
    const pendingCalls = last.content.filter(
      (p): p is Extract<typeof p, { type: "tool-call" }> => p.type === "tool-call",
    );
    if (pendingCalls.length === 0) return;
    this.pushMessage({
      role: "tool",
      content: pendingCalls.map((c) => ({
        type: "tool-result",
        toolCallId: c.toolCallId,
        toolName: c.toolName,
        output: { type: "execution-denied", reason: "Turn was interrupted by the user" },
      })),
    });
  }
}
