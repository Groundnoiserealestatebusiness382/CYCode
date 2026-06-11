import { describe, expect, it } from "vitest";
import { parseLatexLog } from "../src/tools/research/latex.js";

const LOG = String.raw`This is pdfTeX, Version 3.141592653
(./main.tex
LaTeX Warning: Reference 'fig:arch' on page 1 undefined on input line 40.

./main.tex:12: Undefined control sequence.
l.12 \badmacro
               {}
./sections/method.tex:7: Missing $ inserted.
! Emergency stop.
l.99 \end{document}
Package natbib Warning: Citation 'smith2024' on page 2 undefined.
Output written on main.pdf (3 pages).`;

describe("parseLatexLog", () => {
  it("extracts file:line errors", () => {
    const { errors } = parseLatexLog(LOG);
    expect(errors).toContain("./main.tex:12: Undefined control sequence.");
    expect(errors).toContain("./sections/method.tex:7: Missing $ inserted.");
  });

  it("extracts bare TeX errors with line context", () => {
    const { errors } = parseLatexLog(LOG);
    expect(errors.some((e) => e.startsWith("Emergency stop.") && e.includes("l.99"))).toBe(
      true,
    );
  });

  it("counts warnings", () => {
    expect(parseLatexLog(LOG).warnings).toBe(2);
  });

  it("dedupes repeated errors", () => {
    const log = "./a.tex:1: Oops.\n./a.tex:1: Oops.";
    expect(parseLatexLog(log).errors).toHaveLength(1);
  });
});
