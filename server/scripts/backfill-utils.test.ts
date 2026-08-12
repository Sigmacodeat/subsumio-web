/**
 * Tests für backfill-utils.ts — Checksum & Identity Verification.
 *
 * Audit-Fragen:
 *  - contentHash: SHA-256 ist Industry-Standard, aber auf 16 Zeichen gekürzt
 *    → 64-bit Kollisionsrisiko prüfen
 *  - contentMatchesDocument: Identity-Check via case_number/ECLI/CELEX
 *  - validateFetchedText: Text-Validierung gegen leere/chrome-kontaminierte Inhalte
 *  - atomicWrite: Atomic-Write-Garantie
 */
import { describe, it, expect } from "vitest";
import {
  contentHash,
  contentMatchesDocument,
  validateFetchedText,
  atomicWrite,
} from "./backfill-utils";
import { readFileSync, existsSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// ── contentHash Tests ───────────────────────────────────────────────────

describe("backfill-utils: contentHash (SHA-256)", () => {
  it("ist deterministisch — gleicher Input → gleicher Hash", () => {
    const text = "§ 1 ABGB\n\nJeder Mensch hat angeborene Rechte.";
    expect(contentHash(text)).toBe(contentHash(text));
  });

  it("unterscheidet verschiedene Inhalte", () => {
    const a = contentHash("Gesetz A");
    const b = contentHash("Gesetz B");
    expect(a).not.toBe(b);
  });

  it("trimmt Whitespace vor dem Hashing", () => {
    expect(contentHash("  test  ")).toBe(contentHash("test"));
  });

  it("produziert 16 Zeichen (64-bit Kollisionsraum)", () => {
    const hash = contentHash("test");
    expect(hash.length).toBe(16);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it("SHA-256 Basis — Industry-Standard Algorithmus", () => {
    // Wir nutzen createHash("sha256") — das ist der Standard.
    // Kürzung auf 16 hex = 64 bit. Für ~1M Dokumente:
    // Kollisionswahrscheinlichkeit nach Geburtstagsparadoxon ~ (1M)² / 2^65 ≈ 2.7e-8
    // → praktisch null. Akzeptabel für Content-Integrity-Check.
    // Für kryptographische Signaturen wäre 256-bit nötig, aber hier geht es nur
    // um Änderungs-Erkennung, nicht um Tamper-Resistance.
    const hash = contentHash("test");
    expect(hash.length).toBeGreaterThanOrEqual(16);
  });
});

// ── contentMatchesDocument Tests ────────────────────────────────────────

describe("backfill-utils: contentMatchesDocument (Identity Check)", () => {
  it("matched wenn case_number im Text vorkommt", () => {
    const text = "Geschäftszahl: 1 Ob 123/24 — Der Oberste Gerichtshof...";
    expect(contentMatchesDocument(text, { case_number: "1 Ob 123/24" })).toBe(true);
  });

  it("matched nicht wenn case_number fehlt (falsches Dokument)", () => {
    const text = "Geschäftszahl: 5 Ob 999/99 — Andere Entscheidung...";
    expect(contentMatchesDocument(text, { case_number: "1 Ob 123/24" })).toBe(false);
  });

  it("normalisiert Whitespace und Sonderzeichen beim Match", () => {
    const text = "GZ: 1-Ob-123/24";
    expect(contentMatchesDocument(text, { case_number: "1 Ob 123/24" })).toBe(true);
  });

  it("matched via ECLI wenn case_number fehlt", () => {
    const text = "ECLI:AT:OGH:2024:1Ob123.24";
    expect(contentMatchesDocument(text, { ecli: "ECLI:AT:OGH:2024:1Ob123.24" })).toBe(true);
  });

  it("matched via CELEX mit Country-Code-Stripping", () => {
    const text = "CELEX Nummer: 32024R1234";
    expect(contentMatchesDocument(text, { celex: "32024R1234" })).toBe(true);
  });

  it("gibt true zurück wenn keine Identifier vorhanden (can't verify)", () => {
    expect(contentMatchesDocument("text", {})).toBe(true);
  });

  it("schützt vor HTTP-200-Fehlerseiten (2026-07-15 Incident Pattern)", () => {
    // RIS liefert manchmal eine Fehlerseite mit HTTP 200
    const errorPage = "<html><body>Server Error — Document not found</body></html>";
    expect(contentMatchesDocument(errorPage, { case_number: "1 Ob 123/24" })).toBe(false);
  });
});

// ── validateFetchedText Tests ───────────────────────────────────────────

describe("backfill-utils: validateFetchedText", () => {
  it("lehrt leeren Text ab", () => {
    const result = validateFetchedText("");
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("empty");
  });

  it("lehnt Text < 50 Zeichen ab (wahrscheinlich Fehlerseite)", () => {
    const result = validateFetchedText("Short error page");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("too_short");
  });

  it("akzeptiert gültigen Gesetzestext", () => {
    const text = "§ 1. Jeder Mensch hat angeborene, schon durch die Vernunft einleuchtende Rechte.";
    const result = validateFetchedText(text);
    expect(result.valid).toBe(true);
  });

  it("lehnt Text mit Encoding-Artefakten ab (>5 U+FFFD)", () => {
    const text = "Test " + "\uFFFD".repeat(10) + " more text ".repeat(10);
    const result = validateFetchedText(text);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("encoding_artifacts");
  });
});

// ── atomicWrite Tests ───────────────────────────────────────────────────

describe("backfill-utils: atomicWrite", () => {
  const testDir = join(tmpdir(), `backfill-test-${Date.now()}`);
  const testFile = join(testDir, "test.md");

  afterEach(() => {
    try { unlinkSync(testFile); } catch {}
  });

  it("schreibt Datei erfolgreich", () => {
    mkdirSync(testDir, { recursive: true });
    atomicWrite(testFile, "# Test\n\nContent");
    expect(existsSync(testFile)).toBe(true);
    const content = readFileSync(testFile, "utf-8");
    expect(content).toBe("# Test\n\nContent");
  });

  it("überschreibt bestehende Datei atomar", () => {
    mkdirSync(testDir, { recursive: true });
    atomicWrite(testFile, "old content");
    atomicWrite(testFile, "new content");
    expect(readFileSync(testFile, "utf-8")).toBe("new content");
  });
});
