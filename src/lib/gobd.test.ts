/**
 * Drift-Guard für die GoBD-Bausteine. `invoiceContentString` ist die geteilte
 * Single-Source: Ausstellung (invoicing/page.tsx) UND Verifikation
 * (gobd-integrity-panel.tsx) bilden ihren Hash-Eingabe-String hier. Ändert
 * jemand Reihenfolge/Trennzeichen, melden ALLE gespeicherten Rechnungen still
 * „verändert seit Ausstellung", ohne dass etwas crasht. Dieser Test pinnt das
 * Format und beweist die Soll/Ist-Symmetrie.
 *
 * Lauf: `(cd /tmp && bun test /Users/…/src/lib/gobd.test.ts)`
 * Hinweis: NICHT aus dem Repo-Root `bun test` aufrufen — die Root-`bunfig.toml`
 * gehört zur subsumio-Engine (Preload relativ zum cwd → nur aus `server/` gültig)
 * und bricht Frontend-Läufe mit „preload not found". Das Frontend hat (noch)
 * keinen eigenen Test-Harness; daher der Lauf aus einem cwd ohne diese bunfig.
 */
import { test, expect, describe } from "bun:test";
import {
  retentionUntil,
  sha256Hex,
  sha256HexBytes,
  gobdFrontmatter,
  invoiceContentString,
  GOBD_RETENTION_YEARS,
  type InvoiceHashFields,
} from "./gobd.ts";

const sampleInvoice: InvoiceHashFields = {
  number: "R-2026-0001",
  client: "Acme GmbH",
  caseNumber: "AZ-42",
  date: "2026-06-13",
  subtotal: 1000,
  expenseTotal: 50,
  advancePayment: 100,
  tax: 190,
  total: 1140,
  items: [
    { date: "2026-06-01", description: "Beratung", hours: 2, rate: 200, amount: 400 },
    { date: "2026-06-02", description: "Schriftsatz", hours: 3, rate: 200, amount: 600 },
  ],
  expenses: [{ date: "2026-06-03", description: "Gerichtskosten-Auslage", amount: 50 }],
};

describe("invoiceContentString — kanonischer String (Hash-Vertrag)", () => {
  test("pinnt das exakte Format (Drift-Guard)", () => {
    // Wird dieser Erwartungswert „nur angepasst", sind alle Alt-Hashes ungültig.
    // Bricht der Test, ist das eine bewusste, breaking Entscheidung — kein Reflex-Fix.
    const expected =
      "R-2026-0001¦Acme GmbH¦AZ-42¦2026-06-13¦1000¦50¦100¦190¦1140¦" +
      "2026-06-01|Beratung|2|200|400;2026-06-02|Schriftsatz|3|200|600¦" +
      "2026-06-03|Gerichtskosten-Auslage|50";
    expect(invoiceContentString(sampleInvoice)).toBe(expected);
  });

  test("leeres caseNumber → leeres Feld, nicht 'undefined'", () => {
    const { caseNumber: _omit, ...rest } = sampleInvoice;
    expect(_omit).toBe("AZ-42");
    expect(invoiceContentString(rest)).toContain("¦Acme GmbH¦¦2026-06-13¦");
  });

  test("deterministisch — gleiche Eingabe, gleicher String", () => {
    expect(invoiceContentString(sampleInvoice)).toBe(invoiceContentString(sampleInvoice));
  });
});

describe("Verifikations-Symmetrie (Soll/Ist)", () => {
  test("unveränderte Rechnung → Hash matcht (grün)", async () => {
    const issued = await sha256Hex(invoiceContentString(sampleInvoice));
    const recomputed = await sha256Hex(invoiceContentString(sampleInvoice));
    expect(recomputed).toBe(issued);
  });

  test("geänderter Betrag → Hash weicht ab (rot)", async () => {
    const issued = await sha256Hex(invoiceContentString(sampleInvoice));
    const tampered = await sha256Hex(invoiceContentString({ ...sampleInvoice, total: 9999 }));
    expect(tampered).not.toBe(issued);
  });

  test("geänderte Position → Hash weicht ab (rot)", async () => {
    const issued = await sha256Hex(invoiceContentString(sampleInvoice));
    const tampered = await sha256Hex(
      invoiceContentString({
        ...sampleInvoice,
        items: [{ ...sampleInvoice.items[0], amount: 1 }, sampleInvoice.items[1]],
      })
    );
    expect(tampered).not.toBe(issued);
  });
});

describe("sha256Hex / sha256HexBytes", () => {
  test("bekannter SHA-256-Vektor (leere Eingabe)", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });

  test("String- und Byte-Pfad liefern denselben Hash", async () => {
    const text = "Beleg-Inhalt";
    const viaString = await sha256Hex(text);
    const viaBytes = await sha256HexBytes(new TextEncoder().encode(text));
    expect(viaBytes).toBe(viaString);
  });

  test("ArrayBuffer- und Uint8Array-Eingabe sind äquivalent", async () => {
    const bytes = new TextEncoder().encode("Datei");
    const fromView = await sha256HexBytes(bytes);
    const fromBuffer = await sha256HexBytes(bytes.buffer.slice(0));
    expect(fromBuffer).toBe(fromView);
  });
});

describe("retentionUntil / gobdFrontmatter", () => {
  test("Aufbewahrung = +10 Jahre (§ 147 AO)", () => {
    expect(GOBD_RETENTION_YEARS).toBe(10);
    expect(retentionUntil(new Date("2026-06-13T00:00:00Z"))).toBe("2036-06-13");
  });

  test("Frontmatter trägt Hash + Frist + Zeitstempel", () => {
    const fm = gobdFrontmatter("abc123", new Date("2026-06-13T10:00:00Z"));
    expect(fm).toMatchObject({
      gobd_retention: true,
      retention_until: "2036-06-13",
      content_hash: "abc123",
    });
    expect(fm.hashed_at).toBe("2026-06-13T10:00:00.000Z");
  });
});
