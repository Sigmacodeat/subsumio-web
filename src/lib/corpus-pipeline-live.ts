/**
 * Live-Fortschritt für laufende Corpus-Pipeline-Stages.
 *
 * measure-don't-remember (gleiche Philosophie wie corpus-pipeline.ts):
 * Fortschritt wird aus beobachtbarem Zustand abgeleitet — live gezählte
 * DB-Dokumente, Raw-Dir-Dateien und Timestamps — nicht aus einem separaten
 * Progress-Kanal, der lügen könnte.
 *
 * Rate-Berechnung: prozesslokaler Sample-Cache (Web-Container ist
 * langlebig). Erste Poll nach Neustart liefert rate=null.
 */

import { readdirSync, existsSync } from "fs";
import { join } from "path";
import { lawCorpusDir } from "@/lib/corpus-paths";

/** Minimale Eingabe aus pipeline_state — kein DB-Typ nötig, die Route
 *  mappt ihre Rows auf diese Form. */
export interface PipelineStateInput {
  source: string;
  stage: string;
  pid: number | null;
  startedAt: string | null;
  heartbeatAt: string | null;
  diskCount: number;
  risTotal: number | null;
}

export interface SourceStatsInput {
  documents: number;
  lastWrite: string | null;
}

export interface PipelineLiveRow {
  source: string;
  stage: string;
  /** Sekunden seit pid_started_at. */
  elapsedS: number | null;
  /** DB-Stage ("importing"): live gezählte Dokumente der Source. */
  dbDocsLive: number | null;
  /** Fetch-Stage ("backfilling" / backfill-* Rows): live gezählte Dateien im Raw-Dir. */
  diskFilesLive: number | null;
  /** Fortschrittsziel: disk_count (Import) bzw. ris_total (Fetch). */
  target: number | null;
  progressPct: number | null;
  /** Sekunden seit dem letzten pages-Write dieser Source (DB-Stages). */
  lastWriteAgoS: number | null;
  /** Dokumente bzw. Dateien pro Minute — Delta aus dem Sample-Cache,
   *  null beim ersten Sample. */
  docsPerMin: number | null;
  filesPerMin: number | null;
  /** Geschätzte Restdauer in Minuten (null wenn Rate unbekannt/0). */
  etaMin: number | null;
  /** DB-Stage ohne Write >10min, oder Orchestrator-Heartbeat >20min alt. */
  stalled: boolean;
}

// pipeline_state.source_key → DB source_id. Quelle: Source-Registry in
// server/scripts/corpus-pipeline.ts (Judikatur-Keys sind jud-<key>).
export const PIPELINE_KEY_TO_SOURCE_ID: Record<string, string> = {
  "jud-ogh": "law-at-judikatur",
  "jud-vfgh": "law-at-judikatur-vfgh",
  "jud-vwgh": "law-at-judikatur-vwgh",
  "jud-bvwg": "law-at-judikatur-bvwg",
  "jud-lvwg": "law-at-judikatur-lvwg",
  "jud-asylgh": "law-at-judikatur-asylgh",
  "jud-uvs": "law-at-judikatur-uvs",
  "jud-dsk": "law-at-judikatur-dsk",
  "jud-gbk": "law-at-judikatur-gbk",
  "jud-pvak": "law-at-judikatur-pvak",
  "jud-dok": "law-at-judikatur-dok",
  "jud-ubas": "law-at-judikatur-ubas",
  "jud-umse": "law-at-judikatur-umse",
  "statutes-at": "law-at",
  "normen-at": "law-at-normen",
  "statutes-de": "law-de",
  "statutes-ch": "law-ch",
  landesrecht: "law-at-landesrecht",
  staatsvertraege: "law-at-staatsvertraege",
  "materialien-de": "law-de-materialien",
  "literatur-de": "law-de-literatur",
  "literatur-at": "law-at-literatur",
  "literatur-ch": "law-ch-literatur",
  "eu-directives": "law-eu-directives",
  "eu-regulations": "law-eu",
};

// pipeline_state.source_key → Raw-Dir unter law-corpus/ (Fetch-Stages
// schreiben auf Disk, nicht in die DB). backfill-jud-* Rows teilen das Dir
// ihres jud-* Pendants (Prefix wird beim Lookup abgestreift).
export const PIPELINE_KEY_TO_DIR: Record<string, string> = {
  "jud-ogh": "at-judikatur",
  "jud-vfgh": "at-judikatur-vfgh",
  "jud-vwgh": "at-judikatur-vwgh",
  "jud-bvwg": "at-judikatur-bvwg",
  "jud-lvwg": "at-judikatur-lvwg",
  "jud-asylgh": "at-judikatur-asylgh",
  "jud-uvs": "at-judikatur-uvs",
  "jud-dsk": "at-judikatur-dsk",
  "jud-gbk": "at-judikatur-gbk",
  "jud-pvak": "at-judikatur-pvak",
  "jud-dok": "at-judikatur-dok",
  "jud-ubas": "at-judikatur-ubas",
  "jud-umse": "at-judikatur-umse",
  "statutes-at": "at",
  "normen-at": "at-normen",
  "statutes-de": "de",
  "statutes-ch": "ch",
  landesrecht: "at-landesrecht",
  staatsvertraege: "at-staatsvertraege",
  "materialien-de": "de-materialien",
  "literatur-de": "de-literatur",
  "literatur-at": "at-literatur",
  "literatur-ch": "ch-literatur",
  "eu-directives": "eu/directives",
  "eu-regulations": "eu/regulations",
};

const DB_WRITE_STAGES = new Set(["importing"]);
const FETCH_STAGES = new Set(["backfilling"]);
const STALL_AFTER_S = 600;
const HEARTBEAT_STALE_S = 1200;

interface RateSample {
  t: number;
  docs: number;
  files: number;
  docsPerMin: number | null;
  filesPerMin: number | null;
}

// Prozess-lokaler Cache — beim Neustart null bis zum zweiten Sample.
const rateCache = new Map<string, RateSample>();

function countDirFiles(dir: string): number | null {
  try {
    const abs = join(lawCorpusDir(), dir);
    if (!existsSync(abs)) return null;
    let n = 0;
    for (const e of readdirSync(abs, { withFileTypes: true })) if (e.isFile()) n++;
    return n;
  } catch {
    return null;
  }
}

/** Test-Hook: Sample-Cache leeren. */
export function resetPipelineLiveCache(): void {
  rateCache.clear();
}

export function deriveLiveRows(
  states: PipelineStateInput[],
  dbStats: Record<string, SourceStatsInput>,
  nowMs: number,
  countFiles: (dir: string) => number | null = countDirFiles
): PipelineLiveRow[] {
  const out: PipelineLiveRow[] = [];
  for (const s of states) {
    // Meta-Rows sind keine Arbeit: 'pipeline-lock' hält den Orchestrator-PID
    // (würde permanent als "running" erscheinen), 'ris-delta-*' hat eine
    // eigene Sektion im Command Center.
    if (s.source === "pipeline-lock" || s.source.startsWith("ris-delta")) continue;
    const isRunning = s.pid !== null;
    const isBackfill = s.source.startsWith("backfill-");
    const isDbStage = DB_WRITE_STAGES.has(s.stage);
    const isFetchStage = FETCH_STAGES.has(s.stage) || isBackfill;
    if (!isRunning && !isDbStage && !isFetchStage) continue;

    const sourceId = PIPELINE_KEY_TO_SOURCE_ID[s.source] ?? null;
    const stats = sourceId ? dbStats[sourceId] : undefined;
    const dbDocsLive = stats?.documents ?? null;
    const lastWriteAgoS = stats?.lastWrite
      ? Math.max(0, Math.round((nowMs - new Date(stats.lastWrite).getTime()) / 1000))
      : null;
    const dir =
      PIPELINE_KEY_TO_DIR[s.source.replace(/^backfill-/, "")] ?? PIPELINE_KEY_TO_DIR[s.source];
    const diskFilesLive = isFetchStage && dir ? countFiles(dir) : null;

    const target = isFetchStage ? (s.risTotal ?? null) : s.diskCount > 0 ? s.diskCount : s.risTotal;
    const current = isFetchStage ? diskFilesLive : dbDocsLive;
    const progressPct =
      target !== null && target > 0 && current !== null
        ? Math.min(100, Math.round((current / target) * 1000) / 10)
        : null;

    // Rate aus Sample-Delta (≥30s Abstand, sonst letzte Rate wiederverwenden)
    const sample = rateCache.get(s.source);
    let docsPerMin = sample?.docsPerMin ?? null;
    let filesPerMin = sample?.filesPerMin ?? null;
    const dtMin = sample ? (nowMs - sample.t) / 60_000 : 0;
    if (!sample || dtMin >= 0.5) {
      if (sample && dtMin > 0) {
        docsPerMin =
          dbDocsLive !== null ? Math.round(((dbDocsLive - sample.docs) / dtMin) * 10) / 10 : null;
        filesPerMin =
          diskFilesLive !== null
            ? Math.round(((diskFilesLive - sample.files) / dtMin) * 10) / 10
            : null;
      }
      rateCache.set(s.source, {
        t: nowMs,
        docs: dbDocsLive ?? 0,
        files: diskFilesLive ?? 0,
        docsPerMin,
        filesPerMin,
      });
    }

    const rate = isFetchStage ? filesPerMin : docsPerMin;
    const etaMin =
      rate !== null && rate > 0 && target !== null && current !== null && current < target
        ? Math.round((target - current) / rate)
        : null;

    const heartbeatAgeS = s.heartbeatAt
      ? Math.round((nowMs - new Date(s.heartbeatAt).getTime()) / 1000)
      : null;
    const elapsedS = s.startedAt
      ? Math.max(0, Math.round((nowMs - new Date(s.startedAt).getTime()) / 1000))
      : null;
    const stalled =
      (isDbStage && isRunning && lastWriteAgoS !== null && lastWriteAgoS > STALL_AFTER_S) ||
      (isRunning && heartbeatAgeS !== null && heartbeatAgeS > HEARTBEAT_STALE_S);

    out.push({
      source: s.source,
      stage: s.stage,
      elapsedS,
      dbDocsLive,
      diskFilesLive,
      target,
      progressPct,
      lastWriteAgoS,
      docsPerMin,
      filesPerMin,
      etaMin,
      stalled,
    });
  }
  return out;
}
