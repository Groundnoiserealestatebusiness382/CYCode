import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { Agent } from "../src/agent/loop.js";
import { EventBus, type AgentEvent } from "../src/agent/events.js";
import { readTool } from "../src/tools/core/read.js";
import { bashTool } from "../src/tools/core/bash.js";
import { makeTmpDir } from "./helpers.js";

function streamOf(parts: any[]) {
  return {
    stream: simulateReadableStream({
      chunks: [{ type: "stream-start", warnings: [] }, ...parts],
    }),
  };
}

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

function textAndToolCallStream(text: string, toolName: string, input: unknown) {
  return streamOf([
    { type: "text-start", id: "t1" },
    { type: "text-delta", id: "t1", delta: text },
    { type: "text-end", id: "t1" },
    {
      type: "tool-call",
      toolCallId: "call-1",
      toolName,
      input: JSON.stringify(input),
    },
    { type: "finish", finishReason: "tool-calls", usage },
  ]);
}

function finalTextStream(text: string) {
  return streamOf([
    { type: "text-start", id: "t1" },
    { type: "text-delta", id: "t1", delta: text },
    { type: "text-end", id: "t1" },
    { type: "finish", finishReason: "stop", usage },
  ]);
}

function makeAgent(opts: {
  cwd: string;
  streams: any[];
  tools?: any[];
  arbiter?: any;
  events?: AgentEvent[];
}) {
  const bus = new EventBus();
  const events: AgentEvent[] = opts.events ?? [];
  bus.on((e) => events.push(e));
  // note: MockLanguageModelV3's array form is off by one (reads index 1 on the
  // first call), so feed the scripted streams through our own counter instead
  let call = 0;
  const model = new MockLanguageModelV3({ doStream: async () => opts.streams[call++] });
  const agent = new Agent({
    cwd: opts.cwd,
    config: {},
    model,
    systemPrompt: "You are a test agent.",
    mode: "default",
    arbiter: opts.arbiter ?? (async () => ({ behavior: "allow" as const })),
    tools: opts.tools ?? [readTool, bashTool],
    bus,
    contextWindow: 200_000,
  });
  return { agent, events };
}

describe("Agent loop", () => {
  it("executes a tool call and continues to a final answer", async () => {
    const cwd = makeTmpDir();
    fs.writeFileSync(path.join(cwd, "hello.txt"), "hello world");
    const { agent, events } = makeAgent({
      cwd,
      streams: [
        textAndToolCallStream("Reading the file.", "read", { file_path: "hello.txt" }),
        finalTextStream("The file says hello."),
      ],
    });

    const finalText = await agent.runTurn("what does hello.txt say?");

    expect(finalText).toBe("The file says hello.");
    // user → assistant(text+tool-call) → tool result → assistant(final)
    expect(agent.messages).toHaveLength(4);
    expect(agent.messages[2]!.role).toBe("tool");
    const toolResult = (agent.messages[2]!.content as any[])[0];
    expect(toolResult.output.type).toBe("text");
    expect(toolResult.output.value).toContain("hello world");

    const types = events.map((e) => e.type);
    expect(types).toContain("tool-start");
    expect(types).toContain("tool-end");
    expect(types[types.length - 1]).toBe("turn-end");
    const toolEnd = events.find((e) => e.type === "tool-end") as any;
    expect(toolEnd.ok).toBe(true);
  });

  it("records execution-denied results when the user refuses", async () => {
    const cwd = makeTmpDir();
    const { agent, events } = makeAgent({
      cwd,
      streams: [
        textAndToolCallStream("Deleting everything.", "bash", { command: "rm -rf /" }),
        finalTextStream("Okay, I won't."),
      ],
      arbiter: vi.fn(async () => ({ behavior: "deny" as const, message: "no way" })),
    });

    await agent.runTurn("clean my disk");

    const toolResult = (agent.messages[2]!.content as any[])[0];
    expect(toolResult.output.type).toBe("execution-denied");
    expect(events.some((e) => e.type === "tool-denied")).toBe(true);
  });

  it("returns error-text results for failing tools and keeps going", async () => {
    const cwd = makeTmpDir();
    const { agent } = makeAgent({
      cwd,
      streams: [
        textAndToolCallStream("Reading.", "read", { file_path: "missing.txt" }),
        finalTextStream("That file does not exist."),
      ],
    });

    const finalText = await agent.runTurn("read missing.txt");

    expect(finalText).toBe("That file does not exist.");
    const toolResult = (agent.messages[2]!.content as any[])[0];
    expect(toolResult.output.type).toBe("error-text");
    expect(toolResult.output.value).toMatch(/not found/i);
  });

  it("streams text deltas through the event bus", async () => {
    const cwd = makeTmpDir();
    const { agent, events } = makeAgent({
      cwd,
      streams: [finalTextStream("plain answer")],
    });
    await agent.runTurn("hi");
    const deltas = events.filter((e) => e.type === "text-delta");
    expect(deltas.length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === "text-end" && e.text === "plain answer")).toBe(
      true,
    );
  });
});
