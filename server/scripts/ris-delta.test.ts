/**
 * Unit-Tests für ris-delta.ts — RIS OGD Delta-Abfrage.
 *
 * Deckt die kritischen Datenqualitäts-Fixes ab:
 *  - BrKons/LrKons Metadaten-Extraktion (Gesetzesnummer, APA, Inkraft/Ausserkraft)
 *  - In-Kraft-Filter (deprecated-Marker)
 *  - chooseImRisSeit Cursor-Logik
 *  - parseRef Identity-Extraktion (Judikatur Geschäftszahl)
 */
import { describe, it, expect } from "vitest";
import { parseRef, chooseImRisSeit, DELTA_APPLIKATIONS } from "./ris-delta";

// ── Fixtures: realistische RIS OGD DocumentReferences ───────────────────

const BRKONS_REF = {
  Data: {
    Metadaten: {
      Technisch: { ID: "NOR40060075", ND: "1" },
      Allgemein: {
        Geaendert: "2026-08-01T00:00:00",
        Veroeffentlicht: null,
        DokumentUrl: "https://www.ris.bka.gv.at/Dokumente/Bundesnormen/NOR40060075/NOR40060075.html",
      },
      Bundesrecht: {
        Kurztitel: "Allgemeines bürgerliches Gesetzbuch",
        BrKons: {
          Gesetzesnummer: "10001622",
          ArtikelParagraphAnlage: "§ 1152",
          Inkrafttretensdatum: "1866-01-01",
          Ausserkrafttretensdatum: null,
        },
      },
    },
    Dokumentliste: {
      ContentReference: {
        ContentType: "MainDocument",
        Urls: {
          ContentUrl: [
            { DataType: "Xml", Url: "https://www.ris.bka.gv.at/Dokumente/Bundesnormen/NOR40060075/NOR40060075.xml" },
            { DataType: "Html", Url: "https://www.ris.bka.gv.at/Dokumente/Bundesnormen/NOR40060075/NOR40060075.html" },
          ],
        },
      },
    },
  },
};

const BRKONS_AUSSERKRAFT_REF = {
  Data: {
    Metadaten: {
      Technisch: { ID: "NOR12345678" },
      Allgemein: {
        Geaendert: "2026-07-15T00:00:00",
        Veroeffentlicht: null,
        DokumentUrl: "https://www.ris.bka.gv.at/Dokumente/Bundesnormen/NOR12345678/NOR12345678.html",
      },
      Bundesrecht: {
        Kurztitel: "Alte Verordnung (aufgehoben)",
        BrKons: {
          Gesetzesnummer: "20001234",
          ArtikelParagraphAnlage: "§ 1",
          Inkrafttretensdatum: "1980-01-01",
          Ausserkrafttretensdatum: "2020-12-31",
        },
      },
    },
    Dokumentliste: {
      ContentReference: {
        ContentType: "MainDocument",
        Urls: { ContentUrl: [{ DataType: "Xml", Url: "https://example.com/old.xml" }] },
      },
    },
  },
};

const LRKONS_REF = {
  Data: {
    Metadaten: {
      Technisch: { ID: "NOR50012345" },
      Allgemein: {
        Geaendert: "2026-08-10T00:00:00",
        Veroeffentlicht: null,
        DokumentUrl: "https://www.ris.bka.gv.at/Dokumente/Landesnormen/NOR50012345/NOR50012345.html",
      },
      Landesrecht: {
        Kurztitel: "Wiener Baugesetz",
        LrKons: {
          Gesetzesnummer: "50000123",
          ArtikelParagraphAnlage: "§ 5",
          Inkrafttretensdatum: "2020-01-01",
          Ausserkrafttretensdatum: null,
        },
      },
    },
    Dokumentliste: {
      ContentReference: {
        ContentType: "MainDocument",
        Urls: { ContentUrl: [{ DataType: "Xml", Url: "https://example.com/lr.xml" }] },
      },
    },
  },
};

const JUDIKATUR_REF = {
  Data: {
    Metadaten: {
      Technisch: { ID: "JOR_2026_03_0016" },
      Allgemein: {
        Geaendert: null,
        Veroeffentlicht: "2026-03-15T00:00:00",
        DokumentUrl: "https://www.ris.bka.gv.at/Jus/entscheidung/JOR_2026_03_0016.html",
      },
      Judikatur: {
        Kurztitel: "Testentscheidung",
        Geschaeftszahl: { item: ["1 Ob 123/24"] },
        ArtikelParagraphAnlage: null,
      },
    },
    Dokumentliste: {
      ContentReference: {
        ContentType: "MainDocument",
        Urls: { ContentUrl: [{ DataType: "Xml", Url: "https://example.com/jud.xml" }] },
      },
    },
  },
};

const JUDIKATUR_REF_GZ_ARRAY = {
  Data: {
    Metadaten: {
      Technisch: { ID: "JOR_2026_04_0022" },
      Allgemein: {
        Geaendert: "2026-04-20T00:00:00",
        Veroeffentlicht: "2026-04-20T00:00:00",
        DokumentUrl: "https://www.ris.bka.gv.at/Jus/entscheidung/JOR_2026_04_0022.html",
      },
      Judikatur: {
        Kurztitel: "VwGH Entscheidung",
        Geschaeftszahl: { item: ["Ra 2024/05/0012", "Ra 2024/05/0013"] },
        ArtikelParagraphAnlage: null,
      },
    },
    Dokumentliste: {
      ContentReference: {
        ContentType: "MainDocument",
        Urls: { ContentUrl: [{ DataType: "Xml", Url: "https://example.com/vwgh.xml" }] },
      },
    },
  },
};

// ── Tests ───────────────────────────────────────────────────────────────

describe("ris-delta: parseRef BrKons Extraktion", () => {
  it("extrahiert Gesetzesnummer aus meta.Bundesrecht.BrKons (nicht direkt aus Bundesrecht)", () => {
    const parsed = parseRef(BRKONS_REF, "BrKons");
    expect(parsed).not.toBeNull();
    expect(parsed!.gesetzesnummer).toBe("10001622");
    expect(parsed!.artikelParagraphAnlage).toBe("§ 1152");
  });

  it("extrahiert Kurztitel aus meta.Bundesrecht (direkt, nicht BrKons)", () => {
    const parsed = parseRef(BRKONS_REF, "BrKons");
    expect(parsed!.kurztitel).toBe("Allgemeines bürgerliches Gesetzbuch");
  });

  it("extrahiert Inkrafttretensdatum", () => {
    const parsed = parseRef(BRKONS_REF, "BrKons");
    expect(parsed!.inkrafttreten).toBe("1866-01-01");
  });

  it("setzt ausserkrafttreten auf null wenn Norm in Kraft", () => {
    const parsed = parseRef(BRKONS_REF, "BrKons");
    expect(parsed!.ausserkrafttreten).toBeNull();
  });

  it("extrahiert Ausserkrafttretensdatum für aufgehobene Normen", () => {
    const parsed = parseRef(BRKONS_AUSSERKRAFT_REF, "BrKons");
    expect(parsed!.ausserkrafttreten).toBe("2020-12-31");
  });

  it("extrahiert XML- und HTML-URL aus ContentReference", () => {
    const parsed = parseRef(BRKONS_REF, "BrKons");
    expect(parsed!.xmlUrl).toContain("NOR40060075.xml");
    expect(parsed!.htmlUrl).toContain("NOR40060075.html");
  });

  it("changeType = 'changed' wenn Geaendert gesetzt, Veroeffentlicht null", () => {
    const parsed = parseRef(BRKONS_REF, "BrKons");
    expect(parsed!.changeType).toBe("changed");
  });
});

describe("ris-delta: parseRef LrKons Extraktion", () => {
  it("extrahiert Gesetzesnummer aus meta.Landesrecht.LrKons", () => {
    const parsed = parseRef(LRKONS_REF, "LrKons");
    expect(parsed).not.toBeNull();
    expect(parsed!.gesetzesnummer).toBe("50000123");
    expect(parsed!.artikelParagraphAnlage).toBe("§ 5");
  });

  it("extrahiert Inkrafttretensdatum für Landesrecht", () => {
    const parsed = parseRef(LRKONS_REF, "LrKons");
    expect(parsed!.inkrafttreten).toBe("2020-01-01");
    expect(parsed!.ausserkrafttreten).toBeNull();
  });
});

describe("ris-delta: parseRef Judikatur", () => {
  it("extrahiert Geschäftszahl aus item (single string)", () => {
    const parsed = parseRef(JUDIKATUR_REF, "Justiz");
    expect(parsed).not.toBeNull();
    expect(parsed!.geschaeftszahl).toBe("1 Ob 123/24");
  });

  it("extrahiert erste Geschäftszahl aus item (array)", () => {
    const parsed = parseRef(JUDIKATUR_REF_GZ_ARRAY, "Vwgh");
    expect(parsed!.geschaeftszahl).toBe("Ra 2024/05/0012");
  });

  it("changeType = 'new' wenn Veroeffentlicht gesetzt, Geaendert null", () => {
    const parsed = parseRef(JUDIKATUR_REF, "Justiz");
    expect(parsed!.changeType).toBe("new");
  });
});

describe("ris-delta: parseRef Edge Cases", () => {
  it("gibt null zurück wenn Data fehlt", () => {
    expect(parseRef({}, "BrKons")).toBeNull();
  });

  it("gibt null zurück wenn Metadaten fehlen", () => {
    expect(parseRef({ Data: {} }, "BrKons")).toBeNull();
  });

  it("gibt null zurück wenn Technisch.ID fehlt", () => {
    expect(parseRef({ Data: { Metadaten: { Allgemein: {} } } }, "BrKons")).toBeNull();
  });

  it("gibt null zurück wenn changedAt (Geaendert/Veroeffentlicht) fehlt", () => {
    expect(parseRef({
      Data: {
        Metadaten: {
          Technisch: { ID: "NOR123" },
          Allgemein: {},
        },
      },
    }, "BrKons")).toBeNull();
  });
});

describe("ris-delta: chooseImRisSeit Cursor-Logik", () => {
  it("wählt 'EinemMonat' bei keinem Cursor (erster Lauf)", () => {
    expect(chooseImRisSeit(null)).toBe("EinemMonat");
  });

  it("wählt 'EinerWoche' bei Cursor < 7 Tage", () => {
    const recent = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(chooseImRisSeit(recent)).toBe("EinerWoche");
  });

  it("wählt 'ZweiWochen' bei Cursor 7-14 Tage", () => {
    const recent = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    expect(chooseImRisSeit(recent)).toBe("ZweiWochen");
  });

  it("wählt 'EinemJahr' bei sehr altem Cursor (> 365 Tage)", () => {
    const old = new Date(Date.now() - 500 * 24 * 60 * 60 * 1000).toISOString();
    expect(chooseImRisSeit(old)).toBe("EinemJahr");
  });
});

describe("ris-delta: DELTA_APPLIKATIONS Registry", () => {
  it("enthält BrKons und LrKons (Bundesrecht + Landesrecht)", () => {
    const apps = DELTA_APPLIKATIONS.map((a) => a.applikation);
    expect(apps).toContain("BrKons");
    expect(apps).toContain("LrKons");
  });

  it("jede Applikation hat stateKey, endpoint, corpusDir", () => {
    for (const app of DELTA_APPLIKATIONS) {
      expect(app.stateKey).toMatch(/^ris-delta-/);
      expect(app.endpoint).toMatch(/^(Bundesrecht|Landesrecht|Judikatur|Sonstige)$/);
      expect(app.corpusDir).toBeTruthy();
    }
  });

  it("BrKons mappt auf at-normen Corpus-Verzeichnis", () => {
    const brKons = DELTA_APPLIKATIONS.find((a) => a.applikation === "BrKons");
    expect(brKons?.corpusDir).toBe("at-normen");
  });
});
