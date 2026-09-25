/**
 * Email tracking system — open pixel, click redirect, and event logging.
 *
 * Provides:
 * - generateTrackingId(): unique ID per outbound email
 * - injectTracking(): rewrite HTML links + inject open pixel
 * - logTrackingEvent(): persist tracking events to DB
 - getTrackingEvents(): retrieve timeline for a message
 * - updateMessageTrackingStatus(): sync aggregate status on mail_messages
 *
 * Schema is lazily initialized via createSchemaInit, matching the
 * existing pattern used by audit, quota, and mailbox modules.
 *
 * Datenschutz: Es findet keine Standortermittlung über Dritte statt — die IP
 * des Empfängers wird an keinen externen Geo-Dienst übermittelt. Die Spalten
 * geo_country/geo_city bleiben nur für Altbestände im Schema und werden nicht
 * mehr befüllt.
 */

import { randomUUID, createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getSharedPgPool } from "@/lib/auth/store";
import { createSchemaInit } from "@/lib/schema-init";
import { siteUrl } from "@/lib/mail";
import { logger } from "@/lib/logger";
import { getAuthSecret } from "@/lib/auth/session-core";

const log = logger("email-tracking");

// ── Types ─────────────────────────────────────────────────────────────

export type TrackingEventType =
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained"
  | "forwarded"
  | "failed";

export interface TrackingEvent {
  id: string;
  messageId: string;
  trackingId: string;
  eventType: TrackingEventType;
  linkId: string | null;
  targetUrl: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  geoCountry: string | null;
  geoCity: string | null;
  isForward: boolean;
  raw: Record<string, unknown>;
  createdAt: string;
}

export interface TrackingEventInput {
  messageId?: string;
  trackingId: string;
  eventType: TrackingEventType;
  linkId?: string;
  targetUrl?: string;
  ipAddress?: string;
  userAgent?: string;
  isForward?: boolean;
  raw?: Record<string, unknown>;
}

// ── Schema ────────────────────────────────────────────────────────────

const ensureTrackingSchema = createSchemaInit([
  `CREATE TABLE IF NOT EXISTS subsumio_email_tracking_events (
    id              text PRIMARY KEY,
    message_id      text,
    tracking_id     text NOT NULL,
    event_type      text NOT NULL CHECK (event_type IN ('sent','delivered','opened','clicked','bounced','complained','forwarded','failed')),
    link_id         text,
    target_url      text,
    ip_address      text,
    user_agent      text,
    geo_country     text,
    geo_city        text,
    is_forward      boolean NOT NULL DEFAULT false,
    raw             jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
  )`,
  "CREATE INDEX IF NOT EXISTS subsumio_email_tracking_message_idx ON subsumio_email_tracking_events (message_id, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS subsumio_email_tracking_tracking_id_idx ON subsumio_email_tracking_events (tracking_id)",
  "CREATE INDEX IF NOT EXISTS subsumio_email_tracking_event_type_idx ON subsumio_email_tracking_events (event_type)",

  `ALTER TABLE subsumio_mail_messages
     ADD COLUMN IF NOT EXISTS tracking_id text UNIQUE,
     ADD COLUMN IF NOT EXISTS tracking_status text DEFAULT 'sent',
     ADD COLUMN IF NOT EXISTS first_opened_at timestamptz,
     ADD COLUMN IF NOT EXISTS last_opened_at timestamptz,
     ADD COLUMN IF NOT EXISTS open_count int NOT NULL DEFAULT 0,
     ADD COLUMN IF NOT EXISTS click_count int NOT NULL DEFAULT 0,
     ADD COLUMN IF NOT EXISTS forwarded boolean NOT NULL DEFAULT false`,

  // Migration for existing deployments: widen the event_type CHECK so the
  // "sent" send-time marker and the Resend "email.failed" lifecycle event
  // (permanent send failure) are storable alongside bounce/complaint.
  `ALTER TABLE subsumio_email_tracking_events
     DROP CONSTRAINT IF EXISTS subsumio_email_tracking_events_event_type_check`,
  `ALTER TABLE subsumio_email_tracking_events
     ADD CONSTRAINT subsumio_email_tracking_events_event_type_check
     CHECK (event_type IN ('sent','delivered','opened','clicked','bounced','complained','forwarded','failed'))`,
]);

// ── Tracking ID ───────────────────────────────────────────────────────

/**
 * Generate a unique tracking ID for an outbound email.
 * Format: trk_<32 hex chars> — URL-safe, unpredictable.
 */
export function generateTrackingId(): string {
  return `trk_${randomUUID().replace(/-/g, "")}`;
}

/**
 * Generate a unique link ID for a tracked link within an email.
 * Format: lnk_<16 hex chars>.
 */
export function generateLinkId(): string {
  return `lnk_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

/** Binds a signed link to the mail (tracking id) and link it was issued for. */
export interface TrackedLinkBinding {
  trackingId: string;
  linkId?: string;
}

function signUrl(encodedUrl: string, binding?: TrackedLinkBinding): string {
  const secret = getAuthSecret();
  // Bound links sign tracking id + link id + target, so a signed target from
  // one mail cannot be replayed under another mail's tracking id. Links
  // without binding (issued before) verify only the target.
  const payload = binding
    ? `v2\n${binding.trackingId}\n${binding.linkId ?? ""}\n${encodedUrl}`
    : encodedUrl;
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function verifyUrlSignature(
  encodedUrl: string,
  signature: string,
  binding?: TrackedLinkBinding
): boolean {
  const expected = signUrl(encodedUrl, binding);
  if (signature.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── HTML injection ────────────────────────────────────────────────────

/**
 * Rewrite all href links in HTML to go through our click-redirect endpoint
 * and inject a 1x1 transparent tracking pixel before </body>.
 *
 * If the HTML has no </body> tag, the pixel is appended at the end.
 *
 * @param html Original HTML body
 * @param trackingId Unique tracking ID for this email
 * @returns Modified HTML with tracking pixel and rewritten links
 */
export function injectTracking(html: string, trackingId: string): string {
  const base = siteUrl();
  const trackingBase = `${base}/api/email/track`;

  // Rewrite all href="..." links (catches both single and double quotes)
  let modified = html.replace(/href=["']([^"']+)["']/gi, (match, url: string) => {
    // Skip anchor links, tel:, mailto:, and already-tracked links
    if (
      url.startsWith("#") ||
      url.startsWith("mailto:") ||
      url.startsWith("tel:") ||
      url.startsWith(`${trackingBase}/`)
    ) {
      return match;
    }
    const linkId = generateLinkId();
    const encoded = Buffer.from(url).toString("base64url");
    const sig = signUrl(encoded, { trackingId, linkId });
    const trackedUrl = `${trackingBase}/c/${trackingId}?l=${linkId}&u=${encoded}&s=${sig}`;
    return `href="${trackedUrl}"`;
  });

  // Inject tracking pixel
  const pixelUrl = `${trackingBase}/o/${trackingId}.png`;
  const pixel = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;border:0;width:1px;height:1px" />`;

  if (/<\/body>/i.test(modified)) {
    modified = modified.replace(/<\/body>/i, `${pixel}</body>`);
  } else {
    modified = modified + pixel;
  }

  return modified;
}

// ── Event logging ─────────────────────────────────────────────────────

/**
 * Persist a tracking event to the database.
 * Also updates the aggregate status on subsumio_mail_messages.
 *
 * Silently no-ops when no DB pool is configured (dev mode).
 */
export async function logTrackingEvent(input: TrackingEventInput): Promise<TrackingEvent | null> {
  const pool = getSharedPgPool();
  if (!pool) {
    // Dev mode: log to console for visibility
    log.info("event", {
      eventType: input.eventType,
      trackingId: input.trackingId,
      targetUrl: input.targetUrl,
      ipAddress: input.ipAddress,
    });
    return null;
  }

  await ensureTrackingSchema();

  const id = randomUUID();
  const now = new Date();

  try {
    const { rows } = await pool.query(
      `INSERT INTO subsumio_email_tracking_events
        (id, message_id, tracking_id, event_type, link_id, target_url,
         ip_address, user_agent, geo_country, geo_city, is_forward, raw, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)
       RETURNING *`,
      [
        id,
        input.messageId ?? null,
        input.trackingId,
        input.eventType,
        input.linkId ?? null,
        input.targetUrl ?? null,
        input.ipAddress ?? null,
        input.userAgent ?? null,
        null, // geo_country — no third-party geo lookup
        null, // geo_city
        input.isForward ?? false,
        JSON.stringify(input.raw ?? {}),
        now,
      ]
    );

    // Update aggregate status on mail_messages
    await updateMessageTrackingStatus(input.trackingId, input.eventType, input.isForward ?? false);

    return rowToTrackingEvent(rows[0]);
  } catch (err) {
    log.error("failed to log event", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Update the aggregate tracking status on subsumio_mail_messages.
 * Called automatically after each tracking event is logged.
 */
async function updateMessageTrackingStatus(
  trackingId: string,
  eventType: TrackingEventType,
  isForward: boolean
): Promise<void> {
  const pool = getSharedPgPool();
  if (!pool) return;

  try {
    if (eventType === "opened") {
      await pool.query(
        `UPDATE subsumio_mail_messages
         SET tracking_status = CASE WHEN tracking_status = 'clicked' THEN 'clicked' ELSE 'opened' END,
             first_opened_at = COALESCE(first_opened_at, now()),
             last_opened_at = now(),
             open_count = open_count + 1,
             forwarded = forwarded OR $2
         WHERE tracking_id = $1`,
        [trackingId, isForward]
      );
    } else if (eventType === "clicked") {
      await pool.query(
        `UPDATE subsumio_mail_messages
         SET tracking_status = 'clicked',
             first_opened_at = COALESCE(first_opened_at, now()),
             last_opened_at = COALESCE(last_opened_at, now()),
             click_count = click_count + 1,
             forwarded = forwarded OR $2
         WHERE tracking_id = $1`,
        [trackingId, isForward]
      );
    } else if (eventType === "delivered") {
      await pool.query(
        `UPDATE subsumio_mail_messages
         SET tracking_status = 'delivered'
         WHERE tracking_id = $1 AND tracking_status = 'sent'`,
        [trackingId]
      );
    } else if (eventType === "bounced") {
      await pool.query(
        `UPDATE subsumio_mail_messages
         SET tracking_status = 'bounced'
         WHERE tracking_id = $1`,
        [trackingId]
      );
    } else if (eventType === "complained") {
      await pool.query(
        `UPDATE subsumio_mail_messages
         SET tracking_status = 'complained'
         WHERE tracking_id = $1`,
        [trackingId]
      );
    } else if (eventType === "forwarded") {
      await pool.query(
        `UPDATE subsumio_mail_messages
         SET forwarded = true
         WHERE tracking_id = $1`,
        [trackingId]
      );
    } else if (eventType === "failed") {
      await pool.query(
        `UPDATE subsumio_mail_messages
         SET tracking_status = 'failed'
         WHERE tracking_id = $1`,
        [trackingId]
      );
    }
  } catch (err) {
    log.error("failed to update message status", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ── Query ─────────────────────────────────────────────────────────────

/**
 * Retrieve all tracking events for a given message ID, ordered chronologically.
 */
export async function getTrackingEvents(messageId: string): Promise<TrackingEvent[]> {
  const pool = getSharedPgPool();
  if (!pool) return [];

  await ensureTrackingSchema();

  const { rows } = await pool.query(
    `SELECT * FROM subsumio_email_tracking_events
     WHERE message_id = $1
     ORDER BY created_at ASC`,
    [messageId]
  );

  return rows.map(rowToTrackingEvent);
}

/**
 * Look up the message ID associated with a tracking ID.
 * Used by the pixel and click endpoints to find the message.
 */
export async function getMessageIdByTrackingId(trackingId: string): Promise<string | null> {
  const pool = getSharedPgPool();
  if (!pool) return null;

  await ensureTrackingSchema();

  const { rows } = await pool.query(
    "SELECT id FROM subsumio_mail_messages WHERE tracking_id = $1",
    [trackingId]
  );

  return rows[0]?.id ?? null;
}

/**
 * Get the first open event for a tracking ID — used as baseline for forward detection.
 */
export async function getFirstOpenEvent(trackingId: string): Promise<TrackingEvent | null> {
  const pool = getSharedPgPool();
  if (!pool) return null;

  await ensureTrackingSchema();

  const { rows } = await pool.query(
    `SELECT * FROM subsumio_email_tracking_events
     WHERE tracking_id = $1 AND event_type = 'opened'
     ORDER BY created_at ASC LIMIT 1`,
    [trackingId]
  );

  return rows[0] ? rowToTrackingEvent(rows[0]) : null;
}

// ── Forward detection ─────────────────────────────────────────────────

/**
 * Detect whether an open event is likely a forward by comparing IP hash and
 * mail client (User-Agent) against the first open event. A different IP alone
 * is not enough (mobile networks, VPNs) — the mail client must differ too.
 *
 * @returns true if this open appears to be from a different recipient
 */
export function detectForward(
  firstOpen: TrackingEvent | null,
  currentIp: string,
  currentUserAgent: string | null
): boolean {
  if (!firstOpen) return false;

  // Compare IP hash
  const firstIpHash = firstOpen.ipAddress
    ? createHash("sha256").update(firstOpen.ipAddress).digest("hex").slice(0, 16)
    : null;
  const currentIpHash = currentIp
    ? createHash("sha256").update(currentIp).digest("hex").slice(0, 16)
    : null;

  if (firstIpHash && currentIpHash && firstIpHash !== currentIpHash) {
    // Different IP — suspicious only if the User-Agent differs as well
    if (firstOpen.userAgent && currentUserAgent && firstOpen.userAgent !== currentUserAgent) {
      return true;
    }
  }

  // Very different user agent (different mail client) with different IP
  if (
    firstIpHash &&
    currentIpHash &&
    firstIpHash !== currentIpHash &&
    firstOpen.userAgent &&
    currentUserAgent &&
    !firstOpen.userAgent.toLowerCase().includes(extractUaCore(currentUserAgent))
  ) {
    return true;
  }

  return false;
}

/**
 * Extract the core mail client identifier from a User-Agent string.
 * e.g. "Mozilla/5.0 (Macintosh; ...) Apple WebKit/..." → "apple"
 */
function extractUaCore(ua: string): string {
  const lower = ua.toLowerCase();
  if (lower.includes("apple") || lower.includes("macintosh")) return "apple";
  if (lower.includes("outlook")) return "outlook";
  if (lower.includes("gmail")) return "gmail";
  if (lower.includes("thunderbird")) return "thunderbird";
  if (lower.includes("windows")) return "windows";
  if (lower.includes("android")) return "android";
  if (lower.includes("iphone") || lower.includes("ipad")) return "ios";
  return lower.slice(0, 20);
}

/**
 * Extract the real client IP from a request, respecting X-Forwarded-For
 * and X-Real-IP headers.
 */
export function extractClientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return null;
}

// ── Helpers ───────────────────────────────────────────────────────────

function rowToTrackingEvent(row: Record<string, unknown>): TrackingEvent {
  return {
    id: String(row.id),
    messageId: row.message_id ? String(row.message_id) : "",
    trackingId: String(row.tracking_id),
    eventType: row.event_type as TrackingEventType,
    linkId: row.link_id ? String(row.link_id) : null,
    targetUrl: row.target_url ? String(row.target_url) : null,
    ipAddress: row.ip_address ? String(row.ip_address) : null,
    userAgent: row.user_agent ? String(row.user_agent) : null,
    geoCountry: row.geo_country ? String(row.geo_country) : null,
    geoCity: row.geo_city ? String(row.geo_city) : null,
    isForward: Boolean(row.is_forward),
    raw: (row.raw && typeof row.raw === "object" ? row.raw : {}) as Record<string, unknown>,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

// ── Retention ─────────────────────────────────────────────────────────

/**
 * DSGVO-Löschkonzept: tracking events carry the recipient's IP address and
 * User-Agent (personal data). After the retention window the proof of
 * delivery lives on the aggregate tracking_status of the message itself —
 * the per-event IP/UA rows are no longer needed and must be deleted.
 *
 * @returns number of deleted rows (0 when no DB is configured)
 */
export async function purgeOldTrackingEvents(retentionDays: number): Promise<number> {
  const pool = getSharedPgPool();
  if (!pool) return 0;
  const { rowCount } = await pool.query(
    `DELETE FROM subsumio_email_tracking_events
      WHERE created_at < NOW() - ($1 * INTERVAL '1 day')`,
    [Math.max(1, Math.floor(retentionDays))]
  );
  return rowCount ?? 0;
}

// ── 1x1 transparent PNG ───────────────────────────────────────────────

/**
 * Pre-built 1x1 transparent PNG buffer.
 * This is the smallest valid transparent PNG — always returns the same bytes.
 */
const TRACKING_PIXEL_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

export function getTrackingPixel(): Buffer {
  return Buffer.from(TRACKING_PIXEL_BASE64, "base64");
}
