/**
 * Video-Termin-Links via selbst-gehostetem oder public Jitsi (WP-8.53).
 *
 * JITSI_DOMAIN legt die Basis fest (z. B. "meet.jit.si" oder eine eigene
 * Instanz). Der Raumname ist ein HMAC des Termin-Slugs — deterministisch
 * (gleicher Termin → gleicher Raum), nicht ratbar, und enthält keine
 * Mandanten- oder Akteninformation.
 *
 * Ohne JITSI_DOMAIN meldet der Aufrufer `not_configured` — es wird nie
 * eine Fake-URL erzeugt.
 */

import { createHmac } from "node:crypto";
import { env } from "@/lib/env";

export function isVideoConfigured(): boolean {
  return Boolean(env("JITSI_DOMAIN"));
}

export function videoLinkFor(appointmentSlug: string): string | null {
  const domain = env("JITSI_DOMAIN")?.replace(/\/+$/, "");
  if (!domain) return null;
  const salt = env("AUTH_SECRET") || "subsumio-video";
  const room = createHmac("sha256", salt)
    .update(`video-room:${appointmentSlug}`)
    .digest("hex")
    .slice(0, 20);
  return `https://${domain}/subsumio-${room}`;
}
