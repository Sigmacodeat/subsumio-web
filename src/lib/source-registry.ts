/**
 * Source Registry — zentrales Modell für Rechtsquellen-Tracking.
 *
 * Verbindet drei Quell-Typen:
 *  1. Statute Corpus  — lokale Markdown-Dateien in law-corpus/ (über CORPUS_META)
 *  2. Judgement APIs  — externe APIs (RIS-OGD, OpenLegalData, OpenCaseLaw)
 *  3. Engine Sources  — Brain-Engine-Quellen (über /api/connectors)
 *
 * Jede Quelle bekommt einen einheitlichen Status mit Freshness-Berechnung,
 * Authority-Tier und Sync-Summary.
 */

import path from "node:path";
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { CORPUS_META } from "@/lib/corpus-meta";
import { CORPUS_DIR } from "@/lib/legal-grounding";

// ── Types ─────────────────────────────────────────────────────────────

export type SourceType =
  | "statute_corpus"
  | "judgement_api"
  | "literature_corpus"
  | "regulatory_feed"
  | "commercial";
export type SourceStatus = "fresh" | "stale" | "syncing" | "error" | "unknown";
export type AuthorityTier = "official" | "semi-official" | "community" | "commercial";
export type JurisdictionCode = "DE" | "AT" | "CH" | "EU" | "ALL";

export interface CorpusDiffEntry {
  statute_code: string;
  paragraph: string;
  change_type: "added" | "modified" | "removed";
  old_hash?: string;
  new_hash?: string;
  detected_at: string;
}

export interface SourceSyncSummary {
  fetched: number;
  imported: number;
  errors: string[];
  duration_ms: number;
  timestamp: string;
}

export interface SourceRegistryEntry {
  id: string;
  type: SourceType;
  label: string;
  jurisdiction: JurisdictionCode;
  authority_tier: AuthorityTier;
  license: string;
  status: SourceStatus;
  last_sync_at: string | null;
  last_sync_summary?: SourceSyncSummary;
  freshness_hours: number | null;
  auto_sync_interval_hours: number;
  document_count: number;
  file_path?: string;
  api_endpoint?: string;
  enabled: boolean;
  diff_log?: CorpusDiffEntry[];
  last_error?: string;
}

export interface SourceRegistryResponse {
  sources: SourceRegistryEntry[];
  total: number;
  fresh: number;
  stale: number;
  error: number;
  unknown: number;
  generated_at: string;
}

// ── Judgement API definitions ─────────────────────────────────────────

interface JudgementApiDef {
  id: string;
  label: string;
  jurisdiction: JurisdictionCode;
  authority_tier: AuthorityTier;
  license: string;
  api_endpoint: string;
  auto_sync_interval_hours: number;
}

const JUDGEMENT_APIS: JudgementApiDef[] = [
  {
    id: "ris-ogd-at",
    label: "RIS-OGD Österreich",
    jurisdiction: "AT",
    authority_tier: "official",
    license: "RIS-OGD v2.6 — Bundeskanzleramt Österreich",
    api_endpoint: "https://data.bka.gv.at/ris/api/v2.6/judikatur",
    auto_sync_interval_hours: 24,
  },
  {
    id: "openlegaldata-de",
    label: "OpenLegalData Deutschland",
    jurisdiction: "DE",
    authority_tier: "community",
    license: "CC-BY 4.0 — openlegaldata.io",
    api_endpoint: "https://de.openlegaldata.io/api/cases/",
    auto_sync_interval_hours: 48,
  },
  {
    id: "opencaselaw-ch",
    label: "OpenCaseLaw Schweiz",
    jurisdiction: "CH",
    authority_tier: "semi-official",
    license: "OpenCaseLaw.ch — Bundesgericht Schweiz",
    api_endpoint: "https://mcp.opencaselaw.ch/api/decisions",
    auto_sync_interval_hours: 24,
  },
  {
    id: "eur-lex-eu",
    label: "EUR-Lex EuGH",
    jurisdiction: "EU",
    authority_tier: "official",
    license: "EUR-Lex — Amtliche Veröffentlichung der Europäischen Union",
    api_endpoint: "https://eur-lex.europa.eu/europa-webservices/rs/search",
    auto_sync_interval_hours: 48,
  },
];

// ── Literature / Materialien corpus definitions ───────────────────────
// Directory-based sources (many .md files per dir), harvested by
// server/scripts/fetch-*.ts. License terms mirror the engine's
// license-registry (server/src/core/legal/license-registry.ts).

interface LiteratureCorpusDef {
  id: string;
  label: string;
  jurisdiction: JurisdictionCode;
  authority_tier: AuthorityTier;
  license: string;
  dir: string; // under law-corpus/
  auto_sync_interval_hours: number;
}

const LITERATURE_CORPORA: LiteratureCorpusDef[] = [
  {
    id: "lit-de-materialien",
    label: "Gesetzesmaterialien (BT/BR-Drucksachen, DIP)",
    jurisdiction: "DE",
    authority_tier: "official",
    license: "Amtliches Werk, § 5 UrhG — DIP, Deutscher Bundestag",
    dir: "de-materialien",
    auto_sync_interval_hours: 168, // wöchentlich
  },
  {
    id: "lit-de-literatur",
    label: "Literatur DE (OpenRewi, Verfassungsblog)",
    jurisdiction: "DE",
    authority_tier: "community",
    license: "CC BY-SA 4.0 — Namensnennung + Share-Alike",
    dir: "de-literatur",
    auto_sync_interval_hours: 168,
  },
  {
    id: "lit-at-literatur",
    label: "Literatur AT (Austrian Law Journal)",
    jurisdiction: "AT",
    authority_tier: "community",
    license: "Diamond Open Access (DOAJ) — Abstracts via OAI-PMH",
    dir: "at-literatur",
    auto_sync_interval_hours: 336, // zweiwöchentlich
  },
  {
    id: "lit-ch-literatur",
    label: "Literatur CH (Onlinekommentar, sui generis)",
    jurisdiction: "CH",
    authority_tier: "community",
    license: "CC BY 4.0 / CC BY-SA 4.0 — Namensnennung erforderlich",
    dir: "ch-literatur",
    auto_sync_interval_hours: 336,
  },
];

// ── Freshness calculation ─────────────────────────────────────────────

export function calculateFreshness(
  lastSyncAt: string | null,
  intervalHours: number
): { freshness_hours: number | null; status: SourceStatus } {
  if (!lastSyncAt) {
    return { freshness_hours: null, status: "unknown" };
  }
  const lastSync = new Date(lastSyncAt);
  const now = new Date();
  const diffMs = now.getTime() - lastSync.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));

  if (hours < 0) {
    return { freshness_hours: 0, status: "fresh" };
  }
  if (hours <= intervalHours) {
    return { freshness_hours: hours, status: "fresh" };
  }
  return { freshness_hours: hours, status: "stale" };
}

// ── Corpus scanning ───────────────────────────────────────────────────

export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export async function scanCorpusFile(
  filePath: string
): Promise<{ exists: boolean; document_count: number; hash: string | null; size: number }> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const hash = hashContent(content);
    const paragraphCount = (content.match(/^##\s*§\s*\d+/gm) || []).length;
    const sectionCount = (content.match(/^##\s+/gm) || []).length;
    const document_count = Math.max(paragraphCount, sectionCount, 1);
    return { exists: true, document_count, hash, size: content.length };
  } catch {
    return { exists: false, document_count: 0, hash: null, size: 0 };
  }
}

// ── Corpus diff ───────────────────────────────────────────────────────

const DIFF_STORE = path.join(process.cwd(), ".source-registry-diff");

export async function loadPreviousHashes(): Promise<Record<string, string>> {
  try {
    const data = await fs.readFile(path.join(DIFF_STORE, "corpus-hashes.json"), "utf8");
    return JSON.parse(data) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function saveCurrentHashes(hashes: Record<string, string>): Promise<void> {
  try {
    await fs.mkdir(DIFF_STORE, { recursive: true });
    await fs.writeFile(
      path.join(DIFF_STORE, "corpus-hashes.json"),
      JSON.stringify(hashes, null, 2)
    );
  } catch {
    // Non-fatal — diff tracking is best-effort
  }
}

export async function computeCorpusDiff(
  currentHashes: Record<string, string>,
  previousHashes: Record<string, string>
): Promise<CorpusDiffEntry[]> {
  const now = new Date().toISOString();
  const diffs: CorpusDiffEntry[] = [];

  for (const [key, hash] of Object.entries(currentHashes)) {
    const prev = previousHashes[key];
    if (!prev) {
      diffs.push({
        statute_code: key,
        paragraph: "",
        change_type: "added",
        new_hash: hash,
        detected_at: now,
      });
    } else if (prev !== hash) {
      diffs.push({
        statute_code: key,
        paragraph: "",
        change_type: "modified",
        old_hash: prev,
        new_hash: hash,
        detected_at: now,
      });
    }
  }

  for (const [key, hash] of Object.entries(previousHashes)) {
    if (!currentHashes[key]) {
      diffs.push({
        statute_code: key,
        paragraph: "",
        change_type: "removed",
        old_hash: hash,
        detected_at: now,
      });
    }
  }

  return diffs;
}

// ── Build registry entries ────────────────────────────────────────────

export async function buildStatuteEntries(): Promise<SourceRegistryEntry[]> {
  const entries: SourceRegistryEntry[] = [];
  const currentHashes: Record<string, string> = {};
  const previousHashes = await loadPreviousHashes();

  for (const [key, meta] of Object.entries(CORPUS_META)) {
    const filePath = path.join(CORPUS_DIR, meta.file);
    const scan = await scanCorpusFile(filePath);

    if (scan.hash) {
      currentHashes[key] = scan.hash;
    }

    const jurisdiction = meta.jurisdiction.toUpperCase() as JurisdictionCode;
    const lastModified = await getFileMtime(filePath);

    const { freshness_hours, status } = calculateFreshness(
      lastModified,
      720 // 30 days for statute corpus
    );

    entries.push({
      id: `corpus-${key}`,
      type: "statute_corpus",
      label: meta.label,
      jurisdiction,
      authority_tier: "official",
      license: "Gesetz im amtlichen Wortlaut — gemeinfrei",
      status: scan.exists ? status : "error",
      last_sync_at: lastModified,
      freshness_hours,
      auto_sync_interval_hours: 720,
      document_count: scan.document_count,
      file_path: meta.file,
      enabled: scan.exists,
      last_error: scan.exists ? undefined : "Corpus-Datei nicht gefunden",
    });
  }

  // Compute and store diff
  const diffLog = await computeCorpusDiff(currentHashes, previousHashes);
  if (diffLog.length > 0) {
    await saveCurrentHashes(currentHashes);
  }

  // Attach diff to entries
  for (const entry of entries) {
    const key = entry.id.replace("corpus-", "");
    entry.diff_log = diffLog.filter((d) => d.statute_code === key);
  }

  return entries;
}

async function getFileMtime(filePath: string): Promise<string | null> {
  try {
    const stat = await fs.stat(filePath);
    return stat.mtime.toISOString();
  } catch {
    return null;
  }
}

/**
 * Scan a literature corpus directory: .md file count + directory mtime.
 * Dir mtime (updates on add/remove) avoids stat-ing thousands of files;
 * a re-harvest that only rewrites existing files is still caught via the
 * newest mtime of a small sample.
 */
export async function scanLiteratureDir(
  dirPath: string
): Promise<{ exists: boolean; document_count: number; last_modified: string | null }> {
  try {
    const entries = await fs.readdir(dirPath);
    const mdFiles = entries.filter((f) => f.endsWith(".md"));
    const dirStat = await fs.stat(dirPath);
    let newest = dirStat.mtime;
    for (const f of mdFiles.slice(0, 25)) {
      try {
        const st = await fs.stat(path.join(dirPath, f));
        if (st.mtime > newest) newest = st.mtime;
      } catch {
        // einzelne Datei nicht lesbar — ignorieren
      }
    }
    return {
      exists: true,
      document_count: mdFiles.length,
      last_modified: newest.toISOString(),
    };
  } catch {
    return { exists: false, document_count: 0, last_modified: null };
  }
}

export async function buildLiteratureEntries(): Promise<SourceRegistryEntry[]> {
  return Promise.all(
    LITERATURE_CORPORA.map(async (def): Promise<SourceRegistryEntry> => {
      const scan = await scanLiteratureDir(path.join(CORPUS_DIR, def.dir));
      const { freshness_hours, status } = calculateFreshness(
        scan.last_modified,
        def.auto_sync_interval_hours
      );
      return {
        id: def.id,
        type: "literature_corpus",
        label: def.label,
        jurisdiction: def.jurisdiction,
        authority_tier: def.authority_tier,
        license: def.license,
        // Leeres/fehlendes Verzeichnis ist kein Fehler, sondern "noch nicht
        // geerntet" (z.B. de-materialien vor dem DIP-Key).
        status: scan.exists && scan.document_count > 0 ? status : "unknown",
        last_sync_at: scan.last_modified,
        freshness_hours,
        auto_sync_interval_hours: def.auto_sync_interval_hours,
        document_count: scan.document_count,
        file_path: def.dir,
        enabled: scan.exists,
        last_error:
          scan.exists && scan.document_count === 0
            ? "Noch kein Bestand — Fetch-Script ausführen (siehe docs/LITERATUR_CORPUS.md)"
            : undefined,
      };
    })
  );
}

export function buildJudgementApiEntries(
  syncStatus?: Record<string, { last_sync_at: string | null; last_error?: string }>
): SourceRegistryEntry[] {
  return JUDGEMENT_APIS.map((api) => {
    const syncInfo = syncStatus?.[api.id];
    const lastSync = syncInfo?.last_sync_at ?? null;
    const { freshness_hours, status } = calculateFreshness(lastSync, api.auto_sync_interval_hours);

    return {
      id: api.id,
      type: "judgement_api" as const,
      label: api.label,
      jurisdiction: api.jurisdiction,
      authority_tier: api.authority_tier,
      license: api.license,
      status: syncInfo?.last_error ? "error" : status,
      last_sync_at: lastSync,
      freshness_hours,
      auto_sync_interval_hours: api.auto_sync_interval_hours,
      document_count: 0,
      api_endpoint: api.api_endpoint,
      enabled: true,
      last_error: syncInfo?.last_error,
    };
  });
}

export async function buildSourceRegistry(
  syncStatus?: Record<string, { last_sync_at: string | null; last_error?: string }>
): Promise<SourceRegistryResponse> {
  const [statuteEntries, judgementEntries, literatureEntries] = await Promise.all([
    buildStatuteEntries(),
    Promise.resolve(buildJudgementApiEntries(syncStatus)),
    buildLiteratureEntries(),
  ]);

  const sources = [...statuteEntries, ...judgementEntries, ...literatureEntries];

  return {
    sources,
    total: sources.length,
    fresh: sources.filter((s) => s.status === "fresh").length,
    stale: sources.filter((s) => s.status === "stale").length,
    error: sources.filter((s) => s.status === "error").length,
    unknown: sources.filter((s) => s.status === "unknown").length,
    generated_at: new Date().toISOString(),
  };
}

// ── Sync status persistence (Brain-page based) ────────────────────────

const SYNC_STATUS_SLUG = "monitoring/source-registry-sync-status";

export async function loadSyncStatus(
  engineUrl: string,
  engineHeaders: Record<string, string>
): Promise<Record<string, { last_sync_at: string | null; last_error?: string }>> {
  try {
    const res = await fetch(`${engineUrl}/api/pages/${SYNC_STATUS_SLUG}`, {
      headers: engineHeaders,
    });
    if (!res.ok) return {};
    const page = (await res.json()) as { frontmatter?: Record<string, unknown> };
    const status = page.frontmatter?.sync_status;
    if (!Array.isArray(status)) return {};
    const result: Record<string, { last_sync_at: string | null; last_error?: string }> = {};
    for (const entry of status) {
      if (entry && typeof entry === "object") {
        const e = entry as Record<string, unknown>;
        const id = String(e.id ?? "");
        if (id) {
          result[id] = {
            last_sync_at: e.last_sync_at ? String(e.last_sync_at) : null,
            last_error: e.last_error ? String(e.last_error) : undefined,
          };
        }
      }
    }
    return result;
  } catch {
    return {};
  }
}

export async function saveSyncStatus(
  engineUrl: string,
  engineHeaders: Record<string, string>,
  status: Record<string, { last_sync_at: string | null; last_error?: string }>
): Promise<void> {
  try {
    const syncStatusArray = Object.entries(status).map(([id, info]) => ({
      id,
      last_sync_at: info.last_sync_at,
      last_error: info.last_error,
    }));

    await fetch(`${engineUrl}/api/pages`, {
      method: "POST",
      headers: { ...engineHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: SYNC_STATUS_SLUG,
        title: "Source Registry Sync Status",
        type: "system",
        content: "Automatisch verwaltete Sync-Status der Source Registry.",
        frontmatter: { sync_status: syncStatusArray },
      }),
    });
  } catch {
    // Non-fatal
  }
}

// ── Source provenance for citations ───────────────────────────────────

export interface SourceProvenance {
  source_id: string;
  source_label: string;
  jurisdiction: JurisdictionCode;
  authority_tier: AuthorityTier;
  last_sync_at: string | null;
  freshness_status: SourceStatus;
}

export function provenanceFromEntry(entry: SourceRegistryEntry): SourceProvenance {
  return {
    source_id: entry.id,
    source_label: entry.label,
    jurisdiction: entry.jurisdiction,
    authority_tier: entry.authority_tier,
    last_sync_at: entry.last_sync_at,
    freshness_status: entry.status,
  };
}

export function findSourceForCitation(
  sources: SourceRegistryEntry[],
  code: string,
  jurisdiction?: string
): SourceProvenance | null {
  const normalizedCode = code.toLowerCase().replace(/[^a-z0-9]/g, "");
  const match = sources.find((s) => {
    const labelNorm = s.label.toLowerCase().replace(/[^a-z0-9]/g, "");
    const idNorm = s.id.replace("corpus-", "").toLowerCase();
    return (
      (labelNorm === normalizedCode ||
        idNorm === normalizedCode ||
        labelNorm.startsWith(normalizedCode) ||
        idNorm.startsWith(normalizedCode)) &&
      (!jurisdiction || s.jurisdiction === jurisdiction.toUpperCase())
    );
  });
  return match ? provenanceFromEntry(match) : null;
}
