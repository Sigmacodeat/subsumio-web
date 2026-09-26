/**
 * Web push for the client portal: a client who installed the portal as an app
 * (or keeps it open in a browser) is told when the firm replied. The message
 * carries no content — only "your firm replied" and the portal link — so
 * nothing confidential passes through the browser vendors' push services.
 *
 * Needs VAPID keys (WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY, WEB_PUSH_SUBJECT);
 * without them the portal does not offer notifications. Subscriptions live in
 * the web app's Postgres (subsumio_portal_push), in memory without a database.
 */
import { createHash } from "node:crypto";
import { getSharedPgPool } from "@/lib/auth/store";
import { createSchemaInit } from "@/lib/schema-init";
import { isPushServiceEndpoint, sendWebPush, webPushPublicKey } from "@/lib/web-push-core";
import { logger } from "@/lib/logger";
import { isPortalTokenHashRevoked } from "@/lib/portal-token";

const log = logger("portal-push");

export interface PortalPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * The page a notification opens. Never the access link itself: the stored
 * subscription must not hold a usable token. The portal (and the installed
 * portal app) keeps its session, so the placeholder path opens the matter.
 */
export const PORTAL_PUSH_PATH = "/portal/meine-akte";

interface StoredSubscription extends PortalPushSubscription {
  brainId: string;
  caseSlug: string;
  /** Hash of the portal link the device subscribed with (revocation check). */
  tokenHash: string;
}

export { isPushServiceEndpoint } from "@/lib/web-push-core";

export function portalPushPublicKey(): string | null {
  return webPushPublicKey();
}

const ensureSchema = createSchemaInit([
  `CREATE TABLE IF NOT EXISTS subsumio_portal_push (
     endpoint_hash text PRIMARY KEY,
     brain_id text NOT NULL,
     case_slug text NOT NULL,
     endpoint text NOT NULL,
     p256dh text NOT NULL,
     auth text NOT NULL,
     portal_path text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS subsumio_portal_push_case ON subsumio_portal_push (brain_id, case_slug)`,
  `ALTER TABLE subsumio_portal_push ADD COLUMN IF NOT EXISTS token_hash text`,
  // Older rows kept the raw access link as portal_path and no hash to check
  // revocations against — they are dropped; the portal subscribes again.
  `DELETE FROM subsumio_portal_push WHERE token_hash IS NULL`,
]);

const memory = new Map<string, StoredSubscription>();

function endpointHash(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

export async function savePortalSubscription(sub: StoredSubscription): Promise<void> {
  if (!isPushServiceEndpoint(sub.endpoint)) throw new Error("unknown push service");
  const pool = getSharedPgPool();
  if (!pool) {
    memory.set(endpointHash(sub.endpoint), sub);
    return;
  }
  await ensureSchema();
  await pool.query(
    `INSERT INTO subsumio_portal_push (endpoint_hash, brain_id, case_slug, endpoint, p256dh, auth, portal_path, token_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (endpoint_hash) DO UPDATE
       SET brain_id = $2, case_slug = $3, p256dh = $5, auth = $6, portal_path = $7, token_hash = $8`,
    [
      endpointHash(sub.endpoint),
      sub.brainId,
      sub.caseSlug,
      sub.endpoint,
      sub.keys.p256dh,
      sub.keys.auth,
      PORTAL_PUSH_PATH,
      sub.tokenHash,
    ]
  );
}

export async function removePortalSubscription(endpoint: string): Promise<void> {
  const pool = getSharedPgPool();
  if (!pool) {
    memory.delete(endpointHash(endpoint));
    return;
  }
  await ensureSchema();
  await pool.query("DELETE FROM subsumio_portal_push WHERE endpoint_hash = $1", [
    endpointHash(endpoint),
  ]);
}

/**
 * Revoking portal links ends their notifications: one link (by hash) or,
 * without a hash, every device of the matter ("revoke all").
 */
export async function removePortalSubscriptionsFor(
  brainId: string,
  caseSlug: string,
  tokenHash?: string
): Promise<void> {
  const pool = getSharedPgPool();
  if (!pool) {
    for (const [key, s] of memory) {
      if (s.brainId !== brainId || s.caseSlug !== caseSlug) continue;
      if (tokenHash && s.tokenHash !== tokenHash) continue;
      memory.delete(key);
    }
    return;
  }
  await ensureSchema();
  if (tokenHash) {
    await pool.query(
      "DELETE FROM subsumio_portal_push WHERE brain_id = $1 AND case_slug = $2 AND token_hash = $3",
      [brainId, caseSlug, tokenHash]
    );
  } else {
    await pool.query("DELETE FROM subsumio_portal_push WHERE brain_id = $1 AND case_slug = $2", [
      brainId,
      caseSlug,
    ]);
  }
}

export async function subscriptionsFor(
  brainId: string,
  caseSlug: string
): Promise<StoredSubscription[]> {
  const pool = getSharedPgPool();
  if (!pool) {
    return [...memory.values()].filter((s) => s.brainId === brainId && s.caseSlug === caseSlug);
  }
  await ensureSchema();
  const { rows } = await pool.query(
    "SELECT * FROM subsumio_portal_push WHERE brain_id = $1 AND case_slug = $2",
    [brainId, caseSlug]
  );
  return rows.map((r: Record<string, string>) => ({
    brainId: r.brain_id!,
    caseSlug: r.case_slug!,
    endpoint: r.endpoint!,
    keys: { p256dh: r.p256dh!, auth: r.auth! },
    tokenHash: r.token_hash!,
  }));
}

/**
 * Tells every device subscribed to this matter's portal. Returns how many
 * were reached; subscriptions the push service reports as gone are removed.
 */
export async function notifyPortalClients(
  brainId: string,
  caseSlug: string,
  message: { title: string; body: string }
): Promise<number> {
  if (!webPushPublicKey()) return 0;
  let reached = 0;
  for (const sub of await subscriptionsFor(brainId, caseSlug)) {
    // A revoked link gets no further notifications (and its device is dropped).
    if (!sub.tokenHash || (await isPortalTokenHashRevoked(sub.tokenHash))) {
      await removePortalSubscription(sub.endpoint);
      continue;
    }
    const result = await sendWebPush(
      { endpoint: sub.endpoint, keys: sub.keys },
      { ...message, data: { url: PORTAL_PUSH_PATH } }
    );
    if (result === "sent") reached++;
    else if (result === "gone") await removePortalSubscription(sub.endpoint);
    else if (result === "failed") log.warn("portal push failed");
  }
  return reached;
}
