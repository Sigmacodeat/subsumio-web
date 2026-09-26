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
 * Embeddings depend on WHOSE text is embedded (assertEuEmbedding):
 *   - Client text never leaves the EU under EU-only: a search query (it
 *     carries the matter's facts) and a document of a firm source are refused
 *     on a non-EU provider. Callers degrade instead of failing: search runs
 *     keyword-only with a visible flag, a document stays keyword-searchable
 *     and is marked `embedding_status: blocked_eu_only`.
 *   - The public statute/case-law corpus (`law-*` sources) is not client
 *     data. Its vectors belong to one model, so switching provider means
 *     re-embedding the corpus: with SUBSUMIO_EU_ONLY alone it keeps using the
 *     configured provider (logged once); SUBSUMIO_EU_ONLY_EMBEDDINGS=1 also
 *     refuses it.
 *   - A document of unknown origin counts as client text inside a firm's
 *     EU-only scope (request-eu-policy.ts); under the deployment switch alone
 *     it follows the corpus rule (the unlabelled bulk paths are corpus runs).
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
 * Page frontmatter `embedding_status` when EU-only refused the embedding
 * provider for the page's text: keyword-searchable, no vectors.
 */
export const EMBEDDING_STATUS_BLOCKED_EU_ONLY = "blocked_eu_only";

/** Whose text an embedding call carries. */
export type EmbeddingOrigin = "public_corpus" | "client";

/**
 * Origin of a page's text by its source: the shared statute/case-law corpus
 * lives in `law-*` sources; every other source (a firm's, the host
 * `default` brain) holds client data. Unknown source → undefined.
 */
export function embeddingOriginOfSource(
  sourceId: string | null | undefined
): EmbeddingOrigin | undefined {
  if (typeof sourceId !== "string" || sourceId.trim() === "") return undefined;
  return sourceId.startsWith("law-") ? "public_corpus" : "client";
}

export interface EuEmbeddingContext {
  /** True inside a firm's EU-only request/job scope (request-eu-policy.ts). */
  firmScope?: boolean;
  /** Whose text this is; see embeddingOriginOfSource. */
  origin?: EmbeddingOrigin;
}

/**
 * Embedding gate (see the header): query text and client documents are
 * refused on a non-EU provider whenever EU-only applies; public-corpus
 * documents only with SUBSUMIO_EU_ONLY_EMBEDDINGS=1 (otherwise allowed and
 * logged once per model).
 */
export function assertEuEmbedding(
  target: string,
  inputType: "query" | "document" | undefined,
  env: Env,
  ctx: EuEmbeddingContext = {}
): void {
  if (!isEuOnly(env)) return;
  const verdict = residencyOf(target, env);
  if (verdict.residency === "eu") return;
  const origin: EmbeddingOrigin | undefined =
    inputType === "query" ? "client" : (ctx.origin ?? (ctx.firmScope ? "client" : undefined));
  if (origin === "client") throw new EuResidencyError("embedding", target, verdict);
  if (isEuOnlyEmbeddings(env)) throw new EuResidencyError("embedding", target, verdict);
  if (!_embeddingExceptionLogged.has(target)) {
    _embeddingExceptionLogged.add(target);
    console.warn(
      `[eu-policy] public-corpus embeddings via non-EU "${target}" allowed: ` +
        `SUBSUMIO_EU_ONLY_EMBEDDINGS is off (existing vector index; re-embedding with an EU ` +
        `model is a separate migration). Client text is never embedded outside the EU.`
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
