import path from "node:path";
import { promises as fs } from "node:fs";
import type { RawCitation, GroundedCitation } from "@/lib/types";

// ── Corpus knowledge base ─────────────────────────────────────────────

export const CORPUS_META: Record<
  string,
  { jurisdiction: "at" | "de" | "ch" | "eu"; label: string; file: string }
> = {
  // ── Austria (21 statutes) ──────────────────────────────────────────
  abgb: { jurisdiction: "at", label: "ABGB", file: "at/abgb.md" },
  ahg: { jurisdiction: "at", label: "AHG", file: "at/ahg.md" },
  aktg_at: { jurisdiction: "at", label: "AktG (AT)", file: "at/aktg-at.md" },
  angg: { jurisdiction: "at", label: "AngG", file: "at/angg.md" },
  arbvg: { jurisdiction: "at", label: "ArbVG", file: "at/arbvg.md" },
  asvg: { jurisdiction: "at", label: "ASVG", file: "at/asvg.md" },
  avg: { jurisdiction: "at", label: "AVG", file: "at/avg.md" },
  bao: { jurisdiction: "at", label: "BAO", file: "at/bao.md" },
  eo: { jurisdiction: "at", label: "EO", file: "at/eo.md" },
  estg_at: { jurisdiction: "at", label: "EStG (AT)", file: "at/estg-at.md" },
  gmbhg_at: { jurisdiction: "at", label: "GmbHG (AT)", file: "at/gmbhg-at.md" },
  io: { jurisdiction: "at", label: "IO", file: "at/io.md" },
  kschg: { jurisdiction: "at", label: "KSchG", file: "at/kschg.md" },
  kstg_at: { jurisdiction: "at", label: "KStG (AT)", file: "at/kstg-at.md" },
  mrg: { jurisdiction: "at", label: "MRG", file: "at/mrg.md" },
  stgb_at: { jurisdiction: "at", label: "StGB (AT)", file: "at/stgb-at.md" },
  stpo_at: { jurisdiction: "at", label: "StPO (AT)", file: "at/stpo-at.md" },
  stvo_at: { jurisdiction: "at", label: "StVO (AT)", file: "at/stvo-at.md" },
  ugb: { jurisdiction: "at", label: "UGB", file: "at/ugb.md" },
  ustg_at: { jurisdiction: "at", label: "UStG (AT)", file: "at/ustg-at.md" },
  zpo_at: { jurisdiction: "at", label: "ZPO (AT)", file: "at/zpo-at.md" },
  // ── Germany (13 statutes) ──────────────────────────────────────────
  ao: { jurisdiction: "de", label: "AO", file: "de/ao.md" },
  bgb: { jurisdiction: "de", label: "BGB", file: "de/bgb.md" },
  estg: { jurisdiction: "de", label: "EStG", file: "de/estg.md" },
  famfg: { jurisdiction: "de", label: "FamFG", file: "de/famfg.md" },
  gg: { jurisdiction: "de", label: "GG", file: "de/gg.md" },
  gmbhg: { jurisdiction: "de", label: "GmbHG", file: "de/gmbhg.md" },
  hgb: { jurisdiction: "de", label: "HGB", file: "de/hgb.md" },
  inso: { jurisdiction: "de", label: "InsO", file: "de/inso.md" },
  stgb: { jurisdiction: "de", label: "StGB", file: "de/stgb.md" },
  stpo: { jurisdiction: "de", label: "StPO", file: "de/stpo.md" },
  ustg: { jurisdiction: "de", label: "UStG", file: "de/ustg.md" },
  uwg: { jurisdiction: "de", label: "UWG", file: "de/uwg.md" },
  zpo: { jurisdiction: "de", label: "ZPO", file: "de/zpo.md" },
  // ── Switzerland (3 statutes) ───────────────────────────────────────
  or: { jurisdiction: "ch", label: "OR", file: "ch/or.md" },
  stgb_ch: { jurisdiction: "ch", label: "StGB (CH)", file: "ch/stgb.md" },
  zgb: { jurisdiction: "ch", label: "ZGB", file: "ch/zgb.md" },
  // ── EU (key regulations via EUR-Lex) ────────────────────────────────
  dsgvo: { jurisdiction: "eu", label: "DSGVO", file: "eu/dsgvo.md" },
  dsrl: { jurisdiction: "eu", label: "DSRL", file: "eu/dsrl.md" },
  eprivacy: { jurisdiction: "eu", label: "ePrivacy", file: "eu/eprivacy.md" },
  romi: { jurisdiction: "eu", label: "Rom I", file: "eu/romi.md" },
  romii: { jurisdiction: "eu", label: "Rom II", file: "eu/romii.md" },
  brusselsibis: { jurisdiction: "eu", label: "Brussels Ibis", file: "eu/brusselsibis.md" },
  euco: { jurisdiction: "eu", label: "EuCO", file: "eu/euco.md" },
};

export const CORPUS_DIR = path.join(process.cwd(), "law-corpus");
export const CORPUS_SPLIT_DIR = path.join(process.cwd(), "law-corpus-split");

// ── Helpers ───────────────────────────────────────────────────────────

export function normalizeStatuteCode(code: string): string {
  return code
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_");
}

export async function lookupSplitParagraph(
  code: string,
  paragraph: string
): Promise<string | null> {
  const normalized = normalizeStatuteCode(code);
  const canonicalKey = Object.keys(CORPUS_META).find(
    (k) =>
      k === normalized ||
      k === normalized.replace(/_at$/, "_at") ||
      CORPUS_META[k].label.toLowerCase().includes(code.toLowerCase())
  );

  const abbr = canonicalKey
    ? CORPUS_META[canonicalKey].label.match(/^([A-Z][A-Za-z\u00c4\u00d6\u00dc]+)/)?.[1] ||
      code.toUpperCase()
    : code.toUpperCase();

  const jur = canonicalKey ? CORPUS_META[canonicalKey].jurisdiction : "de";
  const paraClean = paragraph.replace(/^\u00a7\s*/, "").trim();
  const slug = `${abbr.toLowerCase()}-par-${paraClean.toLowerCase()}`;
  const splitPath = path.join(CORPUS_SPLIT_DIR, jur, `${slug}.md`);

  try {
    const content = await fs.readFile(splitPath, "utf8");
    if (content.startsWith("---")) {
      const end = content.indexOf("---", 3);
      return end !== -1 ? content.slice(end + 3).trimStart() : content;
    }
    return content;
  } catch {
    return null;
  }
}

export async function lookupCorpusParagraph(
  codeKey: string,
  paragraph: string
): Promise<string | null> {
  const meta = CORPUS_META[codeKey];
  if (!meta) return null;

  try {
    const text = await fs.readFile(path.join(CORPUS_DIR, meta.file), "utf8");
    const paraNum = paragraph.replace(/^\u00a7\s*/, "").trim();
    const escapedPara = paraNum.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const deMatch = text.match(
      new RegExp(`## \u00a7 ${escapedPara}[^\\n]*\\n([\\s\\S]{0,1500}?)(?=\\n## \u00a7|$)`)
    );
    if (deMatch) return deMatch[1].trim();

    const atIdx = text.search(new RegExp(`\u00a7\\s*${escapedPara}\\.`));
    if (atIdx !== -1) {
      const nextAt = text.search(new RegExp(`\u00a7\\s*${String(Number(paraNum) + 1)}\\.`));
      const end = nextAt !== -1 ? nextAt : atIdx + 1000;
      return text.slice(atIdx, end).slice(0, 800).trim();
    }

    return null;
  } catch {
    return null;
  }
}

export async function groundCitations(rawCitations: RawCitation[]): Promise<GroundedCitation[]> {
  const results: GroundedCitation[] = [];

  for (const cite of rawCitations.slice(0, 20)) {
    if (!cite.code || !cite.paragraph) continue;

    const code = String(cite.code).trim();
    const paragraph = String(cite.paragraph).trim();
    const context = String(cite.context || "").trim();

    let sourceText = await lookupSplitParagraph(code, paragraph);

    if (!sourceText) {
      const normalized = normalizeStatuteCode(code);
      const codeKey = Object.keys(CORPUS_META).find(
        (k) => k === normalized || CORPUS_META[k].label.toUpperCase().startsWith(code.toUpperCase())
      );
      if (codeKey) {
        sourceText = await lookupCorpusParagraph(codeKey, paragraph);
      }
    }

    results.push({
      code,
      paragraph,
      context,
      verified: sourceText !== null,
      ...(sourceText ? { source_text: sourceText.slice(0, 600) } : {}),
    });
  }

  return results;
}
