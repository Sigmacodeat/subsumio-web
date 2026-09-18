/**
 * Opens the norm reader panel (mounted once in the dashboard layout) from
 * anywhere — a citation in a chat answer, the citation panel, a research tab.
 */

export const NORM_READER_EVENT = "subsumio:norm:open";

export interface NormReaderRequest {
  code: string;
  paragraph: string;
  jurisdiction?: "at" | "de" | "ch";
}

export function openNormReader(req: NormReaderRequest): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<NormReaderRequest>(NORM_READER_EVENT, { detail: req }));
}

/** GroundedCitation.jurisdiction also knows "eu"; the reader resolves those without a hint. */
export function readerJurisdiction(
  j: string | undefined | null
): NormReaderRequest["jurisdiction"] {
  return j === "at" || j === "de" || j === "ch" ? j : undefined;
}

/** A plain left click opens the reader; modifier/middle clicks keep the link's own target. */
export function isPlainClick(e: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

/** onClick for React citation links: plain click → reader, otherwise the link's own href. */
export function normReaderClick(
  code: string,
  paragraph: string,
  jurisdiction?: string | null
): (e: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  preventDefault(): void;
}) => void {
  return (e) => {
    if (!isPlainClick(e)) return;
    e.preventDefault();
    openNormReader({ code, paragraph, jurisdiction: readerJurisdiction(jurisdiction) });
  };
}
