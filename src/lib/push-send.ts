/**
 * Push notification sender — sends via web push (browsers and installed
 * PWAs, see web-push-core.ts), APNs (iOS) or FCM (Android).
 *
 * Environment variables:
 *   APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, APNS_PRIVATE_KEY_PATH — for iOS
 *     (APNs provider API over HTTP/2)
 *   FCM_SERVICE_ACCOUNT_PATH — for Android: Firebase service-account JSON
 *     (FCM HTTP v1 API; the legacy server-key API no longer exists)
 *
 * An unconfigured provider sends nothing and is counted as not sent. The
 * push-token-store still persists tokens so they're ready when production
 * credentials are configured. Tokens the provider reports as gone are
 * removed.
 */

import {
  deletePushTokensForUser,
  getPushTokensForUser,
  unregisterPushToken,
  type PushTokenEntry,
} from "./push-token-store";
import { getStore } from "@/lib/auth/store";
import { parseWebPushSubscription, sendWebPush } from "@/lib/web-push-core";
import { logger } from "@/lib/logger";
import { fcmAccessToken, loadFcmServiceAccount } from "@/lib/fcm-auth";

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

  // A deactivated (or deleted) account never receives pushes — matter and
  // deadline titles would land on a device whose user has no access any
  // more. Its leftover registrations are removed on the way.
  let user: Awaited<ReturnType<ReturnType<typeof getStore>["getById"]>>;
  try {
    user = await getStore().getById(userId);
  } catch {
    return 0; // account state unknown — fail closed, but keep the registrations
  }
  if (!user || user.deactivatedAt) {
    await deletePushTokensForUser(userId).catch(() => 0);
    return 0;
  }

  let sent = 0;
  for (const entry of tokens) {
    try {
      if (entry.platform === "web") {
        // A browser or installed PWA; the token is the push subscription (JSON).
        const sub = parseWebPushSubscription(entry.token);
        const result = sub
          ? await sendWebPush(sub, {
              title: payload.title,
              body: payload.body,
              data: { ...(payload.data ?? {}), url: webPushUrl(payload.data) },
            })
          : "gone";
        if (result === "gone") await unregisterPushToken(userId, entry.token);
        if (result !== "sent") continue;
      } else {
        const result =
          entry.platform === "ios"
            ? await sendViaAPNs(entry, payload)
            : await sendViaFCM(entry, payload);
        if (result === "gone") await unregisterPushToken(userId, entry.token);
        if (result !== "sent") continue;
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

/** Where a click on a web notification leads: the matter when there is one. */
function webPushUrl(data: Record<string, string> | undefined): string {
  if (data?.url?.startsWith("/")) return data.url;
  if (data?.case_slug) {
    return `/dashboard/cases/${data.case_slug.split("/").map(encodeURIComponent).join("/")}`;
  }
  return "/dashboard/notifications";
}

export type NativePushResult = "sent" | "gone" | "not_configured";

export interface Http2Response {
  status: number;
  body: string;
}
/** One HTTP/2 POST (APNs requires HTTP/2). Replaceable in tests. */
export type Http2Post = (
  origin: string,
  path: string,
  headers: Record<string, string>,
  body: string
) => Promise<Http2Response>;

const defaultHttp2Post: Http2Post = async (origin, path, headers, body) => {
  const http2 = await import("node:http2");
  return new Promise<Http2Response>((resolve, reject) => {
    const client = http2.connect(origin);
    client.on("error", reject);
    const req = client.request({ ":method": "POST", ":path": path, ...headers });
    req.setTimeout(10_000, () => {
      req.close();
      reject(new Error("APNs timeout"));
    });
    let status = 0;
    let data = "";
    req.setEncoding("utf8");
    req.on("response", (h) => {
      status = Number(h[":status"] ?? 0);
    });
    req.on("data", (chunk: string) => {
      data += chunk;
    });
    req.on("end", () => {
      client.close();
      resolve({ status, body: data });
    });
    req.on("error", (err) => {
      client.close();
      reject(err);
    });
    req.end(body);
  });
};

let http2Post: Http2Post = defaultHttp2Post;

/** Test seam: no real APNs connection in unit tests. */
export function setHttp2PostForTests(next: Http2Post | null): void {
  http2Post = next ?? defaultHttp2Post;
}

/** APNs reasons after which the device token will never work again. */
const APNS_GONE_REASONS = new Set(["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"]);

async function sendViaAPNs(entry: PushTokenEntry, payload: PushPayload): Promise<NativePushResult> {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const bundleId = process.env.APNS_BUNDLE_ID;
  const keyPath = process.env.APNS_PRIVATE_KEY_PATH;

  if (!keyId || !teamId || !bundleId || !keyPath) return "not_configured";

  const fs = await import("node:fs/promises");
  const { createSign } = await import("node:crypto");

  const privateKeyPem = await fs.readFile(keyPath, "utf-8");

  // ES256 JWT (JOSE signature format) without an external dependency.
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
  const signature = signer.sign({ key: privateKeyPem, dsaEncoding: "ieee-p1363" });
  const token = `${signingInput}.${signature.toString("base64url")}`;

  const isProduction = process.env.NODE_ENV === "production";
  const host = isProduction ? "api.push.apple.com" : "api.sandbox.push.apple.com";

  const res = await http2Post(
    `https://${host}`,
    `/3/device/${encodeURIComponent(entry.token)}`,
    {
      authorization: `bearer ${token}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    JSON.stringify({
      aps: {
        alert: { title: payload.title, body: payload.body },
        badge: payload.badge,
        sound: "default",
      },
      ...payload.data,
    })
  );

  if (res.status === 200) return "sent";
  let reason = "";
  try {
    reason = String((JSON.parse(res.body) as { reason?: unknown }).reason ?? "");
  } catch {
    /* no JSON body */
  }
  if (res.status === 410 || APNS_GONE_REASONS.has(reason)) return "gone";
  throw new Error(`APNs error ${res.status}: ${reason || res.body.slice(0, 200)}`);
}

async function sendViaFCM(entry: PushTokenEntry, payload: PushPayload): Promise<NativePushResult> {
  const account = await loadFcmServiceAccount();
  if (!account) return "not_configured";
  const accessToken = await fcmAccessToken(account);

  // FCM v1: data values must be strings.
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(payload.data ?? {})) data[k] = String(v);

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token: entry.token,
          notification: { title: payload.title, body: payload.body },
          data,
          android: { notification: { sound: "default" } },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (res.ok) return "sent";
  const text = await res.text().catch(() => "");
  if (res.status === 404 || /UNREGISTERED/.test(text)) return "gone";
  throw new Error(`FCM error ${res.status}: ${text.slice(0, 200)}`);
}
