import { describe, expect, it } from "vitest";
import {
  caseNumberKey,
  findeGeschaeftszahlen,
  geschaeftszahlKey,
  gleicheGeschaeftszahl,
  ordneAktenzahlZu,
  parseGeschaeftszahl,
  textNenntAktenzahl,
} from "./geschaeftszahl";
// Engine copy of the same rules — must stay in step (no imports, pure TS).
import {
  findeGZImText,
  gleicheGZ,
  gzSchluessel,
  normalisiereGZ,
} from "../../../server/src/core/legal/gz-validate";

describe("parseGeschaeftszahl", () => {
  it.each([
    ["12 Cg 34/25x", "12cg34/25x"],
    ["12Cg34/25x", "12cg34/25x"],
    ["12 CG 34 / 25X", "12cg34/25x"],
    ["1Cg3/25a", "1cg3/25a"],
    ["3 Ob 12/24k", "3ob12/24k"],
    ["12 Cg 34-25x", "12cg34/25x"],
    ["10 C 125/95t - 2", "10c125/95t"],
    ["4 O 1234/2023", "4o1234/2023"],
    ["12 Cg 34/25", "12cg34/25"],
  ])("%s → %s", (raw, key) => {
    const t = parseGeschaeftszahl(raw);
    expect(t).not.toBeNull();
    expect(geschaeftszahlKey(t!)).toBe(key);
  });

  it("keeps the Prüfbuchstabe and renders a canonical form", () => {
    const hits = findeGeschaeftszahlen("GZ: 12Cg34/25X");
    expect(hits[0]!.formatted).toBe("12 Cg 34/25x");
  });

  it("is null for internal numbers and prose", () => {
    expect(parseGeschaeftszahl("2026-001")).toBeNull();
    expect(parseGeschaeftszahl("Mietvertrag Huber")).toBeNull();
    expect(parseGeschaeftszahl(undefined)).toBeNull();
  });
});

describe("gleicheGeschaeftszahl", () => {
  const p = (s: string) => parseGeschaeftszahl(s)!;
  it("different Prüfbuchstaben are different numbers", () => {
    expect(gleicheGeschaeftszahl(p("1 Cg 3/25a"), p("1 Cg 3/25b"))).toBe(false);
  });
  it("a number written without the Prüfbuchstabe still matches", () => {
    expect(gleicheGeschaeftszahl(p("12 Cg 34/25"), p("12 Cg 34/25x"))).toBe(true);
  });
  it("different Abteilung never matches", () => {
    expect(gleicheGeschaeftszahl(p("11 Cg 3/25a"), p("1 Cg 3/25a"))).toBe(false);
  });
});

describe("textNenntAktenzahl", () => {
  it("whole tokens only: 11 Cg 3/25a does not name 1 Cg 3/25a", () => {
    expect(textNenntAktenzahl("11 Cg 3/25a – Ladung", "1 Cg 3/25a")).toBe(false);
  });
  it("tolerates missing spaces and case", () => {
    expect(textNenntAktenzahl("AW: 1Cg3/25A Ladung", "1 Cg 3/25a")).toBe(true);
  });
  it("internal Aktenzahlen match as a whole token, not inside a longer number", () => {
    expect(textNenntAktenzahl("Unser Zeichen 2026-001, Mahnung", "2026-001")).toBe(true);
    expect(textNenntAktenzahl("Unser Zeichen 2026-0012", "2026-001")).toBe(false);
  });
});

describe("ordneAktenzahlZu", () => {
  const cases = [
    { slug: "a", case_number: "1 Cg 3/25a" },
    { slug: "b", case_number: "11 Cg 3/25a" },
    { slug: "c", case_number: "3 Ob 12/24k" },
  ];
  it("exactly one hit is eindeutig", () => {
    expect(ordneAktenzahlZu("Betreff 11 Cg 3/25a", cases)).toEqual({
      status: "eindeutig",
      treffer: [cases[1]],
    });
  });
  it("two matters with the same number are mehrdeutig", () => {
    const dup = [...cases, { slug: "d", case_number: "3Ob12/24k" }];
    expect(ordneAktenzahlZu("OGH 3 Ob 12/24k", dup).status).toBe("mehrdeutig");
  });
  it("nothing named is keine", () => {
    expect(ordneAktenzahlZu("Allgemeine Anfrage", cases).status).toBe("keine");
  });
});

describe("caseNumberKey", () => {
  it("normalises Geschäftszahlen and plain Aktenzahlen", () => {
    expect(caseNumberKey("12 Cg 34/25x")).toBe(caseNumberKey("12Cg34/25X"));
    expect(caseNumberKey(" 2026 - 001 ")).toBe("2026-001");
    expect(caseNumberKey(null)).toBe("");
  });
});

describe("engine parity (server gz-validate)", () => {
  const samples = [
    "12 Cg 34/25x",
    "1Cg3/25a",
    "3 Ob 12/24k",
    "12 CG 34 / 25X",
    "12 Cg 34-25x",
    "4 O 1234/2023",
    "2026-001",
    "keine Zahl",
  ];
  it.each(samples)("parse %s identically", (s) => {
    const web = parseGeschaeftszahl(s);
    const engine = normalisiereGZ(s);
    expect(engine ? gzSchluessel(engine) : null).toBe(web ? geschaeftszahlKey(web) : null);
  });
  it("text search and equality agree", () => {
    const text = "Betreff: 11 Cg 3/25a und 3Ob12/24K sowie Az 7 C 12-19";
    expect(findeGZImText(text).map((f) => f.formatted)).toEqual(
      findeGeschaeftszahlen(text).map((f) => f.formatted)
    );
    const a = normalisiereGZ("12 Cg 34/25")!;
    const b = normalisiereGZ("12 Cg 34/25x")!;
    expect(gleicheGZ(a, b)).toBe(
      gleicheGeschaeftszahl(
        parseGeschaeftszahl("12 Cg 34/25")!,
        parseGeschaeftszahl("12 Cg 34/25x")!
      )
    );
  });
});
