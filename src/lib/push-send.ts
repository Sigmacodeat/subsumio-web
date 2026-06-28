/**
 * Push notification sender — sends via APNs (iOS) or FCM (Android).
 *
 * Environment variables:
 *   APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, APNS_PRIVATE_KEY_PATH — for iOS
 *   FCM_SERVER_KEY — for Android (legacy HTTP API)
 *
 * When neither provider is configured, push send is a no-op (dev mode).
 * The push-token-store still persists tokens so they're ready when
 * production credentials are configured.
 */

import { getPushTokensForUser, type PushTokenEntry } from "./push-token-store";
import { logger } from "@/lib/logger";

const log = logger("push-send");

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  badge?: number;
}

/**
 * Send a push notification to all registered devices for a user.
 * Returns the number of successfully sent notifications.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  const tokens = await getPushTokensForUser(userId);
  if (tokens.length === 0) return 0;

  let sent = 0;
  for (const entry of tokens) {
    try {
      if (entry.platform === "ios") {
        await sendViaAPNs(entry, payload);
      } else {
        await sendViaFCM(entry, payload);
      }
      sent++;
    } catch (err) {
      log.warn("push_send_failed", {
        userId,
        platform: entry.platform,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return sent;
}

async function sendViaAPNs(entry: PushTokenEntry, payload: PushPayload): Promise<void> {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const bundleId = process.env.APNS_BUNDLE_ID;
  const keyPath = process.env.APNS_PRIVATE_KEY_PATH;

  if (!keyId || !teamId || !bundleId || !keyPath) {
    // APNs not configured — silent no-op
    return;
  }

  const fs = await import("node:fs/promises");
  const { createSign } = await import("node:crypto");

  const privateKeyPem = await fs.readFile(keyPath, "utf-8");

  // Build ES256 JWT manually (no external dependency)
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" })).toString(
    "base64url"
  );
  const jwtPayload = Buffer.from(
    JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) })
  ).toString("base64url");
  const signingInput = `${header}.${jwtPayload}`;

  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKeyPem);
  const token = `${signingInput}.${signature.toString("base64url")}`;

  const isProduction = process.env.NODE_ENV === "production";
  const host = isProduction ? "api.push.apple.com" : "api.sandbox.push.apple.com";

  const res = await fetch(`https://${host}/3/device/${entry.token}`, {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
    },
    body: JSON.stringify({
      aps: {
        alert: { title: payload.title, body: payload.body },
        badge: payload.badge,
        sound: "default",
      },
      ...payload.data,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`APNs error ${res.status}: ${text}`);
  }
}

async function sendViaFCM(entry: PushTokenEntry, payload: PushPayload): Promise<void> {
  const serverKey = process.env.FCM_SERVER_KEY;
  if (!serverKey) {
    // FCM not configured — silent no-op
    return;
  }

  const res = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      Authorization: `key=${serverKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: entry.token,
      notification: {
        title: payload.title,
        body: payload.body,
        sound: "default",
        badge: payload.badge,
      },
      data: payload.data,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FCM error ${res.status}: ${text}`);
  }
}
