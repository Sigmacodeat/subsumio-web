/**
 * Signatur-Erfassung (Canvas / Typed-Name / DocuSign)
 * ====================================================
 *
 * Captured signatures are persisted as Brain pages (type="captured_signature")
 * so they are auditable and revision-safe. Each capture records the legal level
 * (simple / advanced / qualified) so the UI can communicate the legal effect to
 * the signer — a DACH requirement (eIDAS / SVG AT §4 / ERVV DE).
 *
 * Cross-cutting invariants respected:
 *  - Trust fail-closed: callers pass ctx.remote through from createHandler.
 *  - JSONB: raw objects to engine.executeRaw, never JSON.stringify into ::jsonb.
 */

export type SignatureFormat = "canvas_png" | "canvas_svg" | "typed_name" | "docusign";

export type SignatureLegalLevel = "simple" | "advanced" | "qualified";

export interface CapturedSignature {
  id: string;
  document_slug: string;
  document_type: "signature_request" | "power_of_attorney" | "legal_document";
  signer_name: string;
  signer_email?: string;
  signature_format: SignatureFormat;
  /** PNG data URL (canvas), typed name (type mode), or envelope ID (docusign). */
  signature_data: string;
  /** SVG path strings (draw mode only). Empty for typed_name / docusign. */
  signature_paths: string[];
  legal_level: SignatureLegalLevel;
  captured_at: string;
  ip_address?: string;
  user_agent?: string;
  brain_id?: string;
}

export interface CaptureInput {
  document_slug: string;
  document_type: CapturedSignature["document_type"];
  signer_name: string;
  signer_email?: string;
  signature_format: SignatureFormat;
  signature_data: string;
  signature_paths?: string[];
  legal_level?: SignatureLegalLevel;
  ip_address?: string;
  user_agent?: string;
  brain_id?: string;
}

/**
 * Derives the legal level from the signature format.
 * Canvas/typed = simple (eIDAS Art. 3 Z 10).
 * DocuSign standard = advanced (eIDAS Art. 26) — depends on provider config.
 * DocuSign with qES provider = qualified (eIDAS Art. 3 Z 12) — caller must set explicitly.
 */
export function deriveLegalLevel(format: SignatureFormat): SignatureLegalLevel {
  if (format === "docusign") return "advanced";
  return "simple";
}

export function createCapturedSignature(input: CaptureInput): CapturedSignature {
  const now = new Date().toISOString();
  const id = `sig-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    document_slug: input.document_slug,
    document_type: input.document_type,
    signer_name: input.signer_name,
    signer_email: input.signer_email,
    signature_format: input.signature_format,
    signature_data: input.signature_data,
    signature_paths: input.signature_paths ?? [],
    legal_level: input.legal_level ?? deriveLegalLevel(input.signature_format),
    captured_at: now,
    ip_address: input.ip_address,
    user_agent: input.user_agent,
    brain_id: input.brain_id,
  };
}

/**
 * Validates a capture input. Returns null if valid, or an error key.
 */
export function validateCaptureInput(input: CaptureInput): string | null {
  if (!input.document_slug?.trim()) return "missing_document_slug";
  if (!input.signer_name?.trim()) return "missing_signer_name";
  if (!input.signature_data?.trim()) return "missing_signature_data";
  if (input.signature_format === "typed_name" && input.signature_data.trim().length < 2) {
    return "typed_name_too_short";
  }
  if (input.signature_format === "canvas_png" && !input.signature_data.startsWith("data:image/png")) {
    return "invalid_png_data";
  }
  return null;
}

export const LEGAL_LEVEL_LABELS: Record<
  SignatureLegalLevel,
  { de: string; en: string; warning_de: string; warning_en: string }
> = {
  simple: {
    de: "Einfache elektronische Signatur",
    en: "Simple electronic signature",
    warning_de: "Nicht qES — für Gerichtsfiling unzureichend",
    warning_en: "Not qES — insufficient for court filing",
  },
  advanced: {
    de: "Fortgeschrittene elektronische Signatur",
    en: "Advanced electronic signature",
    warning_de: "Fortgeschritten — prüfen Sie die Anerkennung beim Empfänger",
    warning_en: "Advanced — verify recognition with recipient",
  },
  qualified: {
    de: "Qualifizierte elektronische Signatur",
    en: "Qualified electronic signature",
    warning_de: "qES — der handschriftlichen Unterschrift gleichgestellt",
    warning_en: "qES — equivalent to a handwritten signature",
  },
};
