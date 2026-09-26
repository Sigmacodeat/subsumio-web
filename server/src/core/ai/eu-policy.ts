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
 * Embeddings are covered by the same switch: document text AND query text are
 * client data, so SUBSUMIO_EU_ONLY=1 refuses a non-EU embedding provider on
 * both sides (fail-closed; the error names the EU embedding options). The
 * stored vectors belong to one model, so switching provider means re-embedding
 * the corpus — an operator who has not migrated yet must opt out EXPLICITLY
 * with SUBSUMIO_EU_ONLY_EMBEDDINGS=0 (logged once per model). Any other value,
 * including unset, keeps embeddings inside the EU-only policy.
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

function falsy(v: string | undefined): boolean {
  return /^(0|false|no|off)$/i.test((v ?? "").trim());
}

/**
 * Explicit opt-out of the embedding gate: only SUBSUMIO_EU_ONLY_EMBEDDINGS=0
 * (or false/no/off) lets a non-EU embedding provider through under EU-only.
 */
export function isEuOnlyEmbeddingsOptOut(env: Env): boolean {
  return falsy(env.SUBSUMIO_EU_ONLY_EMBEDDINGS);
}

/**
 * Embedding refusal is part of EU-only: on unless the operator opted out
 * explicitly with SUBSUMIO_EU_ONLY_EMBEDDINGS=0.
 */
export function isEuOnlyEmbeddings(env: Env): boolean {
  return isEuOnly(env) && !isEuOnlyEmbeddingsOptOut(env);
}

const EMBEDDING_HINT =
  "Set SUBSUMIO_EMBEDDING_MODEL to an EU embedding provider (mistral:mistral-embed, " +
  "a self-hosted model attested with SUBSUMIO_SELF_HOSTED_RESIDENCY=eu, or a Bedrock " +
  "embedding in eu-central-1) and re-embed the corpus; until that migration is done, " +
  "opt out explicitly with SUBSUMIO_EU_ONLY_EMBEDDINGS=0. See docs/architecture/LLM_GATEWAY.md.";

export class EuResidencyError extends AIConfigError {
  readonly touchpoint: EuTouchpoint;
  readonly target: string;
  readonly verdict: ResidencyVerdict;
  constructor(touchpoint: EuTouchpoint, target: string, verdict: ResidencyVerdict) {
    super(
      `EU-only mode (SUBSUMIO_EU_ONLY=1) refused ${touchpoint} via "${target}": ` +
        `processing is not in the EU/EEA (${verdict.basis}). No request was sent.`,
      touchpoint === "embedding"
        ? EMBEDDING_HINT
        : "Point this purpose at an EU route (bedrock:eu.anthropic.* in eu-central-1, mistral:*), " +
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
 * Embedding gate. Query text and document text are both client data, so a
 * non-EU embedding provider is refused for either side under SUBSUMIO_EU_ONLY.
 * Only the explicit opt-out SUBSUMIO_EU_ONLY_EMBEDDINGS=0 lets it through, and
 * that exception is logged once per model. `inputType` is kept for the log line.
 */
export function assertEuEmbedding(
  target: string,
  inputType: "query" | "document" | undefined,
  env: Env
): void {
  if (!isEuOnly(env)) return;
  const verdict = residencyOf(target, env);
  if (verdict.residency === "eu") return;
  if (!isEuOnlyEmbeddingsOptOut(env)) {
    throw new EuResidencyError("embedding", target, verdict);
  }
  if (!_embeddingExceptionLogged.has(target)) {
    _embeddingExceptionLogged.add(target);
    console.warn(
      `[eu-policy] ${inputType ?? "document"} embeddings via non-EU "${target}" allowed by explicit ` +
        `opt-out SUBSUMIO_EU_ONLY_EMBEDDINGS=0 (existing vector index; re-embedding with an EU ` +
        `model ends the exception).`
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
