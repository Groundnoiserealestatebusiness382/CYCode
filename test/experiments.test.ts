import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  expRunTool,
  expStatusTool,
  formatWandbRuns,
  isAlive,
  parseMetrics,
  readWandbRuns,
  tailLines,
} from "../src/tools/research/experiments.js";
import { makeCtx, makeTmpDir } from "./helpers.js";

describe("experiment helpers", () => {
  it("tailLines returns the last n lines", () => {
    expect(tailLines("a\nb\nc\nd\n", 2)).toBe("c\nd");
    expect(tailLines("only", 5)).toBe("only");
  });

  it("parseMetrics keeps the last matches", () => {
    const log = Array.from({ length: 20 }, (_, i) => `step ${i} loss=${1 / (i + 1)}`).join(
      "\n",
    );
    const metrics = parseMetrics(log, "loss=[0-9.]+", 3);
    expect(metrics).toHaveLength(3);
    expect(metrics[2]).toBe("loss=0.05");
  });

  it("isAlive detects the current process", () => {
    expect(isAlive(process.pid)).toBe(true);
    expect(isAlive(2 ** 30)).toBe(false);
  });
});

describe("exp_run + exp_status", () => {
  it("launches a background run and reads its log", async () => {
    const dir = makeTmpDir();
    const ctx = makeCtx(dir);
    const out = await expRunTool.execute(
      { command: "echo step 1 loss=0.5; echo step 2 loss=0.25", name: "demo" },
      ctx,
    );
    const id = /Started run (\S+)/.exec(out)![1]!;
    // wait for the detached process to flush its log
    await new Promise((r) => setTimeout(r, 300));
    const status = await expStatusTool.execute(
      { id, metric_regex: "loss=[0-9.]+" },
      ctx,
    );
    expect(status).toContain("demo");
    expect(status).toContain("loss=0.25");
    expect(fs.existsSync(`${dir}/.cycode/runs/index.json`)).toBe(true);
  });

  it("lists runs without an id", async () => {
    const dir = makeTmpDir();
    const ctx = makeCtx(dir);
    await expRunTool.execute({ command: "true", name: "r1" }, ctx);
    const listing = await expStatusTool.execute({}, ctx);
    expect(listing).toContain("r1");
  });
});

describe("wandb local runs", () => {
  function writeWandbFixture(dir: string, runId: string, summary: object): void {
    const files = `${dir}/wandb/run-${runId}/files`;
    fs.mkdirSync(files, { recursive: true });
    fs.writeFileSync(`${files}/wandb-summary.json`, JSON.stringify(summary));
    fs.writeFileSync(
      `${files}/wandb-metadata.json`,
      JSON.stringify({ startedAt: "2026-06-12T01:00:00" }),
    );
  }

  it("reads numeric summary metrics, skipping private keys", () => {
    const dir = makeTmpDir();
    writeWandbFixture(dir, "20260612_010000-abc123", {
      loss: 0.0421,
      "eval/accuracy": 0.913,
      _step: 5000,
      note: "not a number",
    });
    const runs = readWandbRuns(dir);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.id).toBe("20260612_010000-abc123");
    expect(runs[0]!.metrics).toEqual({ loss: 0.0421, "eval/accuracy": 0.913 });
    expect(runs[0]!.startedAt).toBe("2026-06-12T01:00:00");
  });

  it("returns empty without a wandb dir and formats runs readably", () => {
    expect(readWandbRuns(makeTmpDir())).toEqual([]);
    const text = formatWandbRuns([
      { id: "x", startedAt: "2026-06-12", metrics: { loss: 0.5 } },
    ]);
    expect(text).toContain("wandb x");
    expect(text).toContain("loss=0.5000");
  });

  it("appears in exp_status listings", async () => {
    const dir = makeTmpDir();
    writeWandbFixture(dir, "20260612_020000-def456", { loss: 1.25 });
    const out = await expStatusTool.execute({}, makeCtx(dir));
    expect(out).toContain("local wandb runs");
    expect(out).toContain("loss=1.250");
  });
});
