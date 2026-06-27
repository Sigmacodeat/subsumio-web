// @vitest-environment node

/**
 * Drift-Guard und Regressionstests für die GoBD-Bausteine.
 * `invoiceContentString` ist die geteilte Single-Source: Ausstellung
 * (invoicing/page.tsx) UND Verifikation (gobd-integrity-panel.tsx) bilden
 * ihren Hash-Eingabe-String hier. Ändert jemand Reihenfolge/Trennzeichen,
 * melden ALLE gespeicherten Rechnungen still „verändert seit Ausstellung",
 * ohne dass etwas crasht. Diese Tests pinnen das Format und beweisen die
 * Soll/Ist-Symmetrie.
 */
import { describe, test, expect } from "vitest";
import {
  retentionUntil,
  sha256Hex,
  sha256HexBytes,
  gobdFrontmatter,
  invoiceContentString,
  GOBD_RETENTION_YEARS,
  type InvoiceHashFields,
} from "./gobd";

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

  test("bekannter SHA-256-Vektor (nicht-leere Eingabe)", async () => {
    // NIST FIPS 180-2 Testvektor für "abc"
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
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

  test("leere Bytes-Eingabe liefert denselben Hash wie leerer String", async () => {
    const emptyBytes = new Uint8Array(0);
    expect(await sha256HexBytes(emptyBytes)).toBe(await sha256Hex(""));
  });

  test("Unicode-Eingabe (Umlaute, Sonderzeichen) ist deterministisch", async () => {
    const text = "Rechnung über Möblierung — Betrag: 1.234,56 €";
    const h1 = await sha256Hex(text);
    const h2 = await sha256Hex(text);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
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

  test("retentionUntil — Jahreswechsel (31.12. → 31.12.+10)", () => {
    expect(retentionUntil(new Date("2026-12-31T00:00:00Z"))).toBe("2036-12-31");
  });

  test("retentionUntil — Schaltjahr (29.02.2024 → 01.03.2034, JS Date overflow)", () => {
    // 29.02. + 10 Jahre: 2034 ist kein Schaltjahr, JS Date rollt auf 01.03. über.
    // Das ist korrektes JS-Verhalten (setFullYear auf nicht-Schaltjahr-Februar).
    expect(retentionUntil(new Date("2024-02-29T00:00:00Z"))).toBe("2034-03-01");
  });

  test("retentionUntil — Monatsende wird korrekt gehandhabt", () => {
    // 31.01. + 10 Jahre = 31.01.
    expect(retentionUntil(new Date("2026-01-31T00:00:00Z"))).toBe("2036-01-31");
    // 30.11. + 10 Jahre = 30.11.
    expect(retentionUntil(new Date("2026-11-30T00:00:00Z"))).toBe("2036-11-30");
  });

  test("gobdFrontmatter — Default-Datum (now) produziert gültige ISO-Daten", () => {
    const fm = gobdFrontmatter("hashxyz");
    expect(fm.gobd_retention).toBe(true);
    expect(fm.content_hash).toBe("hashxyz");
    // retention_until ist ein ISO-Datum (YYYY-MM-DD)
    expect(fm.retention_until).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // hashed_at ist ein ISO-8601-Timestamp
    expect(fm.hashed_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test("gobdFrontmatter — retention_until liegt exakt 10 Jahre in der Zukunft", () => {
    const now = new Date("2026-06-20T12:00:00Z");
    const fm = gobdFrontmatter("test", now);
    const expected = new Date(now);
    expected.setFullYear(expected.getFullYear() + 10);
    expect(fm.retention_until).toBe(expected.toISOString().split("T")[0]);
  });
});

describe("invoiceContentString — Edge Cases & Tampering", () => {
  test("leere items → leerer String im items-Teil", () => {
    const inv: InvoiceHashFields = {
      ...sampleInvoice,
      items: [],
    };
    const s = invoiceContentString(inv);
    // items sind leer → zwischen den ¦-Trennern steht nichts
    expect(s).toContain("¦¦");
  });

  test("keine expenses → leerer String im expenses-Teil", () => {
    const inv: InvoiceHashFields = {
      ...sampleInvoice,
      expenses: undefined,
    };
    const s = invoiceContentString(inv);
    // expenses fehlen → String endet ohne weiteren ¦-Teil
    expect(s).not.toContain("Gerichtskosten");
  });

  test("keine expenseTotal → 0 als Default", () => {
    const inv: InvoiceHashFields = {
      ...sampleInvoice,
      expenseTotal: undefined,
    };
    const s = invoiceContentString(inv);
    // expenseTotal defaultet zu 0
    expect(s).toContain("¦0¦");
  });

  test("kein advancePayment → 0 als Default", () => {
    const inv: InvoiceHashFields = {
      ...sampleInvoice,
      advancePayment: undefined,
    };
    const s = invoiceContentString(inv);
    expect(s).toContain("¦0¦");
  });

  test("Unicode in Rechnungsfeldern (Umlaute, €)", () => {
    const inv: InvoiceHashFields = {
      ...sampleInvoice,
      client: "Müller & Söhne GmbH — Köln €",
      items: [
        {
          date: "2026-06-01",
          description: "Beratung zum Urheberrecht § 97",
          hours: 1,
          rate: 250,
          amount: 250,
        },
      ],
    };
    const s = invoiceContentString(inv);
    expect(s).toContain("Müller & Söhne GmbH — Köln €");
    expect(s).toContain("§ 97");
  });

  test("Reihenfolge der items ist signifikant — vertauschte items ergeben anderen Hash", async () => {
    const inv1: InvoiceHashFields = {
      ...sampleInvoice,
      items: [sampleInvoice.items[0], sampleInvoice.items[1]],
    };
    const inv2: InvoiceHashFields = {
      ...sampleInvoice,
      items: [sampleInvoice.items[1], sampleInvoice.items[0]],
    };
    expect(invoiceContentString(inv1)).not.toBe(invoiceContentString(inv2));
  });

  test("Tampering: geänderter client → Hash weicht ab", async () => {
    const issued = await sha256Hex(invoiceContentString(sampleInvoice));
    const tampered = await sha256Hex(
      invoiceContentString({ ...sampleInvoice, client: "Acme GmbH GmbH" })
    );
    expect(tampered).not.toBe(issued);
  });

  test("Tampering: geändertes Datum → Hash weicht ab", async () => {
    const issued = await sha256Hex(invoiceContentString(sampleInvoice));
    const tampered = await sha256Hex(
      invoiceContentString({ ...sampleInvoice, date: "2026-06-14" })
    );
    expect(tampered).not.toBe(issued);
  });

  test("Tampering: geänderte Rechnungsnummer → Hash weicht ab", async () => {
    const issued = await sha256Hex(invoiceContentString(sampleInvoice));
    const tampered = await sha256Hex(
      invoiceContentString({ ...sampleInvoice, number: "R-2026-0002" })
    );
    expect(tampered).not.toBe(issued);
  });

  test("Tampering: hinzugefügte Auslage → Hash weicht ab", async () => {
    const issued = await sha256Hex(invoiceContentString(sampleInvoice));
    const tampered = await sha256Hex(
      invoiceContentString({
        ...sampleInvoice,
        expenses: [
          ...(sampleInvoice.expenses ?? []),
          { date: "2026-06-04", description: "Kopien", amount: 5 },
        ],
      })
    );
    expect(tampered).not.toBe(issued);
  });

  test("Tampering: entfernte Auslage → Hash weicht ab", async () => {
    const issued = await sha256Hex(invoiceContentString(sampleInvoice));
    const tampered = await sha256Hex(invoiceContentString({ ...sampleInvoice, expenses: [] }));
    expect(tampered).not.toBe(issued);
  });

  test("Tampering: geänderte Steuern → Hash weicht ab", async () => {
    const issued = await sha256Hex(invoiceContentString(sampleInvoice));
    const tampered = await sha256Hex(invoiceContentString({ ...sampleInvoice, tax: 191 }));
    expect(tampered).not.toBe(issued);
  });
});

describe("Round-Trip: Ausstellung → Speichern → Verifikation", () => {
  test("vollständiger Round-Trip wie in invoicing/page.tsx + gobd-integrity-panel.tsx", async () => {
    // 1. Ausstellung: Hash über invoiceContentString bilden
    const issuedAt = new Date("2026-06-20T10:00:00Z");
    const contentHash = await sha256Hex(invoiceContentString(sampleInvoice));

    // 2. Speichern: Frontmatter mit GoBD-Stempel
    const fm = gobdFrontmatter(contentHash, issuedAt);
    expect(fm.content_hash).toBe(contentHash);
    expect(fm.gobd_retention).toBe(true);

    // 3. Verifikation: Hash aus Frontmatter-Feldern neu rechnen
    // (simuliert invoiceFieldsFromFrontmatter + verifyInvoice)
    const recomputed = await sha256Hex(invoiceContentString(sampleInvoice));
    expect(recomputed).toBe(fm.content_hash);
  });

  test("Round-Trip mit nachträglicher Änderung → Verifikation schlägt fehl", async () => {
    // 1. Ausstellung
    const contentHash = await sha256Hex(invoiceContentString(sampleInvoice));

    // 2. Simulierte nachträgliche Änderung (z.B. durch Bearbeitung)
    const tamperedInvoice = { ...sampleInvoice, total: 9999 };
    const recomputed = await sha256Hex(invoiceContentString(tamperedInvoice));

    // 3. Verifikation erkennt Abweichung
    expect(recomputed).not.toBe(contentHash);
  });

  test("große Rechnung (50 Positionen) — Hash ist deterministisch", async () => {
    const largeItems = Array.from({ length: 50 }, (_, i) => ({
      date: `2026-06-${String(i + 1).padStart(2, "0")}`,
      description: `Leistung ${i + 1}`,
      hours: 1,
      rate: 200,
      amount: 200,
    }));
    const inv: InvoiceHashFields = {
      ...sampleInvoice,
      items: largeItems,
      subtotal: 10000,
      total: 11900,
      tax: 1900,
    };
    const h1 = await sha256Hex(invoiceContentString(inv));
    const h2 = await sha256Hex(invoiceContentString(inv));
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  test("Rechnung mit Null-Beträgen — Hash ist deterministisch", async () => {
    const inv: InvoiceHashFields = {
      number: "R-FREE-001",
      client: "Pro Bono Mandant",
      date: "2026-06-20",
      subtotal: 0,
      tax: 0,
      total: 0,
      items: [
        { date: "2026-06-20", description: "Pro Bono Beratung", hours: 0, rate: 0, amount: 0 },
      ],
    };
    const h1 = await sha256Hex(invoiceContentString(inv));
    const h2 = await sha256Hex(invoiceContentString(inv));
    expect(h1).toBe(h2);
  });
});
