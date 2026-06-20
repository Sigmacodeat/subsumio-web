
import { z } from "zod";
import path from "node:path";
import { promises as fs } from "node:fs";
import { createHandler, apiError } from "@/lib/api-handler";

const statuteQuerySchema = z.object({
  code: z.string().optional(),
  paragraph: z.string().optional(),
  para: z.string().optional(),
  q: z.string().optional(),
  query: z.string().optional(),
  jurisdiction: z.string().optional(),
});

/** All statutes available in the bundled law-corpus. */
const CORPUS_META: Record<string, { jurisdiction: "at" | "de" | "ch"; label: string; file: string }> = {
  // Austria
  abgb:    { jurisdiction: "at", label: "ABGB — Allgemeines bürgerliches Gesetzbuch (AT)", file: "at/abgb.md" },
  ahg:     { jurisdiction: "at", label: "AHG — Amtshaftungsgesetz (AT)", file: "at/ahg.md" },
  bao:     { jurisdiction: "at", label: "BAO — Bundesabgabenordnung (AT)", file: "at/bao.md" },
  eo:      { jurisdiction: "at", label: "EO — Exekutionsordnung (AT)", file: "at/eo.md" },
  stgb_at: { jurisdiction: "at", label: "StGB (AT) — Strafgesetzbuch Österreich", file: "at/stgb-at.md" },
  stpo_at: { jurisdiction: "at", label: "StPO (AT) — Strafprozessordnung Österreich", file: "at/stpo-at.md" },
  ugb:     { jurisdiction: "at", label: "UGB — Unternehmensgesetzbuch (AT)", file: "at/ugb.md" },
  zpo_at:  { jurisdiction: "at", label: "ZPO (AT) — Zivilprozessordnung Österreich", file: "at/zpo-at.md" },
  // Germany
  ao:      { jurisdiction: "de", label: "AO — Abgabenordnung (DE)", file: "de/ao.md" },
  bgb:     { jurisdiction: "de", label: "BGB — Bürgerliches Gesetzbuch (DE)", file: "de/bgb.md" },
  estg:    { jurisdiction: "de", label: "EStG — Einkommensteuergesetz (DE)", file: "de/estg.md" },
  famfg:   { jurisdiction: "de", label: "FamFG — Familienverfahrensgesetz (DE)", file: "de/famfg.md" },
  gg:      { jurisdiction: "de", label: "GG — Grundgesetz (DE)", file: "de/gg.md" },
  gmbhg:   { jurisdiction: "de", label: "GmbHG — GmbH-Gesetz (DE)", file: "de/gmbhg.md" },
  hgb:     { jurisdiction: "de", label: "HGB — Handelsgesetzbuch (DE)", file: "de/hgb.md" },
  inso:    { jurisdiction: "de", label: "InsO — Insolvenzordnung (DE)", file: "de/inso.md" },
  stgb:    { jurisdiction: "de", label: "StGB — Strafgesetzbuch (DE)", file: "de/stgb.md" },
  stpo:    { jurisdiction: "de", label: "StPO — Strafprozessordnung (DE)", file: "de/stpo.md" },
  ustg:    { jurisdiction: "de", label: "UStG — Umsatzsteuergesetz (DE)", file: "de/ustg.md" },
  uwg:     { jurisdiction: "de", label: "UWG — Gesetz gegen unlauteren Wettbewerb (DE)", file: "de/uwg.md" },
  zpo:     { jurisdiction: "de", label: "ZPO — Zivilprozessordnung (DE)", file: "de/zpo.md" },
  // Switzerland
  or:      { jurisdiction: "ch", label: "OR — Obligationenrecht (CH)", file: "ch/or.md" },
  stgb_ch: { jurisdiction: "ch", label: "StGB (CH) — Strafgesetzbuch Schweiz", file: "ch/stgb.md" },
  zgb:     { jurisdiction: "ch", label: "ZGB — Zivilgesetzbuch (CH)", file: "ch/zgb.md" },
};

const CORPUS_DIR = path.join(process.cwd(), "law-corpus");

const CORPUS_SPLIT_DIR = path.join(process.cwd(), "law-corpus-split");

/**
 * Try to load a specific paragraph from the pre-split corpus directory.
 * Returns the page content or null if not found.
 */
async function loadSplitPage(
  meta: (typeof CORPUS_META)[string],
  paragraph: string,
): Promise<string | null> {
  const abbr = meta.label.match(/^([A-ZÄÖÜ][A-Za-zÄÖÜäöüß_]+)/)?.[1] || "";
  if (!abbr) return null;

  const paraClean = paragraph.replace(/^§\s*/, "").trim();
  const slug = `${abbr.toLowerCase()}-par-${paraClean.toLowerCase()}`;
  const filePath = path.join(CORPUS_SPLIT_DIR, meta.jurisdiction, `${slug}.md`);

  try {
    const content = await fs.readFile(filePath, "utf8");
    const fmEnd = content.indexOf("---", 3);
    return fmEnd !== -1 ? content.slice(fmEnd + 3).trimStart() : content;
  } catch {
    return null;
  }
}

/** Read and search a statute file for paragraph matches. */
async function searchStatute(
  fileKey: string,
  query: string,
  paragraph?: string,
): Promise<{ excerpt: string; paragraphHit?: string }[]> {
  const meta = CORPUS_META[fileKey];
  if (!meta) return [];

  // ── Fast path: exact paragraph lookup from pre-split corpus ──────────
  if (paragraph) {
    const splitContent = await loadSplitPage(meta, paragraph);
    if (splitContent) {
      const paraNum = paragraph.replace(/^§\s*/, "").trim();
      return [{
        excerpt: splitContent.slice(0, 1500).trim(),
        paragraphHit: `§ ${paraNum}`,
      }];
    }
  }

  // ── Slow path: full-text search in raw corpus file ───────────────────
  const fullPath = path.join(CORPUS_DIR, meta.file);
  let text: string;
  try {
    text = await fs.readFile(fullPath, "utf8");
  } catch {
    return [];
  }

  const queryLower = query.toLowerCase();
  const results: { excerpt: string; paragraphHit?: string }[] = [];

  if (meta.jurisdiction === "de") {
    // DE: split on markdown `## §` headings
    const lines = text.split("\n");
    const SECTION_RE = /^#{1,4}\s*§\s*(\d+[a-zA-Z]?)/;
    let currentSection = "";
    let currentLines: string[] = [];

    const flush = () => {
      if (currentLines.length === 0) return;
      const block = currentLines.join("\n");
      const hits =
        (paragraph && currentSection.replace(/^§\s*/, "").startsWith(paragraph)) ||
        (!paragraph && block.toLowerCase().includes(queryLower));
      if (hits) {
        results.push({
          excerpt: block.slice(0, 1500).trim(),
          paragraphHit: currentSection || undefined,
        });
      }
      currentLines = [];
    };

    for (const line of lines) {
      const m = line.match(SECTION_RE);
      if (m) {
        flush();
        currentSection = `§ ${m[1]}`;
      }
      currentLines.push(line);
      if (results.length >= 10) break;
    }
    flush();
  } else {
    // AT/CH: search inline `§ N.` patterns in flat text
    const body = text.includes("---") ? text.slice(text.indexOf("---", 3) + 3) : text;
    const paraRe = /§\s*(\d+[a-zA-Z]?)\./g;
    let m: RegExpExecArray | null;
    const positions: { num: string; idx: number }[] = [];

    while ((m = paraRe.exec(body)) !== null) {
      positions.push({ num: m[1], idx: m.index });
    }

    for (let i = 0; i < positions.length && results.length < 10; i++) {
      const { num, idx } = positions[i];
      const endIdx = i + 1 < positions.length ? positions[i + 1].idx : idx + 2000;
      const block = body.slice(idx, endIdx).trim();

      const hits =
        (paragraph && num === paragraph.replace(/^§\s*/, "").trim()) ||
        (!paragraph && block.toLowerCase().includes(queryLower));

      if (hits) {
        results.push({
          excerpt: block.slice(0, 1500).trim(),
          paragraphHit: `§ ${num}`,
        });
      }
    }
  }

  return results.slice(0, 10);
}

/**
 * GET /api/legal/statute?code=bgb&paragraph=433&q=Kaufvertrag
 * Search for a specific statute paragraph or keyword in the bundled law corpus.
 *
 * Params:
 *   code        string   required  Statute key: bgb, abgb, zpo, hgb, etc.
 *   paragraph   string   optional  Paragraph number: "433", "1295", "Art. 15"
 *   q           string   optional  Free text search within the statute
 *   jurisdiction string  optional  Filter by "at" | "de" | "ch" (returns all matching statutes)
 *
 * GET /api/legal/statute — without code: returns list of all available statutes.
 */
export const GET = createHandler(
  {
    action: "legal.statute",
    rateTier: "standard",
    query: statuteQuerySchema,
  },
  async (_ctx, _body, query, _req) => {
    const code = (query.code ?? "").toLowerCase();
    const paragraph = query.paragraph || query.para || "";
    const q = query.q || query.query || "";
    const jurisdictionFilter = query.jurisdiction || "";

    if (!code) {
      const list = Object.entries(CORPUS_META)
        .filter(([, m]) => !jurisdictionFilter || m.jurisdiction === jurisdictionFilter)
        .map(([key, m]) => ({ code: key, label: m.label, jurisdiction: m.jurisdiction }));
      return Response.json({ statutes: list, total: list.length });
    }

    if (!CORPUS_META[code]) {
      const available = Object.keys(CORPUS_META);
      return apiError("unknown_statute", `Unknown statute: ${code}`, 400, { available });
    }
    if (!paragraph && !q) {
      return apiError("paragraph_or_q_required", "?code=bgb&paragraph=433 or ?code=bgb&q=Kaufvertrag", 400);
    }

    const hits = await searchStatute(code, q || paragraph, paragraph || undefined);
    if (hits.length === 0) {
      return Response.json({ results: [], total: 0, statute: CORPUS_META[code].label });
    }

    return Response.json({
      statute: CORPUS_META[code].label,
      jurisdiction: CORPUS_META[code].jurisdiction,
      query: q || undefined,
      paragraph: paragraph || undefined,
      results: hits,
      total: hits.length,
    });
  },
);
