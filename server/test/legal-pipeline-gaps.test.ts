import { describe, it, expect } from "vitest";

// We test the pure functions directly by importing them from the handler.
// Since the handler file is large and has side effects, we test the
// standalone functions that don't require engine/queue dependencies.

// ── Gap 2: AB-Bogen Kürzel-Dekodierung ──
// We test decodeAbbBogenKuerzel by importing it indirectly.
// Since the function is not exported, we test the behavior via a local copy
// of the dictionary and function for unit testing purposes.

const ABBOGEN_KUERZEL: Record<string, string> = {
  UH: "Untersuchungshaft",
  "U-Haft": "Untersuchungshaft",
  Einst: "Einstellung",
  "Einst.": "Einstellung",
  Vern: "Vernehmung",
  "Vern.": "Vernehmung",
  RA: "Rechtsanwalt",
  StA: "Staatsanwalt",
  Urg: "Urgenz",
  "Urg.": "Urgenz",
  Kal: "Kalkulation",
  Wo: "Wochen",
  Mo: "Monate",
  Tg: "Tage",
  Beschl: "Beschluss",
  "Beschl.": "Beschluss",
};

function decodeAbbBogenKuerzel(text: string): string {
  let result = text;
  const sortedKeys = Object.keys(ABBOGEN_KUERZEL).sort((a, b) => b.length - a.length);
  for (const kuerzel of sortedKeys) {
    const escaped = kuerzel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b(?!\\s*\\[)`, "g");
    result = result.replace(regex, `${kuerzel} [${ABBOGEN_KUERZEL[kuerzel]}]`);
  }
  return result;
}

// ── Gap 4: Doppelzählungs-Erkennung ──
interface DamageEntry {
  position: string;
  topf: string;
  betrag: number;
  waehrung: string;
  beleg_on: string;
  beleg_seite?: string;
  beleg_quote: string;
  status: string;
  begruendung: string;
}

function detectDamageOverlaps(entries: DamageEntry[]): string[] {
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      const key = `${i}-${j}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const reasons: string[] = [];

      if (a.topf === b.topf && a.betrag > 0 && b.betrag > 0) {
        const ratio = Math.min(a.betrag, b.betrag) / Math.max(a.betrag, b.betrag);
        if (ratio > 0.95) {
          reasons.push(
            `ähnlicher Betrag: ${a.betrag} vs ${b.betrag} (${(ratio * 100).toFixed(0)}% overlap)`
          );
        }
      }

      if (a.beleg_on && b.beleg_on && a.beleg_on === b.beleg_on) {
        reasons.push(`gleicher Beleg: ${a.beleg_on}`);
      }

      const tokensA = new Set(
        a.position
          .toLowerCase()
          .split(/\s+/)
          .filter((t) => t.length > 3)
      );
      const tokensB = new Set(
        b.position
          .toLowerCase()
          .split(/\s+/)
          .filter((t) => t.length > 3)
      );
      if (tokensA.size > 0 && tokensB.size > 0) {
        const intersection = [...tokensA].filter((t) => tokensB.has(t));
        const union = new Set([...tokensA, ...tokensB]);
        const overlap = intersection.length / union.size;
        if (overlap > 0.6) {
          reasons.push(
            `ähnliche Beschreibung: "${a.position}" vs "${b.position}" (${(overlap * 100).toFixed(0)}% overlap)`
          );
        }
      }

      if (reasons.length > 0) {
        warnings.push(
          `Mögliche Doppelzählung: "${a.position}" (${a.topf}, ${a.betrag} ${a.waehrung}) ↔ "${b.position}" (${b.topf}, ${b.betrag} ${b.waehrung}) — ${reasons.join(", ")}`
        );
      }
    }
  }
  return warnings;
}

describe("Gap 2: AB-Bogen Kürzel-Dekodierung", () => {
  it("decodes single abbreviation", () => {
    expect(decodeAbbBogenKuerzel("UH angeordnet")).toBe("UH [Untersuchungshaft] angeordnet");
  });

  it("decodes multiple abbreviations in one text", () => {
    const result = decodeAbbBogenKuerzel("UH für 3 Wo angeordnet, Beschl folgt");
    expect(result).toContain("UH [Untersuchungshaft]");
    expect(result).toContain("Wo [Wochen]");
    expect(result).toContain("Beschl [Beschluss]");
  });

  it("does not double-annotate already decoded abbreviations", () => {
    const once = decodeAbbBogenKuerzel("UH");
    const twice = decodeAbbBogenKuerzel(once);
    expect(twice).toBe(once);
  });

  it("preserves surrounding text", () => {
    const result = decodeAbbBogenKuerzel("Der StA beantragte UH für 2 Mo");
    expect(result).toContain("Der");
    expect(result).toContain("beantragte");
    expect(result).toContain("für");
    expect(result).toContain("2");
  });

  it("handles empty text", () => {
    expect(decodeAbbBogenKuerzel("")).toBe("");
  });

  it("handles text with no abbreviations", () => {
    expect(decodeAbbBogenKuerzel("Ein normaler Text ohne Abkürzungen")).toBe(
      "Ein normaler Text ohne Abkürzungen"
    );
  });

  it("prefers longer abbreviations over shorter ones", () => {
    // "U-Haft" should match before "UH" since it's longer
    const result = decodeAbbBogenKuerzel("U-Haft verhängt");
    expect(result).toContain("U-Haft [Untersuchungshaft]");
    // "UH" should NOT also be annotated inside "U-Haft"
    expect(result).not.toContain("UH [Untersuchungshaft] U-Haft");
  });
});

describe("Gap 4: Doppelzählungs-Erkennung (detectDamageOverlaps)", () => {
  const makeDamage = (overrides: Partial<DamageEntry>): DamageEntry => ({
    position: "Schadensposition",
    topf: "Materieller Schaden",
    betrag: 10000,
    waehrung: "EUR",
    beleg_on: "ON 1",
    beleg_quote: "Schaden von 10.000 EUR",
    status: "offen",
    begruendung: "Beleg durch Rechnung",
    ...overrides,
  });

  it("returns empty array for no entries", () => {
    expect(detectDamageOverlaps([])).toEqual([]);
  });

  it("returns empty array for single entry", () => {
    expect(detectDamageOverlaps([makeDamage({})])).toEqual([]);
  });

  it("detects same amount in same topf", () => {
    const entries = [
      makeDamage({ position: "Materialschaden A", betrag: 10000 }),
      makeDamage({ position: "Materialschaden B", betrag: 10000 }),
    ];
    const warnings = detectDamageOverlaps(entries);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("ähnlicher Betrag");
  });

  it("detects same beleg_on", () => {
    const entries = [
      makeDamage({ position: "Position A", beleg_on: "ON 5", betrag: 5000 }),
      makeDamage({ position: "Position B", beleg_on: "ON 5", betrag: 8000 }),
    ];
    const warnings = detectDamageOverlaps(entries);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("gleicher Beleg");
  });

  it("detects similar position descriptions", () => {
    const entries = [
      makeDamage({ position: "Materialschaden Fahrzeug Unfall", betrag: 5000 }),
      makeDamage({ position: "Materialschaden Fahrzeug Unfall", betrag: 8000, beleg_on: "ON 2" }),
    ];
    const warnings = detectDamageOverlaps(entries);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("ähnliche Beschreibung");
  });

  it("does not flag entries in different topf with different amounts", () => {
    const entries = [
      makeDamage({
        position: "Reparaturkosten Fahrzeug",
        topf: "Materieller Schaden",
        betrag: 5000,
        beleg_on: "ON 1",
      }),
      makeDamage({
        position: "Schmerzengeld Anspruch",
        topf: "Immaterieller Schaden",
        betrag: 8000,
        beleg_on: "ON 2",
      }),
    ];
    expect(detectDamageOverlaps(entries)).toEqual([]);
  });

  it("does not flag entries with amounts differing more than 5%", () => {
    const entries = [
      makeDamage({ position: "Position A", betrag: 10000 }),
      makeDamage({ position: "Position B", betrag: 11000 }),
    ];
    // ratio = 10000/11000 = 0.909 < 0.95, no amount overlap
    // But same beleg_on "ON 1" will trigger
    const warnings = detectDamageOverlaps(entries);
    expect(warnings.some((w) => w.includes("ähnlicher Betrag"))).toBe(false);
  });
});
