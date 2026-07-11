/**
 * verhandlungsmappe.ts — Verhandlungsmappen-Generator (Gap E).
 *
 * Composes the Tagsatzungs-/Verhandlungsmappe an Austrian litigator carries
 * into the courtroom — DETERMINISTICALLY, from pages the pipeline has
 * already produced. No LLM call, no new analysis; pure assembly:
 *
 *   1. Deckblatt          — Akte, GZ, Termin
 *   2. Chronologie        — aus dem ON-Index (on-indexes/<case>)
 *   3. Beweismittel       — Beilagen aus dem ON-Index (§ 379 GVgo Zitierform)
 *   4. §-Spickzettel      — aus der Legal-Grounding-Map
 *   5. Beweislast         — aus burden-of-proof/<case>
 *   6. Offene Sachverhaltslücken + Fragenkatalog — aus fact-gaps/<case>
 *   7. Schwachstellen der Gegenseite — aus counter-arguments/<case>
 *      (was der Opponent-Simulator gegen UNS gefunden hat, ist spiegelbildlich
 *       die Checkliste, was die Gegenseite vorbringen wird)
 *   8. Vergleichsrahmen   — aus settlement-analysis/<case> (ZOPA als Leitplanke)
 *   9. Fristen-Snapshot   — aus deadline-calendars/<case>
 *
 * Sections whose source page is missing are listed under "Fehlende
 * Grundlagen" instead of silently dropped — the attorney sees what the
 * Mappe could NOT cover.
 *
 * Output: one markdown page `verhandlungsmappen/<case>` (type
 * verhandlungsmappe, attorney_review_required: true).
 */

import { parseDeadlineTable, parseDeadlineDate } from "./fristenbuch.ts";
import { klassifiziereFrist } from "./frist-engine.ts";

export interface MappeEngine {
  executeRaw<T>(sql: string, params?: unknown[]): Promise<T[]>;
  putPage(
    slug: string,
    page: {
      type: string;
      title: string;
      compiled_truth: string;
      frontmatter: Record<string, unknown>;
    },
    opts?: { sourceId?: string }
  ): Promise<unknown>;
}

interface PageRow {
  slug: string;
  title: string;
  compiled_truth: string | null;
  frontmatter: Record<string, unknown> | null;
}

export interface VerhandlungsmappeOpts {
  caseSlug: string;
  /** Verhandlungstermin (ISO), erscheint am Deckblatt. */
  termin?: string;
  /** Heute (ISO) für den Fristen-Snapshot; Default: now. */
  heute?: string;
  sourceId?: string;
}

export interface VerhandlungsmappeResult {
  slug: string;
  markdown: string;
  /** Quell-Pages, die eingeflossen sind. */
  quellen: string[];
  /** Sektionen ohne Quelle (Pipeline-Layer nicht gelaufen). */
  fehlend: string[];
}

async function loadPage(
  engine: MappeEngine,
  slug: string,
  sourceId?: string
): Promise<PageRow | null> {
  const conds = ["deleted_at IS NULL", "slug = $1"];
  const params: string[] = [slug];
  if (sourceId && sourceId !== "default") {
    params.push(sourceId);
    conds.push(`source_id = $${params.length}`);
  }
  const rows = await engine.executeRaw<PageRow>(
    `SELECT slug, title, compiled_truth, frontmatter FROM pages WHERE ${conds.join(" AND ")} LIMIT 1`,
    params
  );
  return rows[0] ?? null;
}

/** Strip YAML frontmatter + Facts fences from a page body for embedding. */
export function extractBody(compiledTruth: string): string {
  let body = compiledTruth;
  if (body.startsWith("---")) {
    const end = body.indexOf("\n---", 3);
    if (end !== -1) body = body.slice(end + 4);
  }
  // Remove gbrain facts fences (## Facts + markers)
  body = body.replace(
    /## Facts\s*\n+<!---? ?gbrain:facts:begin[\s\S]*?gbrain:facts:end ?-?-->/g,
    ""
  );
  return body.trim();
}

/** Extract markdown table rows from the ON index whose Typ column says Beilage. */
export function extractBeilagen(onIndexBody: string): string[] {
  const beilagen: string[] = [];
  for (const line of onIndexBody.split("\n")) {
    const t = line.trim();
    if (t.startsWith("|") && /beilage/i.test(t)) beilagen.push(t);
  }
  return beilagen;
}

export async function generiereVerhandlungsmappe(
  engine: MappeEngine,
  opts: VerhandlungsmappeOpts
): Promise<VerhandlungsmappeResult> {
  const { caseSlug } = opts;
  if (!caseSlug) throw new Error("verhandlungsmappe: caseSlug is required");
  const heute = opts.heute ?? new Date().toISOString().slice(0, 10);

  // The pipeline writes on-indexes/ (main path) and on-indices/ (rerun path);
  // try both.
  const sources: Array<{ key: string; slugs: string[]; titel: string }> = [
    {
      key: "on_index",
      slugs: [`on-indexes/${caseSlug}`, `on-indices/${caseSlug}`],
      titel: "Chronologie (ON-Index)",
    },
    {
      key: "grounding",
      slugs: [`legal-grounding/${caseSlug}`, `legal-grounding-maps/${caseSlug}`],
      titel: "§-Spickzettel (Grounding-Map)",
    },
    { key: "burden", slugs: [`burden-of-proof/${caseSlug}`], titel: "Beweislastverteilung" },
    {
      key: "factgaps",
      slugs: [`fact-gaps/${caseSlug}`],
      titel: "Sachverhaltslücken + Fragenkatalog",
    },
    { key: "counter", slugs: [`counter-arguments/${caseSlug}`], titel: "Erwartete Gegenargumente" },
    {
      key: "settlement",
      slugs: [`settlement-analysis/${caseSlug}`],
      titel: "Vergleichsrahmen (BATNA/ZOPA)",
    },
    { key: "deadlines", slugs: [`deadline-calendars/${caseSlug}`], titel: "Fristen-Snapshot" },
  ];

  const loaded = new Map<string, PageRow>();
  const quellen: string[] = [];
  const fehlend: string[] = [];

  for (const s of sources) {
    let page: PageRow | null = null;
    for (const slug of s.slugs) {
      page = await loadPage(engine, slug, opts.sourceId);
      if (page) break;
    }
    if (page) {
      loaded.set(s.key, page);
      quellen.push(page.slug);
    } else {
      fehlend.push(s.titel);
    }
  }

  const lines: string[] = [];
  lines.push("---");
  lines.push(`title: "Verhandlungsmappe — ${caseSlug}"`);
  lines.push("type: verhandlungsmappe");
  lines.push(`case_ref: ${caseSlug}`);
  if (opts.termin) lines.push(`termin: "${opts.termin}"`);
  lines.push(`erstellt: "${heute}"`);
  lines.push("attorney_review_required: true");
  lines.push("---");
  lines.push("");
  lines.push(`# Verhandlungsmappe — ${caseSlug}`);
  lines.push("");
  if (opts.termin) lines.push(`**Verhandlungstermin:** ${opts.termin}`);
  lines.push(`**Stand:** ${heute}`);
  lines.push("");
  lines.push(
    "> _Deterministisch aus den Pipeline-Analysen komponiert. Ersetzt keine anwaltliche Vorbereitung — jede Sektion vor der Tagsatzung prüfen._"
  );
  lines.push("");

  // 2. Chronologie
  const onIndex = loaded.get("on_index");
  if (onIndex) {
    lines.push("## 1. Chronologie des Akts (ON-Index)");
    lines.push("");
    lines.push(extractBody(onIndex.compiled_truth ?? ""));
    lines.push("");

    // 3. Beweismittel (Beilagen)
    const beilagen = extractBeilagen(extractBody(onIndex.compiled_truth ?? ""));
    lines.push("## 2. Beweismittelverzeichnis (Beilagen)");
    lines.push("");
    if (beilagen.length > 0) {
      lines.push("_Zitierform § 379 GVgo: Kläger ./A ./B — Gegner ./1 ./2 — Dritte ./I ./II_");
      lines.push("");
      for (const b of beilagen) lines.push(b);
    } else {
      lines.push("_Keine als Beilage klassifizierten ON-Einträge gefunden._");
    }
    lines.push("");
  }

  // 4. §-Spickzettel
  const grounding = loaded.get("grounding");
  if (grounding) {
    lines.push("## 3. §-Spickzettel (rechtliche Grundlagen)");
    lines.push("");
    lines.push(extractBody(grounding.compiled_truth ?? ""));
    lines.push("");
  }

  // 5. Beweislast
  const burden = loaded.get("burden");
  if (burden) {
    lines.push("## 4. Beweislastverteilung");
    lines.push("");
    lines.push(extractBody(burden.compiled_truth ?? ""));
    lines.push("");
  }

  // 6. Fragenkatalog
  const factgaps = loaded.get("factgaps");
  if (factgaps) {
    lines.push("## 5. Offene Sachverhaltslücken — Fragenkatalog für die Verhandlung");
    lines.push("");
    lines.push(extractBody(factgaps.compiled_truth ?? ""));
    lines.push("");
  }

  // 7. Gegenargumente
  const counter = loaded.get("counter");
  if (counter) {
    lines.push("## 6. Erwartete Argumentation der Gegenseite");
    lines.push("");
    lines.push(
      "_Aus dem Opponent-Simulator: Was gegen unsere Entwürfe gefunden wurde, wird die Gegenseite mündlich vorbringen — Widerlegungen bereithalten._"
    );
    lines.push("");
    lines.push(extractBody(counter.compiled_truth ?? ""));
    lines.push("");
  }

  // 8. Vergleichsrahmen
  const settlement = loaded.get("settlement");
  if (settlement) {
    lines.push("## 7. Vergleichsrahmen (Leitplanken für Vergleichsgespräche)");
    lines.push("");
    lines.push(extractBody(settlement.compiled_truth ?? ""));
    lines.push("");
  }

  // 9. Fristen-Snapshot
  const deadlines = loaded.get("deadlines");
  if (deadlines) {
    lines.push("## 8. Fristen-Snapshot");
    lines.push("");
    const rows = parseDeadlineTable(deadlines.compiled_truth ?? "");
    if (rows.length > 0) {
      lines.push("| Datum | Frist | Status | Rechtsgrundlage |");
      lines.push("|---|---|---|---|");
      for (const r of rows) {
        const iso = parseDeadlineDate(r.datum);
        const status = iso ? klassifiziereFrist(iso, heute) : "prüfen";
        lines.push(`| ${r.datum} | ${r.frist} | ${status} | ${r.rechtsgrundlage} |`);
      }
    } else {
      lines.push("_Keine Fristen im Kalender._");
    }
    lines.push("");
  }

  if (fehlend.length > 0) {
    lines.push("## Fehlende Grundlagen");
    lines.push("");
    lines.push(
      "_Diese Sektionen konnten nicht befüllt werden (Pipeline-Layer nicht gelaufen oder Page fehlt):_"
    );
    lines.push("");
    for (const f of fehlend) lines.push(`- ${f}`);
    lines.push("");
  }

  const markdown = lines.join("\n");
  const slug = `verhandlungsmappen/${caseSlug}`;
  await engine.putPage(
    slug,
    {
      type: "verhandlungsmappe",
      title: `Verhandlungsmappe — ${caseSlug}`,
      compiled_truth: markdown,
      frontmatter: {
        case_ref: caseSlug,
        termin: opts.termin ?? null,
        erstellt: heute,
        attorney_review_required: true,
        quellen,
        fehlend,
      },
    },
    { sourceId: opts.sourceId && opts.sourceId !== "default" ? opts.sourceId : undefined }
  );

  return { slug, markdown, quellen, fehlend };
}
