/**
 * Per-firm "Nur EU" (EU-only) for one request or job.
 *
 * `SUBSUMIO_EU_ONLY=1` switches EU-only on for the whole deployment. A firm
 * can also demand it for its own work (web org setting `modelPolicy:
 * "eu_only"`): the web app then sends `x-subsumio-model-policy: eu_only` with
 * every engine request. The engine runs that request inside this scope, so
 * every gateway touchpoint applies the same refusal as the deployment switch
 * (eu-policy.ts: EuResidencyError, no request leaves the process) — there is
 * no silent fallback to a non-EU model.
 *
 * Jobs queued while the scope is active are stamped (`_eu_only`), and the
 * worker runs them — and everything they queue — in the scope again.
 *
 * The header can only tighten the policy; its absence changes nothing.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export const MODEL_POLICY_HEADER = "x-subsumio-model-policy";
export const JOB_EU_ONLY_KEY = "_eu_only";

const store = new AsyncLocalStorage<true>();

/** Run `fn` with EU-only enforced for every model call it makes. */
export function runWithRequestEuOnly<T>(fn: () => T): T {
  return store.run(true, fn);
}

/** True inside a request/job that demands EU-only processing. */
export function isRequestEuOnly(): boolean {
  return store.getStore() === true;
}

/** The header value that demands EU-only (anything else: no change). */
export function headerDemandsEuOnly(value: string | string[] | undefined): boolean {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && v.trim().toLowerCase() === "eu_only";
}

/** True when a queued job was stamped EU-only. */
export function jobDemandsEuOnly(data: unknown): boolean {
  return (
    !!data &&
    typeof data === "object" &&
    (data as Record<string, unknown>)[JOB_EU_ONLY_KEY] === true
  );
}

/** The header value that explicitly lifts a firm's EU-only demand. */
export function headerLiftsEuOnly(value: string | string[] | undefined): boolean {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && v.trim().toLowerCase() === "any";
}

// ── Remembered per source (tenant) ─────────────────────────────────────
//
// Server-side work of a firm (crons, webhooks, background triggers) reaches
// the engine without a user session, so without the header. The engine
// therefore remembers which sources demanded EU-only: every signed-in
// request states the firm's current policy (`eu_only` or `any`), and a
// request without the header inherits the remembered demand.

const CONFIG_KEY = "policy.eu_only_sources";
const CACHE_MS = 30_000;

interface ConfigStore {
  getConfig(key: string): Promise<string | null>;
  setConfig(key: string, value: string): Promise<void>;
}

let cache: { at: number; sources: Set<string> } | null = null;

async function loadSources(engine: ConfigStore): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.sources;
  let sources = new Set<string>();
  try {
    const raw = await engine.getConfig(CONFIG_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) sources = new Set(parsed.filter((s) => typeof s === "string"));
  } catch {
    // Unreadable registry: keep what we knew (fail-closed for known sources).
    if (cache) return cache.sources;
  }
  cache = { at: Date.now(), sources };
  return sources;
}

/**
 * Decide EU-only for one request: an explicit header wins (and is
 * remembered for the source); without a header the remembered demand
 * applies.
 */
export async function resolveRequestEuOnly(
  engine: ConfigStore,
  sourceId: string,
  header: string | string[] | undefined
): Promise<boolean> {
  const demand = headerDemandsEuOnly(header);
  const lift = headerLiftsEuOnly(header);
  const sources = await loadSources(engine);
  if ((demand && !sources.has(sourceId)) || (lift && sources.has(sourceId))) {
    const next = new Set(sources);
    if (demand) next.add(sourceId);
    else next.delete(sourceId);
    await engine.setConfig(CONFIG_KEY, JSON.stringify([...next].sort()));
    cache = { at: Date.now(), sources: next };
  }
  if (demand) return true;
  if (lift) return false;
  return sources.has(sourceId);
}

/**
 * True when a queued job must run EU-only: stamped at submission, or its
 * source (tenant) demanded EU-only — covers jobs queued outside a request
 * scope (upload pipeline, schedulers).
 */
export async function jobRunsEuOnly(engine: ConfigStore, data: unknown): Promise<boolean> {
  if (jobDemandsEuOnly(data)) return true;
  const source =
    data && typeof data === "object" ? (data as Record<string, unknown>)._source_id : undefined;
  if (typeof source !== "string" || !source) return false;
  return (await loadSources(engine)).has(source);
}

/** True when the source (tenant) demanded EU-only. */
export async function sourceDemandsEuOnly(
  engine: ConfigStore,
  sourceId: string | null | undefined
): Promise<boolean> {
  if (typeof sourceId !== "string" || !sourceId) return false;
  return (await loadSources(engine)).has(sourceId);
}

/**
 * Run `fn` under the EU-only scope when the source demanded it. For work on
 * a firm's own documents that can run outside the firm's request (sync,
 * embed backfill, CLI): the demand follows the data, not the caller.
 */
export async function runEuScopedForSource<T>(
  engine: ConfigStore,
  sourceId: string | null | undefined,
  fn: () => Promise<T>
): Promise<T> {
  if (!isRequestEuOnly() && (await sourceDemandsEuOnly(engine, sourceId))) {
    return runWithRequestEuOnly(fn);
  }
  return fn();
}

/** Test-only: forget the cached registry. */
export function __resetEuSourceCacheForTests(): void {
  cache = null;
}

/** The effective policy env: the request scope turns SUBSUMIO_EU_ONLY on. */
export function withRequestEuPolicy(
  env: Record<string, string | undefined>
): Record<string, string | undefined> {
  return isRequestEuOnly() ? { ...env, SUBSUMIO_EU_ONLY: "1" } : env;
}
