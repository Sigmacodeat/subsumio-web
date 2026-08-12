/**
 * Unit-Tests für ris-delta-watcher.ts — Delta-Verarbeitung.
 *
 * Deckt ab:
 *  - docFilePath: deterministische Pfade, kein Datum-Prefix bei Judikatur
 *  - buildStatuteMarkdown: deprecated-Marker bei ausserkraft
 *  - buildJudikaturMarkdown: korrekte Frontmatter-Struktur
 *  - normKey: Paragraph-Normalisierung
 *  - slugify: Umlaut-Behandlung
 */
import { describe, it, expect } from "vitest";
import {
  docFilePath,
  buildStatuteMarkdown,
  buildJudikaturMarkdown,
  buildLandesrechtMarkdown,
  normKey,
  slugify,
} from "./ris-delta-watcher";
import type { DeltaApplikation, DeltaDocument } from "./ris-delta";

// Override CORPUS_ROOT für Tests via env
process.env.LAW_CORPUS_ROOT = "/tmp/test-corpus";

const BRKONS_APP: DeltaApplikation = {
  applikation: "BrKons",
  endpoint: "Bundesrecht",
  corpusDir: "at-normen",
  label: "Bundesrecht",
  stateKey: "ris-delta-BrKons",
};

const JUD_APP: DeltaApplikation = {
  applikation: "Justiz",
  endpoint: "Judikatur",
  corpusDir: "at-judikatur",
  label: "OGH",
  stateKey: "ris-delta-Justiz",
};

const LR_APP: DeltaApplikation = {
  applikation: "LrKons",
  endpoint: "Landesrecht",
  corpusDir: "at-landesrecht",
  label: "Landesrecht",
  stateKey: "ris-delta-LrKons",
};

const baseDoc: DeltaDocument = {
  id: "NOR40060075",
  applikation: "BrKons",
  changedAt: "2026-08-01",
  dokumentUrl: "https://ris.bka.gv.at/doc/NOR40060075",
  xmlUrl: "https://ris.bka.gv.at/doc/NOR40060075.xml",
  htmlUrl: null,
  pdfUrl: null,
  kurztitel: "Testgesetz",
  gesetzesnummer: "10001622",
  geschaeftszahl: null,
  artikelParagraphAnlage: "§ 1152",
  changeType: "changed",
  inkrafttreten: "1866-01-01",
  ausserkrafttreten: null,
};

// ── docFilePath Tests ───────────────────────────────────────────────────

describe("ris-delta-watcher: docFilePath Bundesrecht", () => {
  it("erzeugt Pfad mit gnr-Unterverzeichnis und normKey", () => {
    const path = docFilePath(BRKONS_APP, baseDoc);
    expect(path).toContain("at-normen");
    expect(path).toContain("gnr-10001622");
    expect(path).toMatch(/p-1152\.md$/);
  });

  it("fällt auf doc.id zurück wenn kein APA", () => {
    const doc = { ...baseDoc, artikelParagraphAnlage: null };
    const path = docFilePath(BRKONS_APP, doc);
    expect(path).toMatch(/nor40060075\.md$/);
  });

  it("fällt auf slugified Kurztitel wenn keine Gesetzesnummer", () => {
    const doc = { ...baseDoc, gesetzesnummer: null, kurztitel: "Test Gesetz" };
    const path = docFilePath(BRKONS_APP, doc);
    expect(path).toContain("test-gesetz");
  });
});

describe("ris-delta-watcher: docFilePath Judikatur (KEIN Datum-Prefix)", () => {
  it("erzeugt Pfad OHNE Datum — nur slug.md", () => {
    const doc: DeltaDocument = {
      ...baseDoc,
      id: "JOR_2026_03_0016",
      applikation: "Justiz",
      geschaeftszahl: "1 Ob 123/24",
      artikelParagraphAnlage: null,
      gesetzesnummer: null,
      kurztitel: null,
    };
    const path = docFilePath(JUD_APP, doc);
    expect(path).toMatch(/1-ob-123-24\.md$/);
    expect(path).not.toMatch(/\d{4}-\d{2}-\d{2}-/);
  });

  it("ist deterministisch — gleiche GZ → gleicher Pfad auch bei changedAt-Wechsel", () => {
    const doc1: DeltaDocument = {
      ...baseDoc,
      id: "JOR_2026_03_0016",
      applikation: "Justiz",
      geschaeftszahl: "1 Ob 123/24",
      changedAt: "2026-03-15",
      artikelParagraphAnlage: null,
      gesetzesnummer: null,
      kurztitel: null,
    };
    const doc2 = { ...doc1, changedAt: "2026-08-01" };
    expect(docFilePath(JUD_APP, doc1)).toBe(docFilePath(JUD_APP, doc2));
  });
});

describe("ris-delta-watcher: docFilePath Landesrecht", () => {
  it("erzeugt Pfad mit gnr-Unterverzeichnis", () => {
    const doc: DeltaDocument = {
      ...baseDoc,
      applikation: "LrKons",
      gesetzesnummer: "50000123",
      artikelParagraphAnlage: "§ 5",
    };
    const path = docFilePath(LR_APP, doc);
    expect(path).toContain("at-landesrecht");
    expect(path).toContain("gnr-50000123");
    expect(path).toMatch(/p-5\.md$/);
  });
});

// ── buildStatuteMarkdown Tests ──────────────────────────────────────────

describe("ris-delta-watcher: buildStatuteMarkdown", () => {
  it("enthält title, gesetzesnummer, nor_id, content_hash im Frontmatter", () => {
    const md = buildStatuteMarkdown(baseDoc, "<xml>Test content</xml>");
    expect(md).toContain('title: "Testgesetz"');
    expect(md).toContain('gesetzesnummer: "10001622"');
    expect(md).toContain('nor_id: "NOR40060075"');
    expect(md).toContain("content_hash:");
  });

  it("enthält inkrafttretensdatum wenn vorhanden", () => {
    const md = buildStatuteMarkdown(baseDoc, "<xml>Test</xml>");
    expect(md).toContain('inkrafttretensdatum: "1866-01-01"');
  });

  it("enthält KEIN deprecated: true wenn Norm in Kraft", () => {
    const md = buildStatuteMarkdown(baseDoc, "<xml>Test</xml>");
    expect(md).not.toContain("deprecated: true");
  });

  it("enthält deprecated: true und ausserkrafttretensdatum wenn aufgehoben", () => {
    const doc = { ...baseDoc, ausserkrafttreten: "2020-12-31" };
    const md = buildStatuteMarkdown(doc, "<xml>Test</xml>");
    expect(md).toContain('ausserkrafttretensdatum: "2020-12-31"');
    expect(md).toContain("deprecated: true");
  });
});

describe("ris-delta-watcher: buildJudikaturMarkdown", () => {
  it("enthält case_number und court_type im Frontmatter", () => {
    const doc: DeltaDocument = {
      ...baseDoc,
      id: "JOR_2026_03_0016",
      applikation: "Justiz",
      geschaeftszahl: "1 Ob 123/24",
      artikelParagraphAnlage: null,
      gesetzesnummer: null,
      kurztitel: null,
    };
    const md = buildJudikaturMarkdown(doc, "<xml>Entscheidungstext</xml>");
    expect(md).toContain("case_number: 1 Ob 123/24");
    expect(md).toContain("court_type: justiz");
  });
});

describe("ris-delta-watcher: buildLandesrechtMarkdown", () => {
  it("enthält deprecated: true bei aufgehobener Landesnorm", () => {
    const doc: DeltaDocument = {
      ...baseDoc,
      applikation: "LrKons",
      gesetzesnummer: "50000123",
      ausserkrafttreten: "2021-06-30",
    };
    const md = buildLandesrechtMarkdown(doc, "<xml>Test</xml>");
    expect(md).toContain('ausserkrafttretensdatum: "2021-06-30"');
    expect(md).toContain("deprecated: true");
  });
});

// ── normKey Tests ───────────────────────────────────────────────────────

describe("ris-delta-watcher: normKey", () => {
  it("normalisiert § 1152 → p-1152", () => {
    expect(normKey("§ 1152")).toBe("p-1152");
  });

  it("normalisiert Art. 1 → art-1", () => {
    expect(normKey("Art. 1")).toBe("art-1");
  });

  it("normalisiert Anl. 3 → anl-3", () => {
    expect(normKey("Anl. 3")).toBe("anl-3");
  });

  it("gibt null zurück für § 0 (nur Metadaten)", () => {
    expect(normKey("§ 0")).toBeNull();
  });

  it("gibt null zurück für null-Input", () => {
    expect(normKey(null)).toBeNull();
  });

  it("kombiniert mehrere Bezeichnungen: Art. 1 § 2 → art-1-p-2", () => {
    expect(normKey("Art. 1 § 2")).toBe("art-1-p-2");
  });
});

// ── slugify Tests ───────────────────────────────────────────────────────

describe("ris-delta-watcher: slugify", () => {
  it("ersetzt Umlaute (ä→ae, ö→oe, ü→ue)", () => {
    expect(slugify("Grundbücher")).toBe("grundbuecher");
    expect(slugify("Österreich")).toBe("oesterreich");
  });

  it("ersetzt ß durch ss", () => {
    expect(slugify("Straßensachen")).toContain("ss");
  });

  it("limitiert auf 80 Zeichen", () => {
    const long = "a".repeat(200);
    expect(slugify(long).length).toBeLessThanOrEqual(80);
  });
});
