/**
 * Sammelscan detection — one scanned PDF that holds several Schriftstücke
 * (e.g. "Urteil + Ladung + Kostennote" from the morning mail).
 *
 * Deterministic and conservative: boundaries are only set at PAGE starts
 * (the extractor's "###***###" separators), and only when the new page's head
 * announces a document kind (HEADER rules of the classifier: "IM NAMEN DER
 * REPUBLIK", "BESCHLUSS", "LADUNG", "Zahlungsbefehl", "Kostennote",
 * Rückschein …) or carries a different Geschäftszahl than the running
 * Schriftstück. A text without page markers is never split — a false split
 * would be worse than none.
 *
 * The result is a hint on the document ("enthält vermutlich N Schriftstücke")
 * so the lawyer separates them; the file itself stays one original.
 */
import { classifyByHeader, classifyLegalDocument, legalDocTypeLabel } from "./doc-classifier.ts";
import type { LegalDocType } from "./doc-classifier.ts";
import { findeGZImText, gzSchluessel } from "./gz-validate.ts";

export const PAGE_SEPARATOR = "###***###";
const PAGE_HEAD_CHARS = 600;

export interface Schriftstueck {
  /** 1-based first page. */
  seite_von: number;
  seite_bis: number;
  typ: LegalDocType;
  label: string;
  geschaeftszahl?: string;
}

export function erkenneSchriftstuecke(text: string): Schriftstueck[] {
  if (!text.includes(PAGE_SEPARATOR)) return [];
  // PDF pages are written as "--- Page N ---\n<text>"; empty pages are left
  // out by the extractor, so the marker (not the position) is the page number.
  const raw = text.split(PAGE_SEPARATOR).map((p) => p.trim());
  if (raw.length < 2) return [];
  const pageNo: number[] = [];
  const pages = raw.map((p, i) => {
    const m = /^---\s*Page\s+(\d+)\s*---\s*\n?/i.exec(p);
    pageNo.push(m ? Number(m[1]) : i + 1);
    return m ? p.slice(m[0].length) : p;
  });

  const segments: Array<{ from: number; to: number; gz?: string; gzFormatted?: string }> = [];
  pages.forEach((page, i) => {
    if (!page) {
      if (segments.length > 0) segments[segments.length - 1]!.to = i;
      return;
    }
    const head = page.slice(0, PAGE_HEAD_CHARS);
    const gz = findeGZImText(head)[0];
    const gzKey = gz ? gzSchluessel(gz) : undefined;
    const current = segments[segments.length - 1];
    const startsNew =
      !current ||
      classifyByHeader(head) !== null ||
      (gzKey !== undefined && current.gz !== undefined && gzKey !== current.gz);
    if (startsNew) {
      segments.push({ from: i, to: i, gz: gzKey, gzFormatted: gz?.formatted });
    } else {
      current.to = i;
      if (!current.gz && gzKey) {
        current.gz = gzKey;
        current.gzFormatted = gz?.formatted;
      }
    }
  });
  if (segments.length < 2) return [];

  return segments.map((seg) => {
    const segText = pages.slice(seg.from, seg.to + 1).join("\n\n");
    const typ = classifyLegalDocument(segText).type;
    return {
      seite_von: pageNo[seg.from]!,
      seite_bis: pageNo[seg.to]!,
      typ,
      label: legalDocTypeLabel(typ),
      ...(seg.gzFormatted ? { geschaeftszahl: seg.gzFormatted } : {}),
    };
  });
}

/** "S. 1–2 Urteil (3 Cg 77/25x); S. 3 Ladung; …" — for the document's frontmatter. */
export function describeSchriftstuecke(parts: Schriftstueck[]): string {
  return parts
    .map((p) => {
      const pages =
        p.seite_von === p.seite_bis ? `S. ${p.seite_von}` : `S. ${p.seite_von}–${p.seite_bis}`;
      return `${pages} ${p.label}${p.geschaeftszahl ? ` (${p.geschaeftszahl})` : ""}`;
    })
    .join("; ");
}
