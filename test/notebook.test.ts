import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  notebookEditTool,
  notebookReadTool,
  toSourceLines,
} from "../src/tools/research/notebook.js";
import { makeCtx, makeTmpDir } from "./helpers.js";

function fixtureNotebook(): any {
  return {
    cells: [
      {
        cell_type: "markdown",
        source: ["# Title\n", "intro"],
        metadata: {},
      },
      {
        cell_type: "code",
        source: ["x = 1\n", "print(x)"],
        outputs: [{ output_type: "stream", name: "stdout", text: ["1\n"] }],
        execution_count: 1,
        metadata: {},
      },
    ],
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5,
  };
}

function writeFixture(dir: string): string {
  const file = path.join(dir, "nb.ipynb");
  fs.writeFileSync(file, JSON.stringify(fixtureNotebook()));
  return file;
}

describe("toSourceLines", () => {
  it("splits text into nbformat lines", () => {
    expect(toSourceLines("a\nb")).toEqual(["a\n", "b"]);
    expect(toSourceLines("a\n")).toEqual(["a\n"]);
    expect(toSourceLines("")).toEqual([]);
  });
});

describe("notebook tools", () => {
  it("reads cells with indices and outputs", async () => {
    const dir = makeTmpDir();
    writeFixture(dir);
    const out = await notebookReadTool.execute({ path: "nb.ipynb" }, makeCtx(dir));
    expect(out).toContain("[cell 0] markdown");
    expect(out).toContain("[cell 1] code");
    expect(out).toContain("print(x)");
    expect(out).toContain("--- output ---");
  });

  it("replaces a cell and clears its outputs", async () => {
    const dir = makeTmpDir();
    const file = writeFixture(dir);
    await notebookEditTool.execute(
      { path: "nb.ipynb", mode: "replace", index: 1, source: "y = 2\nprint(y)" },
      makeCtx(dir),
    );
    const nb = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(nb.cells[1].source).toEqual(["y = 2\n", "print(y)"]);
    expect(nb.cells[1].outputs).toEqual([]);
    expect(nb.cells[1].execution_count).toBeNull();
  });

  it("inserts, appends, and deletes cells", async () => {
    const dir = makeTmpDir();
    const file = writeFixture(dir);
    const ctx = makeCtx(dir);
    await notebookEditTool.execute(
      { path: "nb.ipynb", mode: "insert_after", index: 0, source: "mid", cell_type: "markdown" },
      ctx,
    );
    await notebookEditTool.execute(
      { path: "nb.ipynb", mode: "append", source: "tail = True" },
      ctx,
    );
    let nb = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(nb.cells).toHaveLength(4);
    expect(nb.cells[1].source).toEqual(["mid"]);
    expect(nb.cells[3].cell_type).toBe("code");

    await notebookEditTool.execute({ path: "nb.ipynb", mode: "delete", index: 1 }, ctx);
    nb = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(nb.cells).toHaveLength(3);
  });

  it("rejects out-of-range indices", async () => {
    const dir = makeTmpDir();
    writeFixture(dir);
    await expect(
      notebookEditTool.execute(
        { path: "nb.ipynb", mode: "delete", index: 9 },
        makeCtx(dir),
      ),
    ).rejects.toThrow(/out of range/);
  });
});
