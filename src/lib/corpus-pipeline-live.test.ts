import { describe, it, expect, beforeEach } from "vitest";
import {
  deriveLiveRows,
  resetPipelineLiveCache,
  type PipelineStateInput,
} from "@/lib/corpus-pipeline-live";

const NOW = new Date("2026-09-22T12:00:00Z").getTime();
const iso = (agoS: number) => new Date(NOW - agoS * 1000).toISOString();

function state(over: Partial<PipelineStateInput>): PipelineStateInput {
  return {
    source: "jud-vwgh",
    stage: "importing",
    pid: 1234,
    startedAt: iso(3600),
    heartbeatAt: iso(60),
    diskCount: 1000,
    risTotal: 5000,
    ...over,
  };
}

beforeEach(() => resetPipelineLiveCache());

describe("deriveLiveRows", () => {
  it("ignoriert idle/fertige Rows ohne PID", () => {
    const rows = deriveLiveRows([state({ pid: null, stage: "done" })], {}, NOW, () => null);
    expect(rows).toEqual([]);
  });

  it("überspringt Meta-Rows (pipeline-lock, ris-delta-*)", () => {
    const rows = deriveLiveRows(
      [
        state({ source: "pipeline-lock", stage: "importing" }),
        state({ source: "ris-delta-Vwgh", stage: "backfilling" }),
      ],
      {},
      NOW,
      () => 5
    );
    expect(rows).toEqual([]);
  });

  it("zeigt laufende Import-Stage mit Live-DB-Count + Fortschritt gegen disk_count", () => {
    const rows = deriveLiveRows(
      [state({})],
      { "law-at-judikatur-vwgh": { documents: 400, lastWrite: iso(30) } },
      NOW,
      () => null
    );
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.dbDocsLive).toBe(400);
    expect(r.target).toBe(1000); // disk_count schlägt risTotal für Imports
    expect(r.progressPct).toBe(40);
    expect(r.lastWriteAgoS).toBe(30);
    expect(r.elapsedS).toBe(3600);
    expect(r.stalled).toBe(false);
    expect(r.docsPerMin).toBeNull(); // erstes Sample: keine Rate
    expect(r.etaMin).toBeNull();
  });

  it("berechnet Rate + ETA aus dem zweiten Sample", () => {
    const stats = { "law-at-judikatur-vwgh": { documents: 400, lastWrite: iso(5) } };
    deriveLiveRows([state({})], stats, NOW, () => null);
    stats["law-at-judikatur-vwgh"].documents = 460; // +60 in 60s = 60/min
    const rows = deriveLiveRows([state({})], stats, NOW + 60_000, () => null);
    const r = rows[0];
    expect(r.docsPerMin).toBe(60);
    expect(r.etaMin).toBe(Math.round((1000 - 460) / 60)); // 540/60 = 9min
  });

  it("markiert laufende Import-Stage ohne Writes >10min als stalled", () => {
    const rows = deriveLiveRows(
      [state({})],
      { "law-at-judikatur-vwgh": { documents: 400, lastWrite: iso(900) } },
      NOW,
      () => null
    );
    expect(rows[0].stalled).toBe(true);
  });

  it("markiert stale Orchestrator-Heartbeat als stalled", () => {
    const rows = deriveLiveRows(
      [state({ heartbeatAt: iso(2000) })],
      { "law-at-judikatur-vwgh": { documents: 400, lastWrite: iso(10) } },
      NOW,
      () => null
    );
    expect(rows[0].stalled).toBe(true);
  });

  it("Fetch-Stage misst Disk-Dateien gegen ris_total", () => {
    const rows = deriveLiveRows([state({ stage: "backfilling" })], {}, NOW, () => 2500);
    const r = rows[0];
    expect(r.diskFilesLive).toBe(2500);
    expect(r.target).toBe(5000); // ris_total für Fetch-Stages
    expect(r.progressPct).toBe(50);
    expect(r.dbDocsLive).toBeNull();
  });

  it("backfill-jud-* Rows teilen das Dir ihres jud-* Pendants", () => {
    const rows = deriveLiveRows(
      [state({ source: "backfill-jud-vwgh", stage: "backfilling" })],
      {},
      NOW,
      () => 100
    );
    expect(rows[0].diskFilesLive).toBe(100);
  });

  it("kein Fortschrittsbalken ohne bekanntes Ziel", () => {
    const rows = deriveLiveRows(
      [state({ diskCount: 0, risTotal: null })],
      { "law-at-judikatur-vwgh": { documents: 10, lastWrite: iso(5) } },
      NOW,
      () => null
    );
    expect(rows[0].progressPct).toBeNull();
    expect(rows[0].etaMin).toBeNull();
  });

  it("unbekannter source_key liefert Row ohne Live-Zähler, aber mit Stage/Elapsed", () => {
    const rows = deriveLiveRows([state({ source: "unknown-x" })], {}, NOW, () => null);
    const r = rows[0];
    expect(r.dbDocsLive).toBeNull();
    expect(r.diskFilesLive).toBeNull();
    expect(r.elapsedS).toBe(3600);
  });

  it("ETA ist null wenn Rate 0 (kein Fortschritt, aber noch kein Stall)", () => {
    const stats = { "law-at-judikatur-vwgh": { documents: 400, lastWrite: iso(5) } };
    deriveLiveRows([state({})], stats, NOW, () => null);
    const rows = deriveLiveRows([state({})], stats, NOW + 60_000, () => null);
    expect(rows[0].docsPerMin).toBe(0);
    expect(rows[0].etaMin).toBeNull();
  });
});
