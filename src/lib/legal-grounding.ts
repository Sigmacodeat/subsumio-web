import path from "node:path";
import { promises as fs } from "node:fs";
import type { RawCitation, GroundedCitation } from "@/lib/types";

// ── Corpus knowledge base ─────────────────────────────────────────────
// CORPUS_META is defined in corpus-meta.ts (client-safe, no node:fs/node:path).
// Re-exported here for backward compatibility — server code can still import from here.
export { CORPUS_META } from "@/lib/corpus-meta";
import { CORPUS_META } from "@/lib/corpus-meta";

export const CORPUS_DIR = path.join(process.cwd(), "law-corpus");
export const CORPUS_SPLIT_DIR = path.join(process.cwd(), "law-corpus-split");

// ── Helpers ───────────────────────────────────────────────────────────

export function normalizeStatuteCode(code: string): string {
  return code
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_");
}

// ── Unverifiable citation detection ───────────────────────────────────
// Citations to treaties (Staatsverträge) and regional laws (Landesrecht)
// are explicitly marked as unverifiable — never silently verified.

const TREATY_KEYWORDS =
  /\b(Staatsvertrag|Abkommen|Konvention|Übereinkommen|Übereinkunft|Vertrag)\b/i;
const REGIONAL_KEYWORDS =
  /\b(Landesrecht|Landesgesetz|LGBl\.?|LGBI\.?|Tiroler|Salzburger|Steirischer|Kärntner|Niederösterreich|Oberösterreich|Burgenländischer|Vorarlberger|Wiener)\b/i;

export function detectUnverifiableCitation(code: string, context?: string): string | null {
  const fullText = `${code} ${context || ""}`;
  if (TREATY_KEYWORDS.test(fullText)) return "Staatsvertrag";
  if (REGIONAL_KEYWORDS.test(fullText)) return "Landesrecht";
  return null;
}

// ── Exact-match code key lookup (anti-hallucination) ─────────────────
// Replaces the old startsWith() logic that could match ambiguous
// abbreviations to the wrong statute. Now uses exact label match only.

export function findCodeKey(code: string): string | null {
  const normalized = normalizeStatuteCode(code);

  // 1. Exact slug-key match
  if (CORPUS_META[normalized]) return normalized;

  // 2. Exact label match (case-insensitive)
  const codeUpper = code.toUpperCase().trim();
  const exact = Object.entries(CORPUS_META).filter(
    ([_, m]) => m.label.toUpperCase() === codeUpper
  );
  if (exact.length === 1) return exact[0][0];

  // 3. Normalized label match (spaces/dashes/underscores equivalent)
  const normCode = codeUpper.replace(/[\s\-_]+/g, " ");
  const normMatches = Object.entries(CORPUS_META).filter(([_, m]) => {
    const normLabel = m.label.toUpperCase().replace(/[\s\-_]+/g, " ");
    return normLabel === normCode;
  });
  if (normMatches.length === 1) return normMatches[0][0];

  // 4. Ambiguous or not found → null (fail-closed)
  return null;
}

export async function lookupSplitParagraph(
  code: string,
  paragraph: string
): Promise<string | null> {
  const canonicalKey = findCodeKey(code);

  // The split-dir filenames follow the corpus FILE basename, not the label abbr
  // (e.g. at/gmbhg-at.md \u2192 gmbhg-at-par-N.md, at/stgb-at.md \u2192 stgb-at-par-N.md).
  // Deriving the slug from the label ("GmbHG", "StGB") missed every "(AT)" code
  // and dropped it into the raw-text fallback. Use the file basename so all
  // codes resolve to their pre-split norm text.
  const fileBase = canonicalKey
    ? CORPUS_META[canonicalKey].file.replace(/^.*\//, "").replace(/\.md$/, "")
    : normalizeStatuteCode(code).replace(/_/g, "-");

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

    // The optional dot after `\u00a7` absorbs the RIS `\u00a7.` stray-dot artifact
    // (ZPO-AT `\u00a7. 226.`), so those paragraphs are found here too.
    const atIdx = normText.search(new RegExp(`\u00a7\\.?\\s*${escapedPara}\\.`));
    if (atIdx !== -1) {
      // Bound at the NEXT paragraph marker of ANY number, scanning forward from
      // this one. Using paraNum+1 broke on repealed \u00a7\u00a7 (the literal next number
      // often does not exist) and could match an EARLIER ToC stub, yielding a
      // negative/empty slice that was still reported as verified.
      const after = normText.slice(atIdx + 1);
      const nextRel = after.search(/\u00a7\.?\s*\d+[a-z]*\s*\./);
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

    // Check for explicitly unverifiable citations (treaties, regional laws)
    const unverifiableReason = detectUnverifiableCitation(code, context);
    if (unverifiableReason) {
      results.push({
        code,
        paragraph,
        context,
        verified: false,
        unverifiable_reason: unverifiableReason,
      });
      continue;
    }

    let sourceText = await lookupSplitParagraph(code, paragraph);

    if (!sourceText) {
      const codeKey = findCodeKey(code);
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
