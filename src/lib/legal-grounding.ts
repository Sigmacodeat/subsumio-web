import path from "node:path";
import { promises as fs } from "node:fs";
import type { RawCitation, GroundedCitation } from "@/lib/types";

// ── Corpus knowledge base ─────────────────────────────────────────────

export const CORPUS_META: Record<
  string,
  { jurisdiction: "at" | "de" | "ch" | "eu"; label: string; file: string }
> = {
  // ── Austria (34 statutes) ──────────────────────────────────────────
  abgb: { jurisdiction: "at", label: "ABGB", file: "at/abgb.md" },
  ahg: { jurisdiction: "at", label: "AHG", file: "at/ahg.md" },
  aktg_at: { jurisdiction: "at", label: "AktG (AT)", file: "at/aktg-at.md" },
  angg: { jurisdiction: "at", label: "AngG", file: "at/angg.md" },
  arbvg: { jurisdiction: "at", label: "ArbVG", file: "at/arbvg.md" },
  asvg: { jurisdiction: "at", label: "ASVG", file: "at/asvg.md" },
  au_strg: { jurisdiction: "at", label: "AußStrG", file: "at/au-strg.md" },
  avg: { jurisdiction: "at", label: "AVG", file: "at/avg.md" },
  bao: { jurisdiction: "at", label: "BAO", file: "at/bao.md" },
  brag: { jurisdiction: "at", label: "BRagG", file: "at/brag.md" },
  dsg_at: { jurisdiction: "at", label: "DSG (AT)", file: "at/dsg-at.md" },
  ecg: { jurisdiction: "at", label: "ECG", file: "at/ecg.md" },
  eo: { jurisdiction: "at", label: "EO", file: "at/eo.md" },
  estg_at: { jurisdiction: "at", label: "EStG (AT)", file: "at/estg-at.md" },
  gebg: { jurisdiction: "at", label: "GebG", file: "at/gebg.md" },
  gewo_at: { jurisdiction: "at", label: "GewO (AT)", file: "at/gewo-at.md" },
  gmbhg_at: { jurisdiction: "at", label: "GmbHG (AT)", file: "at/gmbhg-at.md" },
  gog: { jurisdiction: "at", label: "GOG", file: "at/gog.md" },
  io: { jurisdiction: "at", label: "IO", file: "at/io.md" },
  kartg: { jurisdiction: "at", label: "KartG", file: "at/kartg.md" },
  kschg: { jurisdiction: "at", label: "KSchG", file: "at/kschg.md" },
  kstg_at: { jurisdiction: "at", label: "KStG (AT)", file: "at/kstg-at.md" },
  mrg: { jurisdiction: "at", label: "MRG", file: "at/mrg.md" },
  mschg: { jurisdiction: "at", label: "MSchG", file: "at/mschg.md" },
  rao: { jurisdiction: "at", label: "RAO", file: "at/rao.md" },
  stgb_at: { jurisdiction: "at", label: "StGB (AT)", file: "at/stgb-at.md" },
  stpo_at: { jurisdiction: "at", label: "StPO (AT)", file: "at/stpo-at.md" },
  stvo_at: { jurisdiction: "at", label: "StVO (AT)", file: "at/stvo-at.md" },
  tkg: { jurisdiction: "at", label: "TKG", file: "at/tkg.md" },
  ugb: { jurisdiction: "at", label: "UGB", file: "at/ugb.md" },
  urhg_at: { jurisdiction: "at", label: "UrhG (AT)", file: "at/urhg-at.md" },
  ustg_at: { jurisdiction: "at", label: "UStG (AT)", file: "at/ustg-at.md" },
  weg: { jurisdiction: "at", label: "WEG", file: "at/weg.md" },
  zpo_at: { jurisdiction: "at", label: "ZPO (AT)", file: "at/zpo-at.md" },
  // ── Austria (remaining statutes — full law-firm coverage) ──────────
  alvg: { jurisdiction: "at", label: "AlVG", file: "at/alvg.md" },
  amg_at: { jurisdiction: "at", label: "AMG (AT)", file: "at/amg.md" },
  arg: { jurisdiction: "at", label: "ARG", file: "at/arg.md" },
  asylg: { jurisdiction: "at", label: "AsylG", file: "at/asylg.md" },
  aufenthg: { jurisdiction: "at", label: "NAG", file: "at/aufenthg.md" },
  auslbg: { jurisdiction: "at", label: "AuslBG", file: "at/auslbg.md" },
  avrag: { jurisdiction: "at", label: "AVRAG", file: "at/avrag.md" },
  awg: { jurisdiction: "at", label: "AWG", file: "at/awg.md" },
  azg: { jurisdiction: "at", label: "AZG", file: "at/azg.md" },
  b_vg: { jurisdiction: "at", label: "B-VG", file: "at/b-vg.md" },
  bbg: { jurisdiction: "at", label: "BBG", file: "at/bbg.md" },
  bdg: { jurisdiction: "at", label: "BDG", file: "at/bdg.md" },
  bewg_at: { jurisdiction: "at", label: "BewG (AT)", file: "at/bewg.md" },
  buag: { jurisdiction: "at", label: "BUAG", file: "at/buag.md" },
  bvergg: { jurisdiction: "at", label: "BVergG", file: "at/bvergg.md" },
  chemg: { jurisdiction: "at", label: "ChemG", file: "at/chemg.md" },
  e_govg: { jurisdiction: "at", label: "E-GovG", file: "at/e-govg.md" },
  eheg: { jurisdiction: "at", label: "EheG", file: "at/eheg.md" },
  eiwog: { jurisdiction: "at", label: "ElWOG", file: "at/eiwog.md" },
  epig: { jurisdiction: "at", label: "EpiG", file: "at/epig.md" },
  forstg: { jurisdiction: "at", label: "ForstG", file: "at/forstg.md" },
  fpg: { jurisdiction: "at", label: "FPG", file: "at/fpg.md" },
  glbg: { jurisdiction: "at", label: "GlBG", file: "at/glbg.md" },
  grstg: { jurisdiction: "at", label: "GrEStG (AT)", file: "at/grstg.md" },
  gukg: { jurisdiction: "at", label: "GuKG", file: "at/gukg.md" },
  gwg: { jurisdiction: "at", label: "GWG", file: "at/gwg.md" },
  jgg_at: { jurisdiction: "at", label: "JGG (AT)", file: "at/jgg-at.md" },
  kag: { jurisdiction: "at", label: "KAG", file: "at/kag.md" },
  medieng: { jurisdiction: "at", label: "MedienG", file: "at/medieng.md" },
  mschg_at: { jurisdiction: "at", label: "MSchG (Marken, AT)", file: "at/mschg-at.md" },
  n_g: { jurisdiction: "at", label: "N-G", file: "at/n-g.md" },
  patg: { jurisdiction: "at", label: "PatG", file: "at/patg.md" },
  pstg: { jurisdiction: "at", label: "PStG", file: "at/pstg.md" },
  smg: { jurisdiction: "at", label: "SMG", file: "at/smg.md" },
  spg: { jurisdiction: "at", label: "SPG", file: "at/spg.md" },
  stbg: { jurisdiction: "at", label: "STBG", file: "at/stbg.md" },
  stregg: { jurisdiction: "at", label: "StRegG", file: "at/stregg.md" },
  tilgg: { jurisdiction: "at", label: "TilgG", file: "at/tilgg.md" },
  tschg: { jurisdiction: "at", label: "TSchG", file: "at/tschg.md" },
  vbvg: { jurisdiction: "at", label: "VBVG", file: "at/vbvg.md" },
  vkgg: { jurisdiction: "at", label: "VKGG", file: "at/vkgg.md" },
  vstg: { jurisdiction: "at", label: "VStG", file: "at/vstg.md" },
  vvg: { jurisdiction: "at", label: "VVG (AT)", file: "at/vvg.md" },
  waffg: { jurisdiction: "at", label: "WaffG", file: "at/waffg.md" },
  wrg: { jurisdiction: "at", label: "WRG", file: "at/wrg.md" },
  zustg: { jurisdiction: "at", label: "ZustG", file: "at/zustg.md" },
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
      CORPUS_META[k].label.toLowerCase() === code.toLowerCase() ||
      CORPUS_META[k].label.toLowerCase().includes(code.toLowerCase())
  );

  // The split-dir filenames follow the corpus FILE basename, not the label abbr
  // (e.g. at/gmbhg-at.md \u2192 gmbhg-at-par-N.md, at/stgb-at.md \u2192 stgb-at-par-N.md).
  // Deriving the slug from the label ("GmbHG", "StGB") missed every "(AT)" code
  // and dropped it into the raw-text fallback. Use the file basename so all
  // codes resolve to their pre-split norm text.
  const fileBase = canonicalKey
    ? CORPUS_META[canonicalKey].file.replace(/^.*\//, "").replace(/\.md$/, "")
    : normalized.replace(/_/g, "-");

  const jur = canonicalKey ? CORPUS_META[canonicalKey].jurisdiction : "de";
  const paraClean = paragraph.replace(/^\u00a7\s*/, "").trim();
  const slug = `${fileBase}-par-${paraClean.toLowerCase()}`;
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

    // AT raw RIS text: cut the header + table-of-contents at the lone `Text`
    // delimiter first. Without this, `search(/\u00a7 N\./)` returns the ToC STUB
    // ("\u00a7 1295. Schadenersatz.") \u2014 a content-free heading \u2014 and grounding would
    // "verify" a citation against a table-of-contents line instead of the norm.
    const textDelim = text.search(/\nText\n/);
    const normText = textDelim !== -1 ? text.slice(textDelim + "\nText\n".length) : text;

    const atIdx = normText.search(new RegExp(`\u00a7\\s*${escapedPara}\\.`));
    if (atIdx !== -1) {
      // Bound at the NEXT paragraph marker of ANY number, scanning forward from
      // this one. Using paraNum+1 broke on repealed \u00a7\u00a7 (the literal next number
      // often does not exist) and could match an EARLIER ToC stub, yielding a
      // negative/empty slice that was still reported as verified.
      const after = normText.slice(atIdx + 1);
      const nextRel = after.search(/\u00a7\s*\d+[a-z]*\s*\./);
      const end = nextRel !== -1 ? atIdx + 1 + nextRel : atIdx + 1200;
      const body = normText.slice(atIdx, end).trim();
      // Guard: a bare marker with no substantive text is not a real answer.
      return body.length > paraNum.length + 3 ? body.slice(0, 800) : null;
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
