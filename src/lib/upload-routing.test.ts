import { describe, test, expect } from "vitest";
import { inferUploadRouting, type KnownCase } from "./upload-routing";

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

  test("matches an existing case by title substring", () => {
    const r = inferUploadRouting("Schmidt Erbsache Vollmacht.pdf", CASES);
    expect(r.matchedCaseSlug).toBe("cases/schmidt-erbe");
    expect(r.docType).toBe("vollmacht");
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
