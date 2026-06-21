/**
 * split-statute — turn a monolithic statute markdown (one file per law, as
 * produced by scripts/ingest-law-corpus.ts) into one section per paragraph (§).
 *
 * WHY: a whole code (EStG ≈ 1.1 MB) imported as a single page is too large to
 * embed — it lands keyword-only and the subsumption skills retrieve the entire
 * code instead of the relevant §. Splitting per § makes each paragraph an
 * independently embeddable, retrievable unit, which is what
 * steuer-subsumption / legal-subsumption actually need.
 *
 * Pure + deterministic: no I/O, no engine. The importer
 * (scripts/import-statutes-split.ts) does the I/O and calls importFromContent
 * per section. Unit-tested in test/split-statute.test.ts.
 *
 * Statute markdown shape (from the official-source ingester):
 *
 *   ---
 *   title: "EStG — Einkommensteuergesetz"
 *   type: "law"
 *   jurisdiction: "de"
 *   abbreviation: "EStG"
 *   ...
 *   ---
 *
 *   ## Inhaltsübersicht
 *   ...table of contents...
 *
 *   ## § 1 — Steuerpflicht
 *   (1) ...
 *
 *   ## § 1a
 *   ...
 */

export interface StatuteMeta {
  title?: string;
  jurisdiction?: string;
  abbreviation?: string;
  version_date?: string;
  retrieved_at?: string;
  source_url?: string;
  license?: string;
}

export interface StatuteSection {
  /** Section marker, normalized: "§" (DE/AT codes) or "Art." (CH OR/ZGB, GG). */
  marker: "§" | "Art.";
  /** Raw paragraph/article reference as printed, e.g. "1", "1a", "4h", "29 und 30". */
  ref: string;
  /** Slug-safe id for the section, e.g. "p-1", "p-1a", "p-29-30", "art-1". */
  id: string;
  /** Optional heading title, e.g. "Steuerpflicht", "Vertragsfreiheit". */
  title: string;
  /** The section body text (without the heading line). */
  body: string;
}

export interface SplitStatuteResult {
  meta: StatuteMeta;
  sections: StatuteSection[];
}

/** Minimal, dependency-free YAML-frontmatter reader for the flat string maps
 *  the statute ingester emits (key: "value"). Not a general YAML parser. */
function parseFrontmatter(raw: string): { meta: StatuteMeta; bodyStart: number } {
  if (!raw.startsWith("---")) return { meta: {}, bodyStart: 0 };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { meta: {}, bodyStart: 0 };
  const block = raw.slice(3, end);
  const meta: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    meta[m[1]] = v;
  }
  // bodyStart = position just after the closing "---" line.
  const afterClose = raw.indexOf("\n", end + 1);
  return { meta: meta as StatuteMeta, bodyStart: afterClose === -1 ? raw.length : afterClose + 1 };
}

/** A section heading: `## § …` (DE/AT codes) or `## Art. …` / `## Art …`
 *  (CH OR/ZGB/StGB, German Grundgesetz), or `Artikel X` (EU regulations).
 *  Captures the marker and the rest. Handles single (§ 1a / Art. 8),
 *  and ranges/lists (§§ 29 und 30). */
const SECTION_HEADING = /^##\s+(§+|Art\.?)\s+(.+?)\s*$/;
/** EU regulation heading: `Artikel 12` (no ## prefix, full word).
 *  EUR-Lex exports use this format instead of `## Art. 12`. */
const EU_ARTICLE_HEADING = /^Artikel\s+(\d+[a-z]*(?:\s*(?:und|bis|,)\s*\d+[a-z]*)*)\s*$/i;

/** Extract the bare ref + title from a heading's text after the marker.
 *  Works for "1 — Steuerpflicht" (DE em-dash), "1 Vertragsfreiheit" (CH plain),
 *  "2" (GG, no title) and "29 und 30 — (weggefallen)" (ranges). */
function parseHeading(text: string): { ref: string; title: string } {
  // NOTE: no `i` flag — section letter-suffixes (1a, 4h, 4k) are always
  // lowercase; making [a-z] case-insensitive would slurp a capitalized title
  // word into the ref ("1 Vertragsfreiheit").
  const numMatch = text.match(/^(\d+[a-z]*(?:\s*(?:und|bis|,)\s*\d+[a-z]*)*)\s*(.*)$/);
  let ref: string;
  let title: string;
  if (numMatch) {
    ref = numMatch[1].replace(/\s+/g, " ").trim();
    title = numMatch[2].trim();
  } else {
    ref = text.trim();
    title = "";
  }
  // Strip a leading em-dash / hyphen used as "ref — Title".
  title = title.replace(/^[—–-]\s*/, "").trim();
  return { ref, title };
}

/** Turn a ref like "1a" or "29 und 30" into a slug-safe id, prefixed by kind
 *  ("p-" for §, "art-" for Art.): "p-1a", "p-29-30", "art-8". */
function refToId(ref: string, kind: "§" | "Art."): string {
  const slug = ref
    .toLowerCase()
    .replace(/§/g, "")
    .replace(/\b(und|bis|sowie)\b/g, "-")
    .replace(/[,\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const prefix = kind === "Art." ? "art-" : "p-";
  return `${prefix}${slug || "x"}`;
}

/**
 * Split a statute markdown into per-§ sections. Everything before the first
 * `## §` heading (frontmatter + Inhaltsübersicht) is dropped from sections but
 * the frontmatter is returned as `meta`. Sections with an empty body (pure
 * "(weggefallen)" repealed markers still carry their heading line as body)
 * are kept — a repealed § is a legitimate retrieval answer.
 *
 * Fallback: when the markdown carries NO `## §`/`## Art.` headings at all (the
 * Austrian RIS PDF-text dumps are one unstructured blob with the § markers
 * inline in the running text — see law-corpus/at/*.md), we switch to
 * `splitStatuteInline`, which recovers per-§ sections from inline `§ N.`
 * markers. Without this, an AT code lands as one 191-page monolith that is too
 * large to embed and answers every subsumption query with the entire law.
 */
export function splitStatute(markdown: string): SplitStatuteResult {
  const { meta, bodyStart } = parseFrontmatter(markdown);
  const body = markdown.slice(bodyStart);
  const lines = body.split("\n");

  const sections: StatuteSection[] = [];
  let current: StatuteSection | null = null;
  let buf: string[] = [];
  const seenIds = new Map<string, number>();

  const flush = () => {
    if (current) {
      current.body = buf.join("\n").trim();
      sections.push(current);
    }
    buf = [];
  };

  for (const line of lines) {
    const m = line.match(SECTION_HEADING);
    const euM = !m ? line.match(EU_ARTICLE_HEADING) : null;
    if (m || euM) {
      flush();
      const marker: "§" | "Art." = m ? (m[1].startsWith("§") ? "§" : "Art.") : "Art.";
      const { ref, title } = parseHeading(m ? m[2] : euM![1] || "");
      let id = refToId(ref, marker);
      // Disambiguate accidental id collisions deterministically.
      const n = seenIds.get(id) ?? 0;
      seenIds.set(id, n + 1);
      if (n > 0) id = `${id}-${n + 1}`;
      current = { marker, ref, id, title, body: "" };
    } else if (current) {
      buf.push(line);
    }
  }
  flush();

  // No structured headings → try the inline-§ recovery path (AT PDF dumps).
  if (sections.length === 0) {
    const inline = splitStatuteInline(body);
    if (inline.length > 0) return { meta, sections: inline };
  }

  return { meta, sections };
}

/** An inline paragraph marker `§ 17a.` in a flowing-text dump. */
const INLINE_PARAGRAPH = /§\s*(\d+)([a-z]*)\s*\./g;

/** Minimum inline markers before we trust the dump enough to split on them.
 *  Below this it's more likely a prose doc that merely cites a few §§. */
const INLINE_MIN_MARKERS = 10;

/** Largest § gap we treat as a normal next-paragraph step. A forward jump
 *  beyond this is a cross-reference UNLESS the very next marker continues the
 *  jumped-to run (a genuine large gap of repealed §§). */
const INLINE_MAX_STEP = 50;

/**
 * Recover per-§ sections from an unstructured statute dump (no `## §` headings)
 * by treating inline `§ N.` markers as paragraph starts.
 *
 * The hard problem is telling a paragraph-DEFINING marker ("§ 5. Wer …") from a
 * cross-REFERENCE ("… gemäß § 323a …"). We exploit that an Austrian code's
 * defining paragraphs run in increasing order with small steps (ABGB §§ 1‥1503,
 * StGB §§ 1‥321, …), while cross-references jump far backward or far forward and
 * don't form a continuing run. Three rules, applied to the markers in document
 * order:
 *
 *   1. ANCHOR at the natural start. Skip any leading markers until the first
 *      § ≤ 2, so a stray "§ 47a" printed in a header can't poison the baseline.
 *      (Falls back to the first marker if the code genuinely starts higher.)
 *   2. ADVANCE on a small forward step (num within `last+INLINE_MAX_STEP`) or a
 *      suffix bump at the same number (17 → 17a → 18).
 *   3. RECOVER across a genuine large gap: accept a far-forward marker only when
 *      the immediately-following marker continues from it (so §200 → §260 → §261
 *      is a real gap, but a lone §323a between §3 and §3a is a cross-reference).
 *
 * Imperfect by construction, but per-§ retrieval beats an unembeddable monolith
 * decisively, and the `§ N.` marker stays in the body so keyword search finds it
 * either way.
 */
export function splitStatuteInline(body: string): StatuteSection[] {
  const matches: Array<{ index: number; num: number; suffix: string }> = [];
  for (const m of body.matchAll(INLINE_PARAGRAPH)) {
    matches.push({ index: m.index ?? 0, num: parseInt(m[1], 10), suffix: m[2] });
  }
  if (matches.length < INLINE_MIN_MARKERS) return [];

  // Rule 1 — anchor: drop leading markers until the natural statute start (§ ≤ 2).
  let startIdx = matches.findIndex((m) => m.num <= 2);
  if (startIdx === -1) startIdx = 0;

  const boundaries: Array<{ index: number; ref: string }> = [];
  let lastNum = -1;
  let lastSuffix = "";
  for (let i = startIdx; i < matches.length; i++) {
    const mt = matches[i];
    let advances = false;
    if (mt.num === lastNum && mt.suffix > lastSuffix) {
      advances = true; // Rule 2 — suffix bump
    } else if (mt.num > lastNum) {
      if (mt.num <= lastNum + INLINE_MAX_STEP) {
        advances = true; // Rule 2 — small forward step
      } else {
        // Rule 3 — far-forward: accept only if the next marker continues this run.
        const next = matches[i + 1];
        if (next && next.num > mt.num && next.num <= mt.num + INLINE_MAX_STEP) {
          advances = true;
        }
      }
    }
    if (!advances) continue;
    lastNum = mt.num;
    lastSuffix = mt.suffix;
    boundaries.push({ index: mt.index, ref: `${mt.num}${mt.suffix}` });
  }
  if (boundaries.length < INLINE_MIN_MARKERS) return [];

  const sections: StatuteSection[] = [];
  const seenIds = new Map<string, number>();
  const pushSection = (ref: string, text: string) => {
    let id = refToId(ref, "§");
    const n = seenIds.get(id) ?? 0;
    seenIds.set(id, n + 1);
    if (n > 0) id = `${id}-${n + 1}`;
    sections.push({ marker: "§", ref, id, title: "", body: text.trim() });
  };
  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i].index;
    const isLast = i + 1 >= boundaries.length;
    const end = isLast ? body.length : boundaries[i + 1].index;
    const ref = boundaries[i].ref;
    const text = body.slice(start, end);
    // The LAST § marker has no following marker to bound it, so it absorbs all
    // trailing non-statute material (Anlagen, Inkrafttretens-/Übergangs-
    // bestimmungen, Novellen-Historie). Left intact, that one page balloons
    // (ABGB §1503 ≈ 685 KB → too large to embed). Spill the overflow into a
    // separate `<ref>-anhang` section so the § itself stays embeddable and the
    // appendix is still imported (keyword-findable) rather than glued on or lost.
    if (isLast && text.length > INLINE_LAST_SECTION_MAX) {
      const cut = sentenceBoundaryBefore(text, INLINE_LAST_SECTION_MAX);
      pushSection(ref, text.slice(0, cut));
      const rest = text.slice(cut).trim();
      if (rest.length > 0) pushSection(`${ref}-anhang`, rest);
    } else {
      pushSection(ref, text);
    }
  }
  return sections;
}

/** Soft cap for the trailing (last) inline section before its appendix is
 *  spilled into a separate page. A real § virtually never exceeds this. */
const INLINE_LAST_SECTION_MAX = 24000;

/** Find a clean cut point at or before `max`: prefer a paragraph break, then a
 *  sentence end, then a space; fall back to a hard cut. Keeps the § body from
 *  ending mid-word. */
function sentenceBoundaryBefore(text: string, max: number): number {
  if (text.length <= max) return text.length;
  const window = text.slice(0, max);
  const para = window.lastIndexOf("\n\n");
  if (para > max * 0.5) return para;
  const sentence = Math.max(window.lastIndexOf(". "), window.lastIndexOf(".\n"));
  if (sentence > max * 0.5) return sentence + 1;
  const space = window.lastIndexOf(" ");
  return space > max * 0.5 ? space : max;
}
