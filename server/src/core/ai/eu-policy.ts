/**
 * EU-only enforcement (SUBSUMIO_EU_ONLY=1).
 *
 * Austrian bar guidance (ÖRAK KI-Checkliste 2025, § 40 Abs 3 RL-BA) requires
 * client data to be processed on EU/EEA servers. With the switch on, every
 * gateway touchpoint asks the provider classification in model-registry.ts
 * (PROVIDER_RESIDENCY — the single residency table) before a request leaves
 * the process, and refuses a non-EU target with EuResidencyError. There is no
 * silent reroute: the caller sees the refusal (chat/stream/completion), or
 * the feature degrades to its non-LLM path (query expansion → original query,
 * reranker → RRF order).
 *
 * Embeddings are a separate decision: the stored vectors belong to one model,
 * so switching provider means re-embedding the corpus. With SUBSUMIO_EU_ONLY
 * alone, embeddings keep using the configured provider (logged once). Adding
 * SUBSUMIO_EU_ONLY_EMBEDDINGS=1 refuses a non-EU provider for document-side
 * embeddings (new ingestion); query embeddings stay allowed so search keeps
 * working against the existing index.
 */

import { AIConfigError } from "./errors.ts";
import { resolveProviderResidency, type ResidencyVerdict } from "../model-registry.ts";

export type EuTouchpoint =
  | "chat"
  | "stream"
  | "completion"
  | "expansion"
  | "embedding"
  | "rerank"
  | "transcription";

type Env = Record<string, string | undefined>;

function truthy(v: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test((v ?? "").trim());
}

export function isEuOnly(env: Env): boolean {
  return truthy(env.SUBSUMIO_EU_ONLY);
}

/** Document-side embedding refusal: needs BOTH switches. */
export function isEuOnlyEmbeddings(env: Env): boolean {
  return isEuOnly(env) && truthy(env.SUBSUMIO_EU_ONLY_EMBEDDINGS);
}

export class EuResidencyError extends AIConfigError {
  readonly touchpoint: EuTouchpoint;
  readonly target: string;
  readonly verdict: ResidencyVerdict;
  constructor(touchpoint: EuTouchpoint, target: string, verdict: ResidencyVerdict) {
    super(
      `EU-only mode (SUBSUMIO_EU_ONLY=1) refused ${touchpoint} via "${target}": ` +
        `processing is not in the EU/EEA (${verdict.basis}). No request was sent.`,
      "Point this purpose at an EU route (bedrock:eu.anthropic.* in eu-central-1, mistral:*), " +
        "or attest an EU endpoint via the provider's SUBSUMIO_*_RESIDENCY=eu variable. " +
        "See docs/architecture/LLM_GATEWAY.md."
    );
    this.name = "EuResidencyError";
    this.touchpoint = touchpoint;
    this.target = target;
    this.verdict = verdict;
  }
}

/** Split `provider:model` (colon first; slash as fallback) without throwing. */
function splitTarget(target: string): { provider: string; model: string } {
  const t = target.trim();
  const colon = t.indexOf(":");
  const sep = colon !== -1 ? colon : t.indexOf("/");
  if (sep <= 0) return { provider: t.toLowerCase(), model: "" };
  return { provider: t.slice(0, sep).trim().toLowerCase(), model: t.slice(sep + 1).trim() };
}

/** Residency of a `provider:model` target under the given env. */
export function residencyOf(target: string, env: Env): ResidencyVerdict {
  const { provider, model } = splitTarget(target);
  return resolveProviderResidency(provider, model, env);
}

/** True when the target may be called under the current policy. */
export function isAllowedUnderEuPolicy(target: string, env: Env): boolean {
  if (!isEuOnly(env)) return true;
  return residencyOf(target, env).residency === "eu";
}

/**
 * Throw EuResidencyError when EU-only is on and the target is not EU.
 * No-op when the switch is off.
 */
export function assertEuResidency(target: string, touchpoint: EuTouchpoint, env: Env): void {
  if (!isEuOnly(env)) return;
  const verdict = residencyOf(target, env);
  if (verdict.residency !== "eu") throw new EuResidencyError(touchpoint, target, verdict);
}

const _embeddingExceptionLogged = new Set<string>();

/**
 * Embedding gate. `inputType === "query"` is always allowed (the query must
 * land in the existing vector space). Document-side embeddings of a non-EU
 * provider are refused only with SUBSUMIO_EU_ONLY_EMBEDDINGS=1; with
 * SUBSUMIO_EU_ONLY alone they pass and the exception is logged once per model.
 */
export function assertEuEmbedding(
  target: string,
  inputType: "query" | "document" | undefined,
  env: Env
): void {
  if (!isEuOnly(env)) return;
  const verdict = residencyOf(target, env);
  if (verdict.residency === "eu") return;
  if (inputType !== "query" && isEuOnlyEmbeddings(env)) {
    throw new EuResidencyError("embedding", target, verdict);
  }
  if (!_embeddingExceptionLogged.has(target)) {
    _embeddingExceptionLogged.add(target);
    console.warn(
      `[eu-policy] embeddings via non-EU "${target}" allowed: SUBSUMIO_EU_ONLY_EMBEDDINGS is off ` +
        `(existing vector index; re-embedding with an EU model is a separate migration).`
    );
  }
}

/**
 * Refusal payload for HTTP handlers that call a provider outside the gateway
 * (the engine's /api/llm/transcribe). Returns null when the call is allowed.
 */
export function euRefusal(
  target: string,
  touchpoint: EuTouchpoint,
  env: Env
): { error: "eu_only_refused"; message: string } | null {
  try {
    assertEuResidency(target, touchpoint, env);
    return null;
  } catch (e) {
    if (e instanceof EuResidencyError) return { error: "eu_only_refused", message: e.message };
    throw e;
  }
}

/** Test-only: reset the once-per-model embedding log. */
export function __resetEuPolicyLogForTests(): void {
  _embeddingExceptionLogged.clear();
}
