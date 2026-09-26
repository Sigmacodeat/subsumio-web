/**
 * Office add-in tokens (Word, Outlook).
 *
 * The add-ins used to be connected with a permanent `sk_live_` API key. An
 * add-in token is instead issued from the signed-in web session, is valid for
 * at most 24 hours, carries only the `write` scope (which includes `read`;
 * never `admin`), and can be revoked at any time. Issuing a new one revokes
 * the previous one of the same person, so at most one is active.
 *
 * Tokens live in the API-key store (kind "addin", `expiresAt`) and are
 * verified by the same path as API keys (src/lib/auth/api-key-auth.ts), so
 * role rights, scope checks, rate limits and credits apply unchanged.
 *
 * The add-ins obtain their token through the Office dialog: it opens
 * /addin-connect, the person signs in normally (incl. 2FA) and confirms, and
 * the page hands the token to the task pane via `messageParent`. Each add-in
 * (Word, Outlook) holds its own token, so connecting one does not sign the
 * other out.
 */
import { b64url } from "@/lib/auth/session";
import { getApiKeyPrefix, hashApiKey } from "@/lib/api-keys";
import type { ApiKeyStore, StoredApiKey } from "@/lib/api-key-store";
import type { AddinClient } from "@/lib/addin-dialog";

export const ADDIN_TOKEN_PREFIX = "sk_addin_";
export const ADDIN_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
/** What the add-ins need: reading and writing matters/documents, no admin. */
export const ADDIN_TOKEN_SCOPES: readonly string[] = ["write"];

/** Name of tokens issued without a client (manual panel) — shared by both add-ins. */
const SHARED_TOKEN_NAME = "Office-Add-in (Word/Outlook)";
const CLIENT_TOKEN_NAMES: Record<AddinClient, string> = {
  word: "Office-Add-in (Word)",
  outlook: "Office-Add-in (Outlook)",
};

export function generateAddinToken(): { token: string; id: string } {
  const random = crypto.getRandomValues(new Uint8Array(32));
  const secret = b64url(
    random.buffer.slice(random.byteOffset, random.byteOffset + random.byteLength) as ArrayBuffer
  )
    .replace(/[_-]/g, "")
    .slice(0, 40);
  return { token: `${ADDIN_TOKEN_PREFIX}${secret}`, id: crypto.randomUUID() };
}

export function isAddinToken(token: string): boolean {
  return token.startsWith(ADDIN_TOKEN_PREFIX);
}

/** A stored key authenticates only while active and not expired. */
export function isStoredKeyUsable(key: StoredApiKey, now: number = Date.now()): boolean {
  if (!key.active) return false;
  if (key.expiresAt) {
    const exp = Date.parse(key.expiresAt);
    if (!Number.isFinite(exp) || exp <= now) return false;
  }
  // An add-in token must carry an expiry — never a permanent one.
  if (key.kind === "addin" && !key.expiresAt) return false;
  return true;
}

/** Revokes (deletes) the owner's add-in tokens; returns how many. */
export async function revokeAddinTokens(store: ApiKeyStore, ownerId: string): Promise<number> {
  const keys = (await store.listByOwner(ownerId)).filter((k) => k.kind === "addin");
  for (const k of keys) await store.delete(k.id);
  return keys.length;
}

/** Revokes one add-in token of the owner (sign-out from a single add-in). */
export async function revokeAddinToken(
  store: ApiKeyStore,
  ownerId: string,
  keyId: string
): Promise<number> {
  const key = (await store.listByOwner(ownerId)).find((k) => k.kind === "addin" && k.id === keyId);
  if (!key) return 0;
  await store.delete(key.id);
  return 1;
}

/**
 * Issues a new add-in token for the signed-in person. Earlier add-in tokens
 * of this person (active or expired) are removed first — all of them when no
 * client is named, otherwise those of the same add-in and the shared one.
 */
export async function issueAddinToken(
  store: ApiKeyStore,
  owner: { id: string; email: string },
  now: number = Date.now(),
  client: AddinClient | null = null
): Promise<{ token: string; id: string; expiresAt: string }> {
  const name = client ? CLIENT_TOKEN_NAMES[client] : SHARED_TOKEN_NAME;
  if (client) {
    const replaced = (await store.listByOwner(owner.id)).filter(
      (k) => k.kind === "addin" && (k.name === name || k.name === SHARED_TOKEN_NAME)
    );
    for (const k of replaced) await store.delete(k.id);
  } else {
    await revokeAddinTokens(store, owner.id);
  }
  const { token, id } = generateAddinToken();
  const expiresAt = new Date(now + ADDIN_TOKEN_TTL_MS).toISOString();
  await store.create({
    id,
    name,
    prefix: getApiKeyPrefix(token),
    secretHash: await hashApiKey(token),
    scopes: [...ADDIN_TOKEN_SCOPES],
    active: true,
    createdAt: new Date(now).toISOString(),
    createdBy: owner.email,
    ownerId: owner.id,
    kind: "addin",
    expiresAt,
  });
  return { token, id, expiresAt };
}
