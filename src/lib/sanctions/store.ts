/**
 * The sanctions list in the database, refreshed by a cron and read by the KYC
 * check. Kept out of the tenant brain on purpose: the list is public reference
 * data, identical for every firm, and must not be mixed into a firm's pages.
 */

import { getSharedPgPool } from "@/lib/auth/store";
import { createSchemaInit } from "@/lib/schema-init";
import { fetchSanctionsList, type SanctionsEntry, type SanctionsList } from "./eu-list";
import { fetchUnSanctionsList } from "./un-list";
import { fetchOfacSdnList } from "./ofac-list";

const ensureSchema = createSchemaInit([
  `CREATE TABLE IF NOT EXISTS subsumio_sanctions_entries (
     source       text NOT NULL,
     reference    text NOT NULL,
     entity_type  text NOT NULL,
     primary_name text NOT NULL,
     names        jsonb NOT NULL,
     birth_dates  jsonb NOT NULL DEFAULT '[]'::jsonb,
     countries    jsonb NOT NULL DEFAULT '[]'::jsonb,
     programmes   jsonb NOT NULL DEFAULT '[]'::jsonb,
     remark       text,
     PRIMARY KEY (source, reference)
   )`,
  `CREATE TABLE IF NOT EXISTS subsumio_sanctions_meta (
     source        text PRIMARY KEY,
     generated_at  text NOT NULL,
     entry_count   integer NOT NULL,
     refreshed_at  timestamptz NOT NULL DEFAULT now()
   )`,
]);

export const EU_SOURCE = "eu-fsf";
export const UN_SOURCE = "un-sc";
export const OFAC_SOURCE = "ofac-sdn";

/** Alle gepflegten Sanktionsquellen — der Cron aktualisiert jede davon. */
export const SANCTION_SOURCES: ReadonlyArray<{
  source: string;
  label: string;
  load: () => Promise<SanctionsList>;
}> = [
  { source: EU_SOURCE, label: "EU-Finanzsanktionsliste (FSF)", load: () => fetchSanctionsList() },
  {
    source: UN_SOURCE,
    label: "UN Security Council Consolidated List",
    load: () => fetchUnSanctionsList(),
  },
  { source: OFAC_SOURCE, label: "OFAC SDN List", load: () => fetchOfacSdnList() },
];

export const SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  SANCTION_SOURCES.map((s) => [s.source, s.label])
);

export interface StoredList {
  source: string;
  /** generationDate of the official file. */
  generatedAt: string;
  entryCount: number;
  refreshedAt: string;
  entries: SanctionsEntry[];
}

let cache = new Map<string, { list: StoredList; loadedAt: number }>();
/** The list changes a few times a month; an hour of staleness is harmless. */
const CACHE_TTL_MS = 60 * 60 * 1000;

/** Replaces the stored list with a freshly downloaded one. Returns the meta. */
export async function refreshSanctionsList(
  source = EU_SOURCE,
  load: () => Promise<SanctionsList> = () => fetchSanctionsList()
): Promise<{ generatedAt: string; entryCount: number }> {
  const pool = getSharedPgPool();
  if (!pool)
    throw new Error("Keine Datenbank verbunden — Sanktionsliste kann nicht gespeichert werden.");
  await ensureSchema();
  const list = await load();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM subsumio_sanctions_entries WHERE source = $1", [source]);
    // One multi-row insert per 500 entries: 6k single inserts take minutes.
    const chunk = 500;
    for (let i = 0; i < list.entries.length; i += chunk) {
      const slice = list.entries.slice(i, i + chunk);
      const values: unknown[] = [];
      const rows = slice.map((e, k) => {
        const b = k * 9;
        values.push(
          source,
          e.reference,
          e.entityType,
          e.primaryName,
          JSON.stringify(e.names),
          JSON.stringify(e.birthDates),
          JSON.stringify(e.countries),
          JSON.stringify(e.programmes),
          e.remark ?? null
        );
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5}::jsonb,$${b + 6}::jsonb,$${b + 7}::jsonb,$${b + 8}::jsonb,$${b + 9})`;
      });
      await client.query(
        `INSERT INTO subsumio_sanctions_entries
           (source, reference, entity_type, primary_name, names, birth_dates, countries, programmes, remark)
         VALUES ${rows.join(",")}
         ON CONFLICT (source, reference) DO NOTHING`,
        values
      );
    }
    await client.query(
      `INSERT INTO subsumio_sanctions_meta (source, generated_at, entry_count, refreshed_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (source) DO UPDATE
         SET generated_at = EXCLUDED.generated_at,
             entry_count = EXCLUDED.entry_count,
             refreshed_at = now()`,
      [source, list.generatedAt, list.entries.length]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  cache.delete(source);
  return { generatedAt: list.generatedAt, entryCount: list.entries.length };
}

/** The stored list, cached per process. Null when it was never downloaded. */
export async function loadSanctionsList(source = EU_SOURCE): Promise<StoredList | null> {
  const cached = cache.get(source);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.list;
  }
  const pool = getSharedPgPool();
  if (!pool) return null;
  await ensureSchema();
  const meta = await pool.query(
    "SELECT generated_at, entry_count, refreshed_at FROM subsumio_sanctions_meta WHERE source = $1",
    [source]
  );
  if (meta.rowCount === 0) return null;
  const rows = await pool.query(
    `SELECT reference, entity_type, primary_name, names, birth_dates, countries, programmes, remark
       FROM subsumio_sanctions_entries WHERE source = $1`,
    [source]
  );
  const entries: SanctionsEntry[] = rows.rows.map((r: Record<string, unknown>) => ({
    reference: String(r.reference),
    entityType: r.entity_type as SanctionsEntry["entityType"],
    primaryName: String(r.primary_name),
    names: (r.names as string[]) ?? [],
    birthDates: (r.birth_dates as string[]) ?? [],
    countries: (r.countries as string[]) ?? [],
    programmes: (r.programmes as string[]) ?? [],
    remark: (r.remark as string | null) ?? undefined,
  }));
  const m = meta.rows[0] as Record<string, unknown>;
  const list: StoredList = {
    source,
    generatedAt: String(m.generated_at),
    entryCount: Number(m.entry_count),
    refreshedAt: new Date(String(m.refreshed_at)).toISOString(),
    entries,
  };
  cache.set(source, { list, loadedAt: Date.now() });
  return list;
}

/** Test seam: drops the process cache. */
export function clearSanctionsCache(): void {
  cache = new Map();
}

/** Aktualisiert alle konfigurierten Quellen; Fehler einzelner Quellen werden gesammelt. */
export async function refreshAllSanctionsLists(): Promise<
  Array<{ source: string; ok: boolean; entryCount?: number; error?: string }>
> {
  const out: Array<{ source: string; ok: boolean; entryCount?: number; error?: string }> = [];
  for (const s of SANCTION_SOURCES) {
    try {
      const r = await refreshSanctionsList(s.source, s.load);
      out.push({ source: s.source, ok: true, entryCount: r.entryCount });
    } catch (err) {
      // Eine defekte Quelle darf die anderen nicht blockieren — die alte
      // Fassung bleibt gespeichert und Checks laufen weiter.
      out.push({
        source: s.source,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}

/** Alle gespeicherten Listen — die Prüfung läuft über jede Quelle. */
export async function loadAllSanctionsLists(): Promise<StoredList[]> {
  const out: StoredList[] = [];
  for (const s of SANCTION_SOURCES) {
    const list = await loadSanctionsList(s.source);
    if (list) out.push(list);
  }
  return out;
}
