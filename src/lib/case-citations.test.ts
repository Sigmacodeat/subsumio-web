// @vitest-environment node

import { describe, test, expect, vi, beforeEach } from "vitest";
import { extractCaseCitations } from "@/lib/case-citations";
import { linkCitationsInHtml } from "@/lib/citation-gate-client";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  const readFile = vi.fn();
  const readdir = vi.fn();
  return {
    ...actual,
    default: { ...actual, promises: { readFile, readdir } },
    promises: { readFile, readdir },
  };
});

import { promises as fs } from "node:fs";
import { groundCaseCitations, keysForFilename } from "@/lib/case-grounding";

const cited = (t: string) => extractCaseCitations(t).map((c) => `${c.court}:${c.cited}`);

describe("extractCaseCitations", () => {
  test("OGH Geschäftszahlen in the usual spellings", () => {
    expect(cited("OGH 1 Ob 49/01i; 9 ObA 89/05m; 10ObS159/88")).toEqual([
      "OGH:1 Ob 49/01i",
      "OGH:9 ObA 89/05m",
      "OGH:10 ObS 159/88",
    ]);
  });

  test("RIS-Justiz Rechtssätze", () => {
    expect(cited("stRsp (RIS-Justiz RS0115754, RS 0038140)")).toEqual([
      "RIS-Justiz:RS0115754",
      "RIS-Justiz:RS0038140",
    ]);
  });

  test("VwGH new and old style; a date between court and Zahl is fine", () => {
    expect(cited("VwGH Ra 2018/07/0485")).toEqual(["VwGH:Ra 2018/07/0485"]);
    expect(cited("VwGH 22.10.1992, 92/03/0085")).toEqual(["VwGH:92/03/0085"]);
  });

  test("the tail of a Ra-Zahl is not read a second time as an old-style Zahl", () => {
    expect(cited("VwGH 3.1.2019, Ra 2018/07/0485")).toEqual(["VwGH:Ra 2018/07/0485"]);
  });

  test("VfGH only with the court named", () => {
    expect(cited("VfGH 11.3.2020, G 193/2008")).toEqual(["VfGH:G 193/2008"]);
    expect(cited("siehe S 12/2020")).toEqual([]);
  });

  test("dates and plain fractions are not Geschäftszahlen", () => {
    expect(cited("fällig am 12/05/2020, Quote 3/4")).toEqual([]);
  });
});

describe("keysForFilename", () => {
  test("date-prefixed decision files", () => {
    expect(keysForFilename("2001-10-22-1ob49-01i.md")).toEqual(["1ob49-01i"]);
    expect(keysForFilename("2019-01-03-ra-2018-07-0485.md")).toEqual(["ra-2018-07-0485"]);
  });

  test("Rechtssatz files resolve to their RS number", () => {
    expect(keysForFilename("ecli-at-ogh0002-2001-rs0115754.md")).toEqual(["rs0115754"]);
  });

  test("joined VfGH cases are findable by each Zahl", () => {
    expect(keysForFilename("2001-12-20-a14-01-a15-01.md")).toEqual(
      expect.arrayContaining(["a14-01", "a15-01"])
    );
  });
});

describe("groundCaseCitations", () => {
  beforeEach(() => {
    vi.mocked(fs.readdir).mockReset();
    vi.mocked(fs.readFile).mockReset();
  });

  test("a Zahl in the corpus is verified with its exact RIS document", async () => {
    vi.mocked(fs.readdir).mockResolvedValue(["2001-10-22-1ob49-01i.md"] as never);
    vi.mocked(fs.readFile).mockResolvedValue(
      [
        "---",
        'source_url: "https://ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJT_1"',
        'dokumenttyp: "Entscheidungstext"',
        'entscheidungsdatum: "2001-10-22"',
        "---",
        "## Text",
        "Der Oberste Gerichtshof hat entschieden.",
      ].join("\n") as never
    );
    const [c] = await groundCaseCitations(extractCaseCitations("OGH 1 Ob 49/01i"));
    expect(c.verified).toBe(true);
    expect(c.category).toBe("judikatur");
    expect(c.source_url).toBe(
      "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=JJT_1"
    );
    expect(c.source_text).toBe("Der Oberste Gerichtshof hat entschieden.");
  });

  test("an unknown Zahl is unverified and carries a RIS search link, not a document link", async () => {
    vi.mocked(fs.readdir).mockResolvedValue([] as never);
    const [c] = await groundCaseCitations(extractCaseCitations("OGH 4 Ob 999/99z"));
    expect(c.verified).toBe(false);
    expect(c.source_url).toBeUndefined();
    expect(c.search_url).toBe(
      "https://www.ris.bka.gv.at/Ergebnis.wxe?Abfrage=Justiz&GZ=4Ob999%2F99z"
    );
  });
});

describe("linkCitationsInHtml — decisions", () => {
  const ogh = {
    code: "OGH",
    paragraph: "1 Ob 49/01i",
    verified: true,
    category: "judikatur" as const,
    source_url: "https://www.ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=X",
  };

  test("links the cited Zahl in either spelling, without reader data-*", () => {
    const out = linkCitationsInHtml("<p>OGH 1Ob49/01i</p>", [ogh]);
    expect(out).toContain(">1Ob49/01i</a>");
    expect(out).not.toContain("data-code");
  });

  test("does not link a different senate that merely ends the same", () => {
    expect(linkCitationsInHtml("<p>11 Ob 49/01i</p>", [ogh])).toBe("<p>11 Ob 49/01i</p>");
  });

  test("unverified decisions stay plain text", () => {
    expect(linkCitationsInHtml("<p>1 Ob 49/01i</p>", [{ ...ogh, verified: false }])).toBe(
      "<p>1 Ob 49/01i</p>"
    );
  });
});
