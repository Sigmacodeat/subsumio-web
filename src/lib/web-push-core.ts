/**
 * Web push (VAPID) shared by the lawyers' dashboard (push-send.ts) and the
 * client portal (portal-push.ts). Web push payloads are end-to-end encrypted
 * to the browser (RFC 8291); the push service only relays them.
 *
 * Needs WEB_PUSH_PUBLIC_KEY / WEB_PUSH_PRIVATE_KEY (npx web-push
 * generate-vapid-keys) and optionally WEB_PUSH_SUBJECT; without keys nothing
 * is offered or sent.
 */
import webpush from "web-push";
import { env } from "@/lib/env";

export interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * The push services browsers use. A subscription's endpoint comes from the
 * client and the server later POSTs to it, so only these hosts are accepted —
 * anything else would let a caller make the server request arbitrary URLs.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
];

export function isPushServiceEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.port && PUSH_HOSTS.some((re) => re.test(url.hostname));
  } catch {
    return false;
  }
}

export function webPushPublicKey(): string | null {
  const pub = env("WEB_PUSH_PUBLIC_KEY");
  return pub && env("WEB_PUSH_PRIVATE_KEY") ? pub : null;
}

let configured = false;
function configure(): boolean {
  const pub = env("WEB_PUSH_PUBLIC_KEY");
  const priv = env("WEB_PUSH_PRIVATE_KEY");
  if (!pub || !priv) return false;
  if (!configured) {
    webpush.setVapidDetails(env("WEB_PUSH_SUBJECT") || "mailto:hello@subsum.io", pub, priv);
    configured = true;
  }
  return true;
}

/** "gone": the browser dropped the subscription; delete it. */
export type WebPushResult = "sent" | "gone" | "failed" | "disabled";

export async function sendWebPush(
  sub: WebPushSubscription,
  payload: { title: string; body: string; data?: Record<string, string> }
): Promise<WebPushResult> {
  if (!configure()) return "disabled";
  if (!isPushServiceEndpoint(sub.endpoint)) return "failed";
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 60 * 60 * 24 });
    return "sent";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    return status === 404 || status === 410 ? "gone" : "failed";
  }
}

/** Parses a stored subscription (JSON), or null when it is not a valid one. */
export function parseWebPushSubscription(raw: string): WebPushSubscription | null {
  try {
    const sub = JSON.parse(raw) as WebPushSubscription;
    if (typeof sub?.endpoint !== "string" || !isPushServiceEndpoint(sub.endpoint)) return null;
    if (typeof sub.keys?.p256dh !== "string" || typeof sub.keys?.auth !== "string") return null;
    return { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
  } catch {
    return null;
  }
}
