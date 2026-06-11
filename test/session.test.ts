import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionStore } from "../src/session/store.js";
import { makeTmpDir } from "./helpers.js";

describe("SessionStore", () => {
  let home: string;
  let project: string;

  beforeEach(() => {
    home = makeTmpDir("cycode-home-");
    project = makeTmpDir("cycode-proj-");
    process.env.CYCODE_HOME = home;
  });

  afterEach(() => {
    delete process.env.CYCODE_HOME;
  });

  it("round-trips messages", () => {
    const store = SessionStore.create(project, "anthropic/test");
    store.appendMessage({ role: "user", content: "hello" });
    store.appendMessage({ role: "assistant", content: "hi there" });

    const reopened = SessionStore.open(project, store.meta.id);
    const messages = reopened.loadMessages();
    expect(messages).toHaveLength(2);
    expect(messages[0]).toEqual({ role: "user", content: "hello" });
  });

  it("compaction entries reset replayed history", () => {
    const store = SessionStore.create(project, "anthropic/test");
    store.appendMessage({ role: "user", content: "old stuff" });
    store.appendMessage({ role: "assistant", content: "old reply" });
    store.appendCompaction("we did old stuff");
    store.appendMessage({ role: "user", content: "new question" });

    const messages = store.loadMessages();
    expect(messages).toHaveLength(2);
    expect(String(messages[0]!.content)).toContain("we did old stuff");
    expect(messages[1]).toEqual({ role: "user", content: "new question" });
  });

  it("lists sessions and finds the latest", () => {
    const a = SessionStore.create(project, "m1");
    const b = SessionStore.create(project, "m2");
    const list = SessionStore.list(project);
    expect(list.map((m) => m.id)).toContain(a.meta.id);
    expect(list.map((m) => m.id)).toContain(b.meta.id);
    expect(SessionStore.latest(project)!.meta.id).toBe(
      list[list.length - 1]!.id,
    );
  });

  it("tolerates a torn final line", () => {
    const store = SessionStore.create(project, "m");
    store.appendMessage({ role: "user", content: "ok" });
    fs.appendFileSync(store.filePath, '{"type":"message","mess');
    expect(store.loadMessages()).toHaveLength(1);
  });
});
