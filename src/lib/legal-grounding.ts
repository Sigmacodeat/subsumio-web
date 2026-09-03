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

function tokenize(s: string): string[] {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9ÄÖÜß]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function startsWithTokens(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  return needle.every((t, i) => haystack[i] === t);
}

// ── Unverifiable citation detection ───────────────────────────────────
// Citations to treaties (Staatsverträge) and regional laws (Landesrecht)
// are only marked as unverifiable when the statute cannot be identified or
// the requested paragraph/article cannot be found in the corpus. Known
// entries are verified against the actual source text — never guessed.

// Word boundary that works with Unicode (Bun's \b doesn't handle Ü, ä, ö, etc.)
const BOUNDARY = `(?:^|\\s|[.,;:!?()\\[\\]{}'"'/])`;
const END_BOUNDARY = `(?:$|\\s|[.,;:!?()\\[\\]{}'"'/])`;

const TREATY_RE = new RegExp(
  `${BOUNDARY}(Staatsvertrag|Abkommen|(?:\\w*[Kk]onvention)|Übereinkommen|Übereinkunft|Vertrag)${END_BOUNDARY}`,
  "i"
);
const REGIONAL_RE = new RegExp(
  `${BOUNDARY}(Landesrecht|Landesgesetz|LGBl\\.?|LGBI\\.?|Tiroler|Salzburger|Steirischer|Kärntner|Niederösterreich|Oberösterreich|Burgenländischer|Vorarlberger|Wiener)${END_BOUNDARY}`,
  "i"
);

export function detectUnverifiableCitation(code: string, context?: string): string | null {
  const fullText = `${code} ${context || ""}`;
  if (TREATY_RE.test(fullText)) return "Staatsvertrag";
  if (REGIONAL_RE.test(fullText)) return "Landesrecht";
  return null;
}

// ── Exact-match code key lookup (anti-hallucination) ─────────────────
// Replaces the old startsWith() logic that could match ambiguous
// abbreviations to the wrong statute. Now uses exact label match only.

export function findCodeKey(code: string): string | null {
  const normalized = normalizeStatuteCode(code);

  // 1. Exact slug-key match
  if (CORPUS_META[normalized]) return normalized;

  const codeTokens = tokenize(code);
  if (codeTokens.length === 0) return null;

  // 2. Exact token-label match (case-insensitive, punctuation-insensitive)
  const exact = Object.entries(CORPUS_META).filter(([_, m]) => {
    const labelTokens = tokenize(m.label);
    return arraysEqual(labelTokens, codeTokens);
  });
  if (exact.length === 1) return exact[0][0];

  // 3. Unique prefix-token match — fail-closed: only if exactly one entry matches
  const prefixMatches = Object.entries(CORPUS_META).filter(([_, m]) => {
    const labelTokens = tokenize(m.label);
    return startsWithTokens(labelTokens, codeTokens);
  });
  if (prefixMatches.length === 1) return prefixMatches[0][0];

  // Ambiguous or not found → null (fail-closed)
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
  // For at-normen/ entries (directory-per-law), the file basename is an article
  // file (e.g. art-10-nor12160106.md), but split files are named after the
  // directory (e.g. abgb-par-N.md). Use the canonicalKey (slugKey) as the base
  // for at-normen entries.
  let fileBase: string;
  if (canonicalKey) {
    const meta = CORPUS_META[canonicalKey];
    if (meta.file.startsWith("at-normen/")) {
      // Directory-per-law: use the canonicalKey (directory name) as the split base
      fileBase = canonicalKey.replace(/_at$/, "-at").replace(/_/g, "-");
    } else {
      fileBase = meta.file.replace(/^.*\//, "").replace(/\.md$/, "");
    }
  } else {
    fileBase = normalizeStatuteCode(code).replace(/_/g, "-");
  }

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
    const paraNum = paragraph
      .replace(/^(\u00a7|Art\.?|Artikel|Article|Abs\.?|Absatz)\s*/i, "")
      .trim();
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
      if (body.length > paraNum.length + 3) return body.slice(0, 800);
    }

    // Fallback for state treaties and some regional laws that use articles.
    // We strip the frontmatter so header metadata doesn't match as a false positive.
    const bodyStart = text.indexOf("---", 3);
    const bodyText = bodyStart !== -1 ? text.slice(bodyStart + 3).trimStart() : text;
    const articleIdx = bodyText.search(
      new RegExp(`(?:Art\\.?|Artikel|Article)\\s*${escapedPara}\\b`, "i")
    );
    if (articleIdx !== -1) {
      const after = bodyText.slice(articleIdx + 1);
      const nextRel = after.search(/(?:Art\.?|Artikel|Article)\s*\d+[a-z]*\b/i);
      const end = nextRel !== -1 ? articleIdx + 1 + nextRel : articleIdx + 1200;
      const body = bodyText.slice(articleIdx, end).trim();
      // Guard: require a sentence of real text after the article marker.
      return body.length > paraNum.length + 20 ? body.slice(0, 800) : null;
    }

    return null;
  } catch {
    return null;
  }
}

// ── Literature / Materialien grounding ───────────────────────────────

import type { RawLiteratureCitation } from "@/lib/citation-gate-client";

/**
 * Verify literature/materialien citations against the corpus on disk.
 *
 * - materialien   → law-corpus/de-materialien/<file>.md (BT/BR-Drucksachen)
 * - kommentar_oa  → law-corpus/ch-literatur/<file>.md  (Onlinekommentar, CC BY)
 * - licensed_work → NEVER verifies: we hold no license for publisher text.
 *   The citation is flagged instead of silently dropped.
 */
export async function groundLiteratureCitations(
  refs: RawLiteratureCitation[]
): Promise<GroundedCitation[]> {
  const results: GroundedCitation[] = [];

  for (const ref of refs.slice(0, 20)) {
    if (ref.kind === "licensed_work") {
      results.push({
        code: ref.work,
        paragraph: ref.ref,
        context: ref.raw,
        verified: false,
        category: "verlags_literatur",
        jurisdiction: ref.jurisdiction,
        unverifiable_reason:
          `Verlags-Content (${ref.work}) — nicht im freien Korpus, ` +
          "keine Verifikation möglich. Zitat anwaltlich prüfen.",
      });
      continue;
    }

    const category = ref.kind === "materialien" ? "materialien" : "literatur";
    const file = path.join(CORPUS_DIR, ref.corpusDir!, `${ref.corpusFile}.md`);
    let body: string | null = null;
    try {
      const content = await fs.readFile(file, "utf8");
      const end = content.startsWith("---") ? content.indexOf("---", 3) : -1;
      body = (end !== -1 ? content.slice(end + 3) : content).trim();
    } catch {
      body = null;
    }

    results.push({
      code: ref.work,
      paragraph: ref.ref,
      context: ref.raw,
      verified: body !== null,
      category,
      jurisdiction: ref.jurisdiction,
      ...(body
        ? { source_text: body.slice(0, 600), source_file: `${ref.corpusDir}/${ref.corpusFile}.md` }
        : {
            unverifiable_reason:
              ref.kind === "materialien"
                ? "Drucksache nicht im Korpus (Materialien-Import ausstehend oder Nummer falsch)"
                : "Kommentierung nicht im Korpus gefunden",
          }),
    });
  }

  return results;
}

export async function groundCitations(rawCitations: RawCitation[]): Promise<GroundedCitation[]> {
  const results: GroundedCitation[] = [];

  for (const cite of rawCitations.slice(0, 20)) {
    if (!cite.code || !cite.paragraph) continue;

    const code = String(cite.code).trim();
    const paragraph = String(cite.paragraph).trim();
    const context = String(cite.context || "").trim();

    const codeKey = findCodeKey(code);
    const meta = codeKey ? CORPUS_META[codeKey] : null;

    if (!meta) {
      results.push({
        code,
        paragraph,
        context,
        verified: false,
        unverifiable_reason: detectUnverifiableCitation(code, context) || "Unknown statute",
      });
      continue;
    }

    let sourceText = await lookupSplitParagraph(code, paragraph);

    if (!sourceText && codeKey) {
      sourceText = await lookupCorpusParagraph(codeKey, paragraph);
    }

    const result: GroundedCitation = {
      code,
      paragraph,
      context,
      verified: sourceText !== null,
      ...(sourceText ? { source_text: sourceText.slice(0, 600) } : {}),
      category: meta.type ?? "statute",
      jurisdiction: meta.jurisdiction,
    };

    if (!sourceText) {
      result.unverifiable_reason =
        detectUnverifiableCitation(code, context) || "Paragraph not found";
    }

    results.push(result);
  }

  return results;
}
