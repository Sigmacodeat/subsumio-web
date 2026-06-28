/**
 * Citation provenance — map positions in extracted document text back to the
 * source PAGE, for court-proof citations ("Akte X, Seite 12").
 *
 * The PDF extractor (`extract-document.ts` → `extractPdf`) emits per-page text
 * with inline markers:
 *
 *     --- Page 1 ---
 *     <page 1 text>
 *     ###***###
 *     --- Page 2 ---
 *     <page 2 text>
 *     ...
 *
 * The page information therefore already lives in the extracted markdown — it is
 * just not yet propagated to the chunk level as structured metadata. These pure
 * helpers parse the markers so the chunker can stamp each chunk with its
 * `page_number` (and a within-page char offset), which then flows through the
 * existing citation pipeline (the web `citation-gate` already forwards
 * `page_number` / `char_offset_*` untouched).
 *
 * Pure + deterministic + no I/O, so fully unit-testable without a running engine.
 */

export const PAGE_MARKER_RE = /^--- Page (\d+) ---$/;
export const PAGE_SEP = "###***###";

export interface PageSegment {
  /** 1-based source page number. */
  page: number;
  /** Char offset (inclusive) into `markdown` where this page's body starts. */
  start: number;
  /** Char offset (exclusive) where this page's body ends. */
  end: number;
  /** The page body text (markers stripped). */
  text: string;
}

/**
 * Parse `--- Page N ---` markers into char-range segments over the input.
 * Returns [] when the input carries no page markers (non-PDF / pre-marker docs),
 * so callers can treat "no provenance" as a clean absence rather than an error.
 */
export function parsePageSegments(markdown: string): PageSegment[] {
  const lines = markdown.split("\n");
  const segments: PageSegment[] = [];
  let offset = 0; // running char offset at the START of the current line
  let current: { page: number; bodyStart: number } | null = null;

  const close = (bodyEnd: number) => {
    if (!current) return;
    // Trim trailing separator/newlines from the captured body range.
    let end = bodyEnd;
    while (end > current.bodyStart && (markdown[end - 1] === "\n" || markdown[end - 1] === "\r")) {
      end -= 1;
    }
    segments.push({
      page: current.page,
      start: current.bodyStart,
      end,
      text: markdown.slice(current.bodyStart, end),
    });
    current = null;
  };

  for (const line of lines) {
    const lineLen = line.length + 1; // +1 for the "\n" that split() removed
    const m = line.match(PAGE_MARKER_RE);
    if (m) {
      close(offset); // previous page ends where this marker begins
      const page = parseInt(m[1], 10);
      current = { page, bodyStart: offset + lineLen }; // body starts after the marker line
    } else if (line.trim() === PAGE_SEP) {
      close(offset); // separator ends the current page body
    }
    offset += lineLen;
  }
  close(markdown.length);

  return segments;
}

/**
 * Page number for a character offset into the extracted markdown, or null when
 * the offset falls outside any page body (e.g. in the appended annotations
 * section, or when the document has no page markers).
 */
export function pageForOffset(segments: PageSegment[], offset: number): number | null {
  for (const seg of segments) {
    if (offset >= seg.start && offset < seg.end) return seg.page;
  }
  return null;
}

/**
 * Resolve the page a passage of text appears on. Uses the first occurrence of
 * `passage` (trimmed) in the markdown. Returns null when not found or unmarked.
 */
export function pageForPassage(markdown: string, passage: string): number | null {
  const needle = passage.trim();
  if (!needle) return null;
  const idx = markdown.indexOf(needle);
  if (idx === -1) return null;
  return pageForOffset(parsePageSegments(markdown), idx);
}

/**
 * Convenience for the chunker: given the full extracted markdown and a chunk's
 * absolute char range, return the chunk's provenance. `page` is the page where
 * the chunk STARTS; `pageEnd` is where it ends (differs for chunks spanning a
 * page boundary). `charOffsetInPage` is the start offset relative to that page.
 */
export function provenanceForChunk(
  segments: PageSegment[],
  chunkStart: number,
  chunkEnd: number
): { page: number | null; pageEnd: number | null; charOffsetInPage: number | null } {
  const page = pageForOffset(segments, chunkStart);
  const pageEnd = pageForOffset(segments, Math.max(chunkStart, chunkEnd - 1));
  let charOffsetInPage: number | null = null;
  if (page !== null) {
    const seg = segments.find(
      (s) => s.page === page && chunkStart >= s.start && chunkStart < s.end
    );
    if (seg) charOffsetInPage = chunkStart - seg.start;
  }
  return { page, pageEnd, charOffsetInPage };
}
