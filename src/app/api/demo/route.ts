// Public "try the brain" endpoint for the marketing branch pages.
//
// Safety: NO session (public), rate-limited per IP, and locked to a single
// READ-ONLY demo brain (never a tenant). The engine API key is added
// server-side only. Returns { configured:false } — not an error — when the
// engine isn't deployed yet, so the widget degrades to its scripted answer.
//
// SECURITY: The demo brain MUST contain only synthetic/public data — never
// real client data. The operator seeds it via `gbrain` CLI with a dedicated
// demo source. The slug is hardcoded to "demo" unless overridden by env.

import { NextRequest } from "next/server";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { hit, clientIp } from "@/lib/auth/rate-limit";
import { env } from "@/lib/env";

const CONFIGURED = env("SIGMABRAIN_API_URL");
// Read-only demo source on the engine; the operator seeds it. Never a tenant.
// The fallback "demo" slug is a reserved engine source — never a tenant brain.
const DEMO_BRAIN = env("SIGMABRAIN_DEMO_BRAIN") || "demo";

export async function GET(req: NextRequest) {
  // Tight public rate limit: 20 demo queries / IP / hour.
  const limit = await hit(`demo:${clientIp(req.headers)}`, 20, 60 * 60_000);
  if (!limit.ok) {
    return Response.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  // Engine not deployed yet → tell the widget to show its scripted fallback.
  if (!CONFIGURED) return Response.json({ configured: false });

  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 300);
  if (!q) return Response.json({ configured: true, results: [] });

  try {
    const res = await fetch(
      `${ENGINE_URL}/api/search?q=${encodeURIComponent(q)}&limit=4`,
      { headers: engineHeadersForBrain(DEMO_BRAIN) },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Response.json({ configured: true, results: Array.isArray(data) ? data : (data?.results ?? []) });
  } catch (err) {
    console.error("[demo] engine search failed:", err instanceof Error ? err.message : String(err));
    // Soft-fail to the scripted fallback rather than a hard error on a public page.
    return Response.json({ configured: false });
  }
}
