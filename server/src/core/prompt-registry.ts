/**
 * EPIC 8 — T8.2 Prompt Registry
 *
 * Versioned prompts with hash, owner, eval status, and rollback capability.
 * Only promoted prompts (passing the dev/test gate) are served in production.
 *
 * KEY INVARIANTS:
 *   - Every prompt version has a deterministic SHA-256 hash.
 *   - A prompt can only be promoted after passing the dev/test gate
 *     (eval_status = "tested" with pass_rate >= threshold).
 *   - Rollback immediately reverts to the previous promoted version.
 *   - The active production prompt is always the latest promoted version.
 *   - Prompt content is immutable once registered; new versions get new entries.
 */

import { createHash, randomUUID } from "node:crypto";

// ── Types ──────────────────────────────────────────────────────────────

export type PromptEvalStatus = "draft" | "tested" | "promoted" | "rolled_back";

export interface PromptEvalResults {
  pass_rate: number;
  hallucination_rate: number;
  tested_at: string;
  fixture_version: string;
  total_cases: number;
  passed_cases: number;
}

export interface PromptEntry {
  id: string;
  name: string;
  version: string;
  content: string;
  hash: string;
  owner: string;
  eval_status: PromptEvalStatus;
  eval_results?: PromptEvalResults;
  promoted_at?: string;
  rolled_back_at?: string;
  rollback_reason?: string;
  previous_version?: string;
  created_at: string;
}

export interface RegisterPromptOpts {
  name: string;
  content: string;
  owner: string;
  previous_version?: string;
}

export interface PromotePromptOpts {
  name: string;
  version: string;
  eval_results: PromptEvalResults;
}

// ── Constants ──────────────────────────────────────────────────────────

export const PROMOTE_PASS_RATE_THRESHOLD = 0.85;
export const PROMOTE_HALLUCINATION_RATE_THRESHOLD = 0.1;

// ── Store ──────────────────────────────────────────────────────────────

/**
 * In-memory prompt store. In production this would be backed by a
 * `subsumio_prompt_registry` table. The interface is designed so a
 * DB-backed implementation can drop in without changing callers.
 */
interface PromptStore {
  entries: Map<string, PromptEntry>; // id → entry
  byName: Map<string, string[]>; // name → [entry ids...]
  activeVersion: Map<string, string>; // name → active entry id
}

const store: PromptStore = {
  entries: new Map(),
  byName: new Map(),
  activeVersion: new Map(),
};

/**
 * Reset the store — for testing only.
 */
export function _resetPromptStore(): void {
  store.entries.clear();
  store.byName.clear();
  store.activeVersion.clear();
}

// ── Helpers ────────────────────────────────────────────────────────────

export function computePromptHash(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function generateId(name: string, version: string): string {
  const slug = name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  return `${slug}:v${version}`;
}

function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const va = partsA[i] ?? 0;
    const vb = partsB[i] ?? 0;
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  return 0;
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Register a new prompt version. Status starts as "draft".
 */
export function registerPrompt(opts: RegisterPromptOpts): PromptEntry {
  const version = getNextVersion(opts.name, opts.previous_version);
  const id = generateId(opts.name, version);
  const hash = computePromptHash(opts.content);

  // Check for duplicate content hash
  const existing = listVersions(opts.name);
  for (const entry of existing) {
    if (entry.hash === hash) {
      throw new Error(
        `Prompt "${opts.name}" already has a version "${entry.version}" with identical content (hash: ${hash.slice(0, 12)}...). ` +
          `Bump the version or modify the content.`
      );
    }
  }

  const entry: PromptEntry = {
    id,
    name: opts.name,
    version,
    content: opts.content,
    hash,
    owner: opts.owner,
    eval_status: "draft",
    previous_version: opts.previous_version,
    created_at: new Date().toISOString(),
  };

  store.entries.set(id, entry);
  const nameVersions = store.byName.get(opts.name) ?? [];
  nameVersions.push(id);
  store.byName.set(opts.name, nameVersions);

  return entry;
}

/**
 * Get the next version number for a prompt.
 * If previous_version is provided, increments the patch version.
 * Otherwise, starts at "1.0.0".
 */
export function getNextVersion(name: string, previous_version?: string): string {
  if (previous_version) return bumpPatch(previous_version);
  const versions = listVersions(name);
  if (versions.length === 0) return "1.0.0";
  const latest = versions[versions.length - 1];
  return bumpPatch(latest.version);
}

function bumpPatch(version: string): string {
  const parts = version.split(".").map(Number);
  const patch = parts[2] ?? 0;
  parts[2] = patch + 1;
  return parts.join(".");
}

/**
 * Submit eval results for a prompt version, transitioning it to "tested".
 */
export function submitEvalResults(
  name: string,
  version: string,
  results: PromptEvalResults
): PromptEntry {
  const id = generateId(name, version);
  const entry = store.entries.get(id);
  if (!entry) {
    throw new Error(`Prompt "${name}" version "${version}" not found. Register it first.`);
  }
  if (entry.eval_status === "promoted") {
    throw new Error(
      `Prompt "${name}" version "${version}" is already promoted. Cannot re-evaluate.`
    );
  }
  entry.eval_results = results;
  entry.eval_status = "tested";
  return entry;
}

/**
 * Promote a prompt version to production after passing the dev/test gate.
 *
 * Gate requirements:
 *   - eval_status must be "tested"
 *   - pass_rate >= 0.85
 *   - hallucination_rate <= 0.10
 *
 * The previously promoted version (if any) is implicitly rolled back.
 */
export function promotePrompt(opts: PromotePromptOpts): {
  promoted: PromptEntry;
  previous?: PromptEntry;
} {
  const id = generateId(opts.name, opts.version);
  const entry = store.entries.get(id);
  if (!entry) {
    throw new Error(
      `Prompt "${opts.name}" version "${opts.version}" not found. Register it first.`
    );
  }

  // Dev/Test Gate
  if (entry.eval_status !== "tested") {
    throw new Error(
      `Prompt "${opts.name}" version "${opts.version}" cannot be promoted: ` +
        `eval_status is "${entry.eval_status}", must be "tested". ` +
        `Submit eval results first via submitEvalResults().`
    );
  }

  const results = entry.eval_results!;
  if (results.pass_rate < PROMOTE_PASS_RATE_THRESHOLD) {
    throw new Error(
      `Prompt "${opts.name}" version "${opts.version}" cannot be promoted: ` +
        `pass_rate ${results.pass_rate.toFixed(2)} is below threshold ${PROMOTE_PASS_RATE_THRESHOLD}.`
    );
  }

  if (results.hallucination_rate > PROMOTE_HALLUCINATION_RATE_THRESHOLD) {
    throw new Error(
      `Prompt "${opts.name}" version "${opts.version}" cannot be promoted: ` +
        `hallucination_rate ${results.hallucination_rate.toFixed(2)} exceeds threshold ${PROMOTE_HALLUCINATION_RATE_THRESHOLD}.`
    );
  }

  // Roll back the previously active version
  const previousActiveId = store.activeVersion.get(opts.name);
  let previous: PromptEntry | undefined;
  if (previousActiveId) {
    previous = store.entries.get(previousActiveId);
    if (previous && previous.id !== id) {
      previous.eval_status = "rolled_back";
      previous.rolled_back_at = new Date().toISOString();
      previous.rollback_reason = `Superseded by version ${opts.version}`;
    }
  }

  // Promote
  entry.eval_status = "promoted";
  entry.promoted_at = new Date().toISOString();
  store.activeVersion.set(opts.name, id);

  return { promoted: entry, previous };
}

/**
 * Rollback to the previous promoted version.
 * The current active version is marked as "rolled_back".
 */
export function rollbackPrompt(
  name: string,
  reason: string
): { rolled_back: PromptEntry; restored?: PromptEntry } {
  const activeId = store.activeVersion.get(name);
  if (!activeId) {
    throw new Error(`No active promoted version for prompt "${name}". Nothing to roll back.`);
  }

  const active = store.entries.get(activeId)!;
  active.eval_status = "rolled_back";
  active.rolled_back_at = new Date().toISOString();
  active.rollback_reason = reason;

  // Find the previous promoted version
  const versions = listVersions(name);
  const previousPromoted = versions
    .filter(
      (v) => v.id !== activeId && v.eval_status === "rolled_back" && v.promoted_at !== undefined
    )
    .sort((a, b) => compareVersions(b.version, a.version))[0];

  if (previousPromoted) {
    // Re-promote the previous version
    previousPromoted.eval_status = "promoted";
    previousPromoted.rolled_back_at = undefined;
    previousPromoted.rollback_reason = undefined;
    store.activeVersion.set(name, previousPromoted.id);
    return { rolled_back: active, restored: previousPromoted };
  }

  // No previous version to restore
  store.activeVersion.delete(name);
  return { rolled_back: active };
}

/**
 * Get the currently active (promoted) prompt for a given name.
 * Returns undefined if no prompt has been promoted.
 */
export function getActivePrompt(name: string): PromptEntry | undefined {
  const activeId = store.activeVersion.get(name);
  if (!activeId) return undefined;
  return store.entries.get(activeId);
}

/**
 * Get a specific prompt version by name and version.
 */
export function getPromptVersion(name: string, version: string): PromptEntry | undefined {
  const id = generateId(name, version);
  return store.entries.get(id);
}

/**
 * List all versions of a prompt, sorted by version ascending.
 */
export function listVersions(name: string): PromptEntry[] {
  const ids = store.byName.get(name) ?? [];
  const entries = ids
    .map((id) => store.entries.get(id))
    .filter((e): e is PromptEntry => e !== undefined);
  return entries.sort((a, b) => compareVersions(a.version, b.version));
}

/**
 * List all registered prompt names.
 */
export function listPromptNames(): string[] {
  return [...store.byName.keys()].sort();
}

/**
 * Get the full audit trail for a prompt: all versions with their
 * eval status, promotion history, and rollback history.
 */
export interface PromptAuditTrail {
  name: string;
  active_version: string | null;
  versions: Array<{
    version: string;
    hash: string;
    owner: string;
    eval_status: PromptEvalStatus;
    eval_results?: PromptEvalResults;
    promoted_at?: string;
    rolled_back_at?: string;
    rollback_reason?: string;
    created_at: string;
  }>;
}

export function getAuditTrail(name: string): PromptAuditTrail {
  const versions = listVersions(name);
  const active = getActivePrompt(name);
  return {
    name,
    active_version: active?.version ?? null,
    versions: versions.map((v) => ({
      version: v.version,
      hash: v.hash,
      owner: v.owner,
      eval_status: v.eval_status,
      eval_results: v.eval_results,
      promoted_at: v.promoted_at,
      rolled_back_at: v.rolled_back_at,
      rollback_reason: v.rollback_reason,
      created_at: v.created_at,
    })),
  };
}

/**
 * Verify that the active prompt's content matches its hash.
 * Tamper-evident check: if content was modified after registration,
 * this returns false.
 */
export function verifyPromptIntegrity(name: string): boolean {
  const active = getActivePrompt(name);
  if (!active) return true; // No active prompt = nothing to verify
  return computePromptHash(active.content) === active.hash;
}
