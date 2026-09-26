import { describe, test, expect } from "vitest";
import {
  divergentRoutingSlug,
  inferUploadRouting,
  uploadTargetCases,
  type KnownCase,
} from "./upload-routing";

const CASES: KnownCase[] = [
  { slug: "cases/mueller-gmbh", title: "Müller GmbH", aktenzeichen: "12 C 345/24" },
  { slug: "cases/schmidt-erbe", title: "Schmidt Erbsache" },
];

describe("inferUploadRouting", () => {
  test("detects a document type from the filename", () => {
    expect(inferUploadRouting("Klageschrift_final.pdf").docType).toBe("klage");
    expect(inferUploadRouting("Urteil-2024.pdf").docType).toBe("urteil");
    expect(inferUploadRouting("Mietvertrag.docx").docType).toBe("vertrag");
    expect(inferUploadRouting("Honorarrechnung.pdf").docType).toBe("rechnung");
  });

  test("detects an Aktenzeichen", () => {
    const r = inferUploadRouting("Schriftsatz_12 C 345_24.pdf");
    // separators are normalized to spaces before matching
    expect(r.aktenzeichen).toBe("12 C 345/24");
  });

  test("matches an existing case by Aktenzeichen", () => {
    const r = inferUploadRouting("12C345-24_klage.pdf", CASES);
    expect(r.matchedCaseSlug).toBe("cases/mueller-gmbh");
    expect(r.docType).toBe("klage");
  });

  test("a title in the filename is only a hint, never an assignment", () => {
    const r = inferUploadRouting("Schmidt Erbsache Vollmacht.pdf", CASES);
    expect(r.matchedCaseSlug).toBeUndefined();
    expect(r.titleMatchCaseSlug).toBe("cases/schmidt-erbe");
    expect(r.docType).toBe("vollmacht");
  });

  test("AT Geschäftszahl with Prüfbuchstabe matches the stored number", () => {
    const at: KnownCase[] = [
      { slug: "legal/cases/a", title: "A", aktenzeichen: "12 Cg 34/25x" },
      { slug: "legal/cases/b", title: "B", aktenzeichen: "12 Cg 34/25y" },
    ];
    const r = inferUploadRouting("Urteil 12 Cg 34-25x.pdf", at);
    expect(r.aktenzeichen).toBe("12 Cg 34/25x");
    expect(r.matchedCaseSlug).toBe("legal/cases/a");
  });

  test("two matters with the same number stay undecided", () => {
    const dup: KnownCase[] = [
      { slug: "legal/cases/a", title: "A", aktenzeichen: "3 Ob 12/24k" },
      { slug: "legal/cases/b", title: "B", aktenzeichen: "3Ob12/24k" },
    ];
    const r = inferUploadRouting("3 Ob 12_24k Beschluss.pdf", dup);
    expect(r.matchedCaseSlug).toBeUndefined();
    expect(r.ambiguousCaseSlugs).toEqual(["legal/cases/a", "legal/cases/b"]);
  });

  test("returns empty suggestion for an unremarkable filename", () => {
    const r = inferUploadRouting("scan001.pdf", CASES);
    expect(r.docType).toBeUndefined();
    expect(r.matchedCaseSlug).toBeUndefined();
    expect(r.hint).toBeUndefined();
  });

  test("strips directory and extension", () => {
    const r = inferUploadRouting("/inbox/2024/Bescheid_final.PDF");
    expect(r.docType).toBe("bescheid");
  });

  test("builds a human-readable hint", () => {
    const r = inferUploadRouting("12C345-24_klage.pdf", CASES);
    expect(r.hint).toContain("klage");
    expect(r.hint).toContain("Az.");
  });
});

describe("divergentRoutingSlug", () => {
  test("the chosen matter is kept; a different filename match is only offered", () => {
    // "Mietvertrag Huber Kopie.pdf" while matter "Maier" is chosen.
    const cases: KnownCase[] = [
      { slug: "legal/cases/huber", title: "Huber" },
      { slug: "legal/cases/maier", title: "Maier" },
    ];
    const r = inferUploadRouting("Mietvertrag Huber Kopie.pdf", cases);
    expect(r.matchedCaseSlug).toBeUndefined();
    expect(divergentRoutingSlug(r, "legal/cases/maier")).toBe("legal/cases/huber");
    expect(divergentRoutingSlug(r, "legal/cases/huber")).toBeUndefined();
  });
});

describe("uploadTargetCases", () => {
  test("keeps every open matter (150 and more) and drops archived/deleted ones", () => {
    const cases = Array.from({ length: 150 }, (_, i) => ({
      slug: `legal/cases/a${i}`,
      title: `Akte ${i}`,
      frontmatter: { status: i === 5 ? "archived" : i === 6 ? "tombstoned" : "open" },
    }));
    const targets = uploadTargetCases(cases);
    expect(targets).toHaveLength(148);
    expect(targets.some((c) => c.slug === "legal/cases/a149")).toBe(true);
  });

  test("the Aktenzeichen of an old matter at the end of the list is recognised", () => {
    const cases = [
      ...Array.from({ length: 149 }, (_, i) => ({ slug: `legal/cases/n${i}`, title: `Neu ${i}` })),
      { slug: "legal/cases/alt", title: "Alt", aktenzeichen: "7 C 12/19" },
    ];
    expect(inferUploadRouting("7C12-19_urteil.pdf", cases).matchedCaseSlug).toBe("legal/cases/alt");
  });
});
