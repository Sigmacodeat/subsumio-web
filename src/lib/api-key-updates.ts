/**
 * Which stored provider keys a save request actually changes.
 *
 * The settings form loads the stored keys masked ("sk-proj-1234…ab12") and
 * posts every field back. Writing those values verbatim used to either reject
 * the whole request (the mask fails the format check) or overwrite the other
 * providers' keys with null — one saved key wiped the rest. A field is
 * therefore only written when it carries a new secret; `null` deletes one on
 * purpose, and anything untouched, empty or still masked is left alone.
 */

/** The character maskApiKey() puts between prefix and suffix. */
const MASK_MARKER = "…";

export type KeyField = "openaiKey" | "anthropicKey" | "zeroEntropyKey";

export const KEY_FIELDS: KeyField[] = ["openaiKey", "anthropicKey", "zeroEntropyKey"];

export type KeyInput = string | null | undefined;

export type KeyDecision =
  | { kind: "keep" }
  | { kind: "delete" }
  | { kind: "set"; value: string }
  | { kind: "invalid" };

export function isMaskedKey(value: string): boolean {
  return value.includes(MASK_MARKER);
}

export function looksLikeApiKey(key: string): boolean {
  return key.length >= 8 && /^[A-Za-z0-9_\-.]+$/.test(key);
}

/** What to do with one submitted field. */
export function decideKeyUpdate(value: KeyInput): KeyDecision {
  if (value === null) return { kind: "delete" };
  if (typeof value !== "string") return { kind: "keep" };
  const trimmed = value.trim();
  if (trimmed === "") return { kind: "keep" };
  if (isMaskedKey(trimmed)) return { kind: "keep" };
  if (!looksLikeApiKey(trimmed)) return { kind: "invalid" };
  return { kind: "set", value: trimmed };
}

export interface KeyUpdatePlan {
  /** Fields whose plaintext secret must be encrypted and written. */
  set: Array<{ field: KeyField; value: string }>;
  /** Fields to clear. */
  remove: KeyField[];
  /** Fields whose value was neither a mask nor a usable key. */
  invalid: KeyField[];
}

export function planKeyUpdates(body: Partial<Record<KeyField, KeyInput>>): KeyUpdatePlan {
  const plan: KeyUpdatePlan = { set: [], remove: [], invalid: [] };
  for (const field of KEY_FIELDS) {
    const decision = decideKeyUpdate(body[field]);
    if (decision.kind === "set") plan.set.push({ field, value: decision.value });
    else if (decision.kind === "delete") plan.remove.push(field);
    else if (decision.kind === "invalid") plan.invalid.push(field);
  }
  return plan;
}
