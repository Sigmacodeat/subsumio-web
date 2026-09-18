// @vitest-environment node

import { describe, test, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { checkSource } from "../../scripts/check-grounding-invariant";

describe("check-grounding-invariant — rule", () => {
  test("an AI call without hook/panel is a violation", () => {
    expect(checkSource("const r = await api.legal.translate(x); return <p>{r.text}</p>;")).toBe(
      "violation"
    );
  });

  test("GroundedOutputPanel satisfies it", () => {
    expect(checkSource("await api.query.think(q); <GroundedOutputPanel text={answer} />")).toBe(
      "ok"
    );
  });

  test("a CitationPanel without any grounding source does not", () => {
    expect(checkSource("await api.legal.deepAnalysis(x); <CitationPanel data={{}} />")).toBe(
      "violation"
    );
  });

  test("server-side gate result fed into the panel counts", () => {
    expect(
      checkSource(
        "const r = await api.legal.analyzeDocument(x); <CitationPanel data={{ grounding: r._grounding }} />"
      )
    ).toBe("ok");
  });

  test("an explicit, reasoned exemption is honoured; files without AI calls are ignored", () => {
    expect(checkSource("// grounding-exempt: only starts a job\napi.legal.caseScan(x)")).toBe(
      "exempt"
    );
    expect(checkSource("api.legal.fristen()")).toBe("no-ai");
  });
});

describe("check-grounding-invariant — this repository", () => {
  test("every UI surface that requests AI legal text is grounded", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((e) => {
        if (["node_modules", "_archive", "api"].includes(e)) return [];
        const full = join(dir, e);
        if (statSync(full).isDirectory()) return walk(full);
        return /\.tsx$/.test(e) && !/\.(test|stories)\.tsx$/.test(e) ? [full] : [];
      });
    const files = ["src/app", "src/components"].flatMap((r) => walk(join(process.cwd(), r)));
    const violations = files
      .filter((f) => checkSource(readFileSync(f, "utf8")) === "violation")
      .map((f) => relative(process.cwd(), f));
    expect(violations).toEqual([]);
  });
});
