/**
 * Documents handed to DocuSign must be real PDF or DOCX files — never an
 * error page or JSON body that a failed download produced.
 */

/** DocuSign's per-document upload limit. */
export const MAX_SIGNABLE_DOCUMENT_BYTES = 25 * 1024 * 1024;

export type SignableType = "pdf" | "docx";

/** Detects PDF (%PDF-) and DOCX (ZIP container) by their magic bytes. */
export function detectSignableType(bytes: Uint8Array): SignableType | null {
  if (bytes.length >= 5 && String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-") return "pdf";
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    return "docx";
  }
  return null;
}

/**
 * Checks one base64 document. Returns its type, or a German reason why it
 * cannot be sent.
 */
export function checkSignableDocument(
  base64: string
): { ok: true; type: SignableType } | { ok: false; reason: string } {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    return { ok: false, reason: "ist nicht gültig kodiert" };
  }
  const bytes = Buffer.from(base64, "base64");
  if (bytes.byteLength === 0) return { ok: false, reason: "ist leer" };
  if (bytes.byteLength > MAX_SIGNABLE_DOCUMENT_BYTES) {
    return { ok: false, reason: "ist größer als 25 MB" };
  }
  const type = detectSignableType(bytes);
  if (!type) return { ok: false, reason: "ist kein PDF- oder Word-Dokument" };
  return { ok: true, type };
}
