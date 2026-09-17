// Qualified electronic signatures (QES) through PDF-AS-WEB.
//
// Interface: "Anbindung externer Webanwendung an PDF-AS-WEB 5.0" (EGIZ/A-SIT,
// v1.2, 30.04.2026), user-agent flow:
//   1. redirect the signer to {PDFAS}/Sign with connector, pdf-url,
//      invoke-app-url, invoke-app-error-url, locale, filename, verify-level;
//   2. PDF-AS-WEB fetches the PDF from pdf-url, has the person sign;
//   3. on success it redirects to invoke-app-url?pdfurl=…&pdflength=…,
//      on error to invoke-app-error-url?error=…&cause=…;
//   4. the app fetches the signed PDF once from pdfurl (PDFData), passing
//      origdigest (hex SHA-256 of the original); response headers carry
//      ValueCheckCode, CertificateCheckCode and Signer-Certificate.
//
// Methods offered in Subsumio:
//   - "id_austria":   connector "mobilebku" — the mobile signature service
//                     (Handy-Signatur, today ID Austria, operated by A-Trust).
//   - "a_trust_card": connector "bku" — a local citizen card environment with
//                     an A-Trust signature card (a.sign premium).
// Both create qualified signatures when the signer's certificate is qualified.

import { X509Certificate, createHash } from "node:crypto";

export type QesMethod = "id_austria" | "a_trust_card";

export const QES_METHOD_LABEL: Record<QesMethod, string> = {
  id_austria: "ID Austria",
  a_trust_card: "A-Trust-Signaturkarte",
};

const CONNECTOR: Record<QesMethod, "mobilebku" | "bku"> = {
  id_austria: "mobilebku",
  a_trust_card: "bku",
};

export function pdfAsBaseUrl(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const u = new URL(raw.trim());
    if (
      u.protocol !== "https:" &&
      !(u.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(u.hostname))
    ) {
      return null;
    }
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function buildSignUrl(input: {
  base: string;
  method: QesMethod;
  pdfUrl: string;
  doneUrl: string;
  errorUrl: string;
  filename: string;
}): string {
  const params = new URLSearchParams({
    connector: CONNECTOR[input.method],
    "pdf-url": input.pdfUrl,
    "invoke-app-url": input.doneUrl,
    "invoke-app-error-url": input.errorUrl,
    "invoke-app-url-target": "_top",
    locale: "DE",
    filename: input.filename,
    "verify-level": "intOnly",
  });
  return `${input.base}/Sign?${params.toString()}`;
}

/** The signed PDF may only be fetched from the configured PDF-AS host (no SSRF). */
export function isTrustedPdfUrl(pdfUrl: string | null, base: string): boolean {
  if (!pdfUrl) return false;
  try {
    const u = new URL(pdfUrl, base);
    const b = new URL(base);
    return u.protocol === b.protocol && u.host === b.host;
  } catch {
    return false;
  }
}

/** File name of the signed copy: "<title> (qualifiziert signiert).pdf". */
export function signedFilename(title: string | undefined | null): string {
  const stem =
    String(title ?? "")
      .replace(/\.pdf$/i, "")
      .replace(/[^\p{L}\p{N} ._-]/gu, "")
      .trim()
      .slice(0, 80) || "Dokument";
  return `${stem} (qualifiziert signiert).pdf`;
}

export function sha256Hex(data: Buffer | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function withOrigDigest(pdfUrl: string, base: string, digest: string): string {
  const u = new URL(pdfUrl, base);
  u.searchParams.set("origdigest", digest);
  return u.toString();
}

export interface QesCheck {
  /** ValueCheckCode 0: the signature value verifies. */
  valueOk: boolean;
  /** CertificateCheckCode 0: chain to a trusted root, valid at signing time. */
  certificateOk: boolean;
  valueCheckCode: string | null;
  certificateCheckCode: string | null;
  signerCertificate: string | null;
}

export function readQesCheck(headers: Headers): QesCheck {
  const value = headers.get("ValueCheckCode");
  const cert = headers.get("CertificateCheckCode");
  return {
    valueOk: value === "0",
    certificateOk: cert === "0",
    valueCheckCode: value,
    certificateCheckCode: cert,
    signerCertificate: headers.get("Signer-Certificate"),
  };
}

/** Subject (CN) of a base64 DER certificate, for display. Best effort. */
export function certificateSubjectName(b64: string | null): string | null {
  if (!b64) return null;
  try {
    const cert = new X509Certificate(Buffer.from(b64.replace(/\s+/g, ""), "base64"));
    const cn = cert.subject.split("\n").find((l) => l.startsWith("CN="));
    return cn ? cn.slice(3) : cert.subject;
  } catch {
    return null;
  }
}
