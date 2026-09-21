import { describe, expect, test } from "bun:test";
import {
  assessPage,
  DOC_CLASS_OF_SOURCE,
  type PageRow,
} from "../scripts/audit-plausibility-full.ts";

const statute = (overrides: Partial<PageRow> = {}): PageRow => ({
  id: 1,
  frontmatter: { doc_id: "LNO1", schema_version: 5 },
  compiled_truth: "§ 1. Dieses Gesetz regelt etwas Substanzielles über vierzig Zeichen lang.",
  ...overrides,
});

describe("assessPage", () => {
  test("a clean, current-schema statute is plausible", () => {
    expect(assessPage(statute(), "statute")).toEqual({ ok: true, issues: [] });
  });

  test("the exact legacy-schema shape found 2026-09-21 (nor_id, no doc_id) is flagged", () => {
    const verdict = assessPage(
      statute({ frontmatter: { nor_id: "LTI1", region: "Tirol" } }),
      "statute"
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.issues).toContain("schema:legacy_frontmatter");
  });

  test("a page with neither doc_id nor nor_id has no identity at all", () => {
    const verdict = assessPage(statute({ frontmatter: { region: "Tirol" } }), "statute");
    expect(verdict.issues).toContain("schema:no_identity");
  });

  test("null frontmatter doesn't throw — treated as no identity", () => {
    const verdict = assessPage(statute({ frontmatter: null }), "statute");
    expect(verdict.ok).toBe(false);
    expect(verdict.issues).toContain("schema:no_identity");
  });

  test("the known-bad 2026-08-03 Landesrecht generation is flagged even with a clean body", () => {
    const verdict = assessPage(
      statute({ frontmatter: { doc_id: "LTI1", schema_version: 5, retrieved_at: "2026-08-03" } }),
      "statute"
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.issues).toContain("generation:known_bad");
  });

  test("a different retrieved_at date is not flagged as the known-bad generation", () => {
    const verdict = assessPage(
      statute({ frontmatter: { doc_id: "LTI1", schema_version: 5, retrieved_at: "2026-09-18" } }),
      "statute"
    );
    expect(verdict.issues).not.toContain("generation:known_bad");
  });

  test("an empty body fails validateBody's own gate, surfaced as body:empty_body", () => {
    const verdict = assessPage(statute({ compiled_truth: "" }), "statute");
    expect(verdict.ok).toBe(false);
    expect(verdict.issues).toContain("body:empty_body");
  });

  test("null compiled_truth is treated as empty, not a crash", () => {
    const verdict = assessPage(statute({ compiled_truth: null }), "statute");
    expect(verdict.issues).toContain("body:empty_body");
  });

  test("a short VwGH-style Rechtssatz decision is plausible, not flagged as too-short", () => {
    const decision = statute({
      compiled_truth:
        "# VwGH — 2009/18/0019\n\n## Gericht\n\nVerwaltungsgerichtshof\n\n## Rechtssatz\n\nEin vollständiger, kurzer Rechtssatz mit genug Substanz.",
    });
    const verdict = assessPage(decision, "decision");
    expect(verdict.ok).toBe(true);
  });

  test("a metadata-only judikatur stub (no content section at all) is flagged", () => {
    const stub = statute({
      compiled_truth:
        "# VwGH — X\n\n## Gericht\n\nVerwaltungsgerichtshof\n\n## Entscheidungsdatum\n\n2020-01-01",
    });
    const verdict = assessPage(stub, "decision");
    expect(verdict.ok).toBe(false);
    expect(verdict.issues).toContain("body:no_content_section");
  });

  test("multiple independent issues all surface at once, not just the first", () => {
    const verdict = assessPage(
      statute({ frontmatter: { region: "Tirol" }, compiled_truth: "" }),
      "statute"
    );
    expect(verdict.issues).toContain("schema:no_identity");
    expect(verdict.issues).toContain("body:empty_body");
  });
});

describe("DOC_CLASS_OF_SOURCE", () => {
  test("covers every AT law/judikatur/literature source this session has touched", () => {
    const expected = [
      "law-at",
      "law-at-normen",
      "law-at-landesrecht",
      "law-at-gemeinden",
      "law-at-bezirke",
      "law-at-avsv",
      "law-at-avn",
      "law-at-bmerl",
      "law-at-spg",
      "law-at-kmger",
      "law-at-staatsvertraege",
      "law-at-literatur",
      "law-at-judikatur",
      "law-at-judikatur-vwgh",
      "law-at-judikatur-vfgh",
      "law-at-judikatur-bvwg",
      "law-at-judikatur-lvwg",
      "law-at-judikatur-asylgh",
      "law-at-judikatur-uvs",
      "law-at-judikatur-dsk",
      "law-at-judikatur-gbk",
      "law-at-judikatur-pvak",
      "law-at-judikatur-dok",
      "law-at-judikatur-ubas",
      "law-at-judikatur-umse",
    ];
    expect(Object.keys(DOC_CLASS_OF_SOURCE).sort()).toEqual(expected.sort());
  });
});

describe("corpusDirOf / countMarkdownFiles", () => {
  test("one folder per source: the source id minus its law- prefix", async () => {
    const { corpusDirOf } = await import("../scripts/audit-plausibility-full.ts");
    expect(corpusDirOf("law-at-normen")).toBe("at-normen");
    expect(corpusDirOf("law-at-judikatur-vwgh")).toBe("at-judikatur-vwgh");
    expect(corpusDirOf("law-at")).toBe("at");
  });

  test("counts nested .md files, skips _state-style and dot folders, null when absent", async () => {
    const { countMarkdownFiles } = await import("../scripts/audit-plausibility-full.ts");
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const root = mkdtempSync(join(tmpdir(), "corpus-count-"));
    mkdirSync(join(root, "gnr-1"));
    mkdirSync(join(root, "_state"));
    writeFileSync(join(root, "a.md"), "x");
    writeFileSync(join(root, "gnr-1", "p-1.md"), "x");
    writeFileSync(join(root, "gnr-1", "notes.txt"), "x");
    writeFileSync(join(root, "_state", "ignored.md"), "x");
    expect(countMarkdownFiles(root)).toBe(2);
    expect(countMarkdownFiles(join(root, "does-not-exist"))).toBeNull();
  });
});
