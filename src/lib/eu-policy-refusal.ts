/**
 * "Nur EU" (org `modelPolicy: "eu_only"`) is enforced in the engine for every
 * request of the firm (header `x-subsumio-model-policy`, see
 * server/src/core/ai/request-eu-policy.ts): a model outside the EU/EEA is
 * refused before anything is sent. This module turns that refusal into the
 * message the firm sees — never a silent fallback to a non-EU model.
 */

export const MODEL_POLICY_HEADER = "x-subsumio-model-policy";

export const EU_ONLY_REFUSAL_CODE = "eu_only_refused";

export const EU_ONLY_REFUSAL_MESSAGE =
  "Ihre Kanzlei hat „Nur EU-Verarbeitung“ aktiviert. Für diese Anfrage steht derzeit kein " +
  "KI-Modell mit Verarbeitung in der EU zur Verfügung — es wurden keine Daten übermittelt. " +
  "Bitte wenden Sie sich an den Betreiber oder wählen Sie ein EU-Modell.";

export const EU_ONLY_MODEL_NOT_ALLOWED_MESSAGE =
  "Das gewählte Modell verarbeitet außerhalb der EU und ist bei „Nur EU-Verarbeitung“ Ihrer " +
  "Kanzlei nicht zulässig. Bitte wählen Sie ein EU-Modell oder „Automatisch“.";

/** Engine headers value for the firm's policy (undefined: no firm, no header). */
export function modelPolicyHeaderValue(
  policy: "any" | "eu_only" | undefined | null
): "eu_only" | "any" {
  return policy === "eu_only" ? "eu_only" : "any";
}

/** True when an engine error payload is the EU-only refusal. */
export function isEuOnlyRefusal(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  if (p.error === EU_ONLY_REFUSAL_CODE || p.code === EU_ONLY_REFUSAL_CODE) return true;
  const text = [p.error, p.message].filter((v) => typeof v === "string").join(" ");
  return /EU-only mode \(SUBSUMIO_EU_ONLY=1\) refused/.test(text);
}

/** The response the web returns for an EU-only refusal. */
export function euOnlyRefusalResponse(message = EU_ONLY_REFUSAL_MESSAGE): Response {
  return Response.json({ error: message, code: EU_ONLY_REFUSAL_CODE }, { status: 403 });
}

/** A model pick the firm's EU-only policy does not allow. */
export class ModelPolicyError extends Error {
  readonly code = EU_ONLY_REFUSAL_CODE;
  constructor(message = EU_ONLY_MODEL_NOT_ALLOWED_MESSAGE) {
    super(message);
    this.name = "ModelPolicyError";
  }
}
