/**
 * judikatur-watch.ts — Judikatur-Wächter: RIS monitoring per Akte (Gap J).
 *
 * Harvey can alert on US case law; nobody watches RIS per Akte. This module
 * does:
 *
 *   1. Collect the §§ every open Akte relies on — from its Legal-Grounding-Map
 *      page (legal-grounding/<case> or legal-grounding-maps/<case>).
 *   2. Query the RIS-OGD API (Applikation=Justiz) for NEW decisions since the
 *      last run that mention those norms.
 *   3. Diff against the per-case seen-list (judikatur-watch/seen-<case> page)
 *      so an already-reported decision never alerts twice.
 *   4. Write an alert note per Akte (judikatur-alerts/<case>-<date>) listing
 *      each new decision with Gericht, GZ, Datum, Link and the matched §.
 *
 * Deterministic apart from the RIS call itself; `fetchImpl` is injectable so
 * tests run without network. Wire-up: the nightly legal-case-scanner (or a
 * cron) calls `runJudikaturWatch(engine, { fetchImpl: fetch })`.
 */

export interface WatchEngine {
  executeRaw<T>(sql: string, params?: unknown[]): Promise<T[]>;
  putPage(
    slug: string,
    page: { type: string; title: string; compiled_truth: string; frontmatter: Record<string, unknown> },
    opts?: { sourceId?: string }
  ): Promise<unknown>;
}

export type FetchLike = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

const RIS_OGD_BASE = "https://data.bka.gv.at/ris/api/v2.6";

// ── § extraction from grounding maps ────────────────────────

/** Matches "§ 1295 ABGB", "§ 106 Abs 3 StPO", "§§ 918, 920 ABGB", "Art 82 DSGVO". */
const NORM_RE =
  /(?:§§?\s*\d+[a-z]?(?:\s*(?:Abs|Z|lit)\s*\.?\s*\w+)*|Art\.?\s*\d+[a-z]?)\s+(?:[A-ZÄÖÜ][A-Za-zÄÖÜäöü-]*G[a-zA-Z]*|ABGB|StGB|StPO|ZPO|EO|UGB|DSGVO|EMRK|AHG|ASGG|AVG|VwGVG|B-VG|GOG|RATG|GGG|MRG|WEG|KSchG|VersVG|IO)\b/g;

/** Extract the distinct norms an Akte relies on from its grounding-map body. */
export function extrahiereNormen(groundingBody: string): string[] {
  const found = new Set<string>();
  for (const m of groundingBody.match(NORM_RE) ?? []) {
    // Normalize whitespace so "§  1295  ABGB" dedupes with "§ 1295 ABGB"
    found.add(m.replace(/\s+/g, " ").trim());
  }
  return [...found].sort();
}

/** RIS Suchworte query: the norm as a phrase. */
export function buildRisQuery(norm: string): string {
  return `"${norm}"`;
}

export function buildRisUrl(norm: string, sinceIso: string): string {
  const url = new URL(`${RIS_OGD_BASE}/judikatur`);
  url.searchParams.set("Applikation", "Justiz");
  url.searchParams.set("Suchworte", buildRisQuery(norm));
  url.searchParams.set("EntscheidungsdatumVon", sinceIso);
  url.searchParams.set("DokumenteProSeite", "Fifty");
  url.searchParams.set("Seitennummer", "1");
  return url.toString();
}

// ── RIS response mapping (tolerant, same shapes as legal-judgements.ts) ──

export interface RisTreffer {
  dokumentnummer: string;
  gericht: string;
  geschaeftszahl: string;
  datum: string;
  url: string;
}

function asArray(v: unknown): unknown[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function firstListItem(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.length > 0 ? String(value[0]) : "";
  if (typeof value === "object") {
    const item = (value as Record<string, unknown>).item;
    return firstListItem(item);
  }
  return String(value);
}

/** Extract Treffer from the RIS OgdSearchResult envelope. */
export function parseRisResponse(data: unknown): RisTreffer[] {
  const out: RisTreffer[] = [];
  if (!data || typeof data !== "object") return out;
  const result = (data as Record<string, unknown>).OgdSearchResult as
    | Record<string, unknown>
    | undefined;
  const docResults = result?.OgdDocumentResults as Record<string, unknown> | undefined;
  const refs = asArray(docResults?.OgdDocumentReference);
  for (const ref of refs) {
    if (!ref || typeof ref !== "object") continue;
    const data_ = (ref as Record<string, unknown>).Data as Record<string, unknown> | undefined;
    const metadaten = data_?.Metadaten as Record<string, unknown> | undefined;
    const allgemein = (metadaten?.Allgemein ?? {}) as Record<string, unknown>;
    const technisch = (metadaten?.Technisch ?? {}) as Record<string, unknown>;
    const judikatur = (metadaten?.Judikatur ?? {}) as Record<string, unknown>;
    const justiz = (judikatur.Justiz ?? {}) as Record<string, unknown>;
    const id = String(technisch.ID ?? allgemein.Dokumentnummer ?? "");
    if (!id) continue;
    out.push({
      dokumentnummer: id,
      gericht: firstListItem(justiz.Gericht) || "Unbekannt",
      geschaeftszahl: firstListItem(judikatur.Geschaeftszahl),
      datum: String(allgemein.Aenderungsdatum ?? judikatur.Entscheidungsdatum ?? ""),
      url: String(
        allgemein.DokumentUrl ??
          `https://ris.bka.gv.at/Dokument.wxe?Abfrage=Justiz&Dokumentnummer=${id}`
      ),
    });
  }
  return out;
}

// ── Watch run ───────────────────────────────────────────────

export interface JudikaturAlert {
  caseSlug: string;
  norm: string;
  treffer: RisTreffer[];
}

export interface WatchRunResult {
  akten: number;
  normen: number;
  neueEntscheidungen: number;
  alerts: JudikaturAlert[];
  alertSlugs: string[];
  fehler: string[];
}

interface GroundingPage {
  slug: string;
  compiled_truth: string | null;
}

interface SeenPage {
  slug: string;
  frontmatter: Record<string, unknown> | null;
}

export async function runJudikaturWatch(
  engine: WatchEngine,
  opts: {
    fetchImpl: FetchLike;
    /** Nur Entscheidungen ab diesem Datum (Default: 30 Tage zurück). */
    sinceIso?: string;
    heute?: string;
    sourceId?: string;
    /** Max Akten pro Lauf (Schutz gegen API-Hammering). */
    maxAkten?: number;
    /** Max Normen pro Akte. */
    maxNormenProAkte?: number;
  }
): Promise<WatchRunResult> {
  const heute = opts.heute ?? new Date().toISOString().slice(0, 10);
  const since =
    opts.sinceIso ??
    new Date(Date.parse(`${heute}T00:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);
  const maxAkten = opts.maxAkten ?? 25;
  const maxNormen = opts.maxNormenProAkte ?? 10;
  const fehler: string[] = [];

  const srcCond = opts.sourceId && opts.sourceId !== "default" ? "AND source_id = $1" : "";
  const srcParams = opts.sourceId && opts.sourceId !== "default" ? [opts.sourceId] : [];

  // 1) Grounding maps of open Akten
  const groundings = await engine.executeRaw<GroundingPage>(
    `SELECT slug, compiled_truth FROM pages
      WHERE deleted_at IS NULL ${srcCond}
        AND (slug LIKE 'legal-grounding/%' OR slug LIKE 'legal-grounding-maps/%')
      ORDER BY updated_at DESC
      LIMIT ${maxAkten}`,
    srcParams
  );

  const alerts: JudikaturAlert[] = [];
  const alertSlugs: string[] = [];
  let normenGesamt = 0;
  let neueGesamt = 0;
  let akten = 0;

  for (const g of groundings) {
    const caseSlug = g.slug.replace(/^legal-grounding(-maps)?\//, "");
    const normen = extrahiereNormen(g.compiled_truth ?? "").slice(0, maxNormen);
    if (normen.length === 0) continue;
    akten++;
    normenGesamt += normen.length;

    // 2) Seen-list
    const seenSlug = `judikatur-watch/seen-${caseSlug}`;
    const seenRows = await engine.executeRaw<SeenPage>(
      `SELECT slug, frontmatter FROM pages WHERE deleted_at IS NULL ${srcCond ? "AND source_id = $2" : ""} AND slug = $1 LIMIT 1`,
      srcCond ? [seenSlug, opts.sourceId] : [seenSlug]
    );
    const seen = new Set<string>(
      Array.isArray(seenRows[0]?.frontmatter?.seen)
        ? (seenRows[0]!.frontmatter!.seen as string[])
        : []
    );

    const caseAlerts: JudikaturAlert[] = [];
    for (const norm of normen) {
      try {
        const res = await opts.fetchImpl(buildRisUrl(norm, since));
        if (!res.ok) {
          fehler.push(`RIS HTTP ${res.status} für ${norm} (${caseSlug})`);
          continue;
        }
        const treffer = parseRisResponse(await res.json()).filter(
          (t) => !seen.has(t.dokumentnummer)
        );
        if (treffer.length > 0) {
          caseAlerts.push({ caseSlug, norm, treffer });
          for (const t of treffer) seen.add(t.dokumentnummer);
          neueGesamt += treffer.length;
        }
      } catch (err) {
        fehler.push(
          `RIS-Abfrage fehlgeschlagen für ${norm} (${caseSlug}): ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    if (caseAlerts.length > 0) {
      alerts.push(...caseAlerts);
      // 3) Alert note
      const alertSlug = `judikatur-alerts/${caseSlug}-${heute}`;
      const lines: string[] = [];
      lines.push(`# Neue Judikatur zu Ihren Normen — ${caseSlug}`);
      lines.push("");
      lines.push(`_Beobachtungszeitraum ab ${since}, Lauf vom ${heute}._`);
      lines.push("");
      for (const a of caseAlerts) {
        lines.push(`## ${a.norm}`);
        lines.push("");
        lines.push("| Gericht | GZ | Datum | Link |");
        lines.push("|---|---|---|---|");
        for (const t of a.treffer) {
          lines.push(`| ${t.gericht} | ${t.geschaeftszahl || t.dokumentnummer} | ${t.datum} | ${t.url} |`);
        }
        lines.push("");
      }
      lines.push(
        "_Relevanz anwaltlich prüfen — der Wächter meldet Fundstellen, keine Bewertung. Für eine Bewertung: Precedent-Matcher-Layer der Akte neu laufen lassen (rerun_layers)._"
      );
      const md = lines.join("\n");
      await engine.putPage(
        alertSlug,
        {
          type: "judikatur_alert",
          title: `Neue Judikatur — ${caseSlug} (${heute})`,
          compiled_truth: md,
          frontmatter: {
            case_ref: caseSlug,
            lauf: heute,
            seit: since,
            normen: caseAlerts.map((a) => a.norm),
            treffer: neueGesamt,
          },
        },
        { sourceId: opts.sourceId && opts.sourceId !== "default" ? opts.sourceId : undefined }
      );
      alertSlugs.push(alertSlug);

      // 4) Persist seen-list
      await engine.putPage(
        seenSlug,
        {
          type: "judikatur_watch_state",
          title: `Judikatur-Wächter Seen-Liste — ${caseSlug}`,
          compiled_truth: `# Seen-Liste ${caseSlug}\n\n${seen.size} Dokumentnummern beobachtet (Stand ${heute}).`,
          frontmatter: { case_ref: caseSlug, seen: [...seen], stand: heute },
        },
        { sourceId: opts.sourceId && opts.sourceId !== "default" ? opts.sourceId : undefined }
      );
    }
  }

  return {
    akten,
    normen: normenGesamt,
    neueEntscheidungen: neueGesamt,
    alerts,
    alertSlugs,
    fehler,
  };
}
