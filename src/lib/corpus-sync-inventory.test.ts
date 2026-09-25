// @vitest-environment node
// Rechenlogik der Sync-Tabelle (/ops/corpus). Die Zahlen sind die am
// 2026-09-25 auf dem Server nach Dokumentnummer gemessenen — genau die Fälle,
// an denen die alte Tabelle falsch lag.
import { describe, expect, it } from "vitest";
import {
  parseSyncInventory,
  pipelineKeyForCorpus,
  syncTotals,
  toSyncRow,
  type SyncInventorySource,
} from "./corpus-sync-inventory";

function src(over: Partial<SyncInventorySource>): SyncInventorySource {
  return {
    corpus: "at-normen",
    sourceId: "law-at-normen",
    inScope: true,
    historical: false,
    risSoll: null,
    risSollKind: null,
    risSollAt: null,
    rawFiles: 0,
    normalizedFiles: 0,
    diskDocs: 0,
    dbPages: 0,
    dbDocs: 0,
    dbPagesWithoutDocId: 0,
    missingOnDisk: 0,
    missingByReason: { open: 0, no_text: 0, not_found: 0, failed: 0 },
    diskNotInDb: 0,
    dbNotOnDisk: 0,
    dbHistorical: 0,
    notInRisSoll: null,
    aboveSoll: 0,
    ...over,
  };
}

describe("toSyncRow", () => {
  it("OGH: Server = DB, die Lücke liegt beim Abruf — nicht beim Import", () => {
    // Alte Tabelle: 99.724 Rohdateien → „−31.980 Disk→DB". Nach Dokumentnummer 0.
    const row = toSyncRow(
      src({
        corpus: "at-judikatur",
        sourceId: "law-at-judikatur",
        risSoll: 138_486,
        risSollKind: "hits",
        rawFiles: 99_724,
        diskDocs: 67_744,
        dbDocs: 67_744,
        missingOnDisk: 70_742,
        missingByReason: { open: 70_742, no_text: 0, not_found: 0, failed: 0 },
      }),
      "OGH und Justiz",
      { chunks: 1000, embedded: 1 }
    );
    expect(row.importOpen).toBe(0);
    expect(row.missingOpen).toBe(70_742);
    expect(row.status).toBe("fetch_open");
    expect(row.canUpdate).toBe(true);
    expect(row.pipelineKey).toBe("jud-ogh");
    // Einbettung zählt nicht in den Status.
    expect(row.coveragePct).toBe(0.1);
  });

  it("trennt vom RIS nicht lieferbare Dokumente von offener Arbeit; Netzfehler bleiben offen", () => {
    const row = toSyncRow(
      src({
        corpus: "at-landesrecht",
        sourceId: "law-at-landesrecht",
        risSoll: 102_104,
        risSollKind: "index",
        missingOnDisk: 12_536,
        missingByReason: { open: 12_000, no_text: 400, not_found: 36, failed: 100 },
        notInRisSoll: 52_941,
      }),
      "Landesrecht",
      undefined
    );
    expect(row.missingUnreachable).toBe(436);
    expect(row.missingOpen).toBe(12_100);
    expect(row.notInSoll).toBe(52_941);
    expect(row.status).toBe("fetch_open");
  });

  it("ist vollständig, wenn nur noch unerreichbare Dokumente fehlen und Server = DB", () => {
    const row = toSyncRow(
      src({
        risSoll: 148_157,
        risSollKind: "index",
        diskDocs: 147_774,
        dbDocs: 147_774,
        missingOnDisk: 383,
        missingByReason: { open: 0, no_text: 314, not_found: 69, failed: 0 },
      }),
      "Bundesrecht",
      undefined
    );
    expect(row.status).toBe("complete");
    expect(row.fullyComplete).toBe(true);
    expect(row.canUpdate).toBe(false);
  });

  it("Reihenfolge der Arbeit: erst Import, dann DB-Bereinigung", () => {
    expect(
      toSyncRow(src({ risSoll: 10, diskNotInDb: 3, dbNotOnDisk: 5 }), "x", undefined).status
    ).toBe("import_open");
    expect(toSyncRow(src({ risSoll: 10, dbNotOnDisk: 5 }), "x", undefined).status).toBe("db_extra");
  });

  it("ohne RIS-Soll gibt es kein „vollständig“, nur „Server = DB“", () => {
    const row = toSyncRow(
      src({ corpus: "at-gemeinden", diskDocs: 18_171, dbDocs: 18_171 }),
      "Gemeinden",
      undefined
    );
    expect(row.status).toBe("no_soll");
    expect(row.fullyComplete).toBe(false);
  });

  it("Archiv und Quellen außerhalb des Umfangs bekommen eigene Status und kein Soll", () => {
    expect(
      toSyncRow(src({ corpus: "at", historical: true, risSoll: 5 }), "Archiv", undefined)
    ).toMatchObject({
      status: "historical",
      risSoll: null,
    });
    expect(toSyncRow(src({ corpus: "ch", inScope: false }), "CH", undefined).status).toBe(
      "out_of_scope"
    );
  });
});

describe("syncTotals", () => {
  it("summiert nur den Produktumfang (AT ohne Archiv)", () => {
    const rows = [
      toSyncRow(
        src({
          risSoll: 100,
          missingOnDisk: 10,
          missingByReason: { open: 10, no_text: 0, not_found: 0, failed: 0 },
        }),
        "a",
        { chunks: 10, embedded: 5 }
      ),
      toSyncRow(src({ corpus: "ch", inScope: false, diskDocs: 25 }), "ch", undefined),
      toSyncRow(src({ corpus: "at", historical: true, diskDocs: 83 }), "archiv", undefined),
    ];
    const t = syncTotals(rows);
    expect(t.risSoll).toBe(100);
    expect(t.missingOpen).toBe(10);
    expect(t.diskDocs).toBe(0);
    expect(t.coveragePct).toBe(50);
  });
});

describe("parseSyncInventory", () => {
  it("lehnt Unlesbares ab statt Nullen zu erfinden", () => {
    expect(parseSyncInventory("nicht json")).toBeNull();
    expect(parseSyncInventory(JSON.stringify({ sources: [] }))).toBeNull();
  });

  it("füllt fehlende Felder defensiv", () => {
    const inv = parseSyncInventory(
      JSON.stringify({
        measuredAt: "2026-09-25T10:00:00Z",
        sources: [{ corpus: "at-avn", inScope: true }],
      })
    );
    expect(inv?.sources[0]).toMatchObject({
      sourceId: "law-at-avn",
      diskDocs: 0,
      risSoll: null,
      missingByReason: { open: 0, no_text: 0, not_found: 0, failed: 0 },
    });
  });
});

describe("pipelineKeyForCorpus", () => {
  it("bildet jede nachholbare Quelle auf ihren Pipeline-Trigger ab", () => {
    expect(pipelineKeyForCorpus("at-normen")).toBe("normen-at");
    expect(pipelineKeyForCorpus("at-landesrecht")).toBe("landesrecht");
    expect(pipelineKeyForCorpus("at-judikatur")).toBe("jud-ogh");
    expect(pipelineKeyForCorpus("at-judikatur-vwgh")).toBe("jud-vwgh");
    expect(pipelineKeyForCorpus("at-gemeinden")).toBe("at-gemeinden");
    expect(pipelineKeyForCorpus("at-staatsvertraege")).toBeNull();
  });
});
