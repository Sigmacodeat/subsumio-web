// Public "try the brain" endpoint for the marketing branch pages.
//
// Safety: NO session (public), rate-limited per IP, and locked to a single
// READ-ONLY demo brain (never a tenant). The engine API key is added
// server-side only. Returns { configured:false } — not an error — when the
// engine isn't deployed yet, so the widget degrades to its scripted answer.
//
// SECURITY: The demo brain MUST contain only synthetic/public data — never
// real client data. The operator seeds it via `subsumio` CLI with a dedicated
// demo source. The slug is hardcoded to "demo" unless overridden by env.

import { NextRequest } from "next/server";
import { createPublicHandler } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { clientIp } from "@/lib/auth/rate-limit";
import { env } from "@/lib/env";

const CONFIGURED = env("SUBSUMIO_API_URL");
const DEMO_BRAIN = env("SUBSUMIO_DEMO_BRAIN") || "demo";

export const GET = createPublicHandler(
  {
    rateLimitKey: (req: NextRequest) => `demo:${clientIp(req.headers)}`,
    rateLimitMax: 20,
    rateLimitWindowMs: 60 * 60_000,
  },
  async (req) => {
    if (!CONFIGURED) return Response.json({ configured: false });

    const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 300);
    if (!q) return Response.json({ configured: true, results: [] });

    try {
      const res = await fetch(`${ENGINE_URL}/api/search?q=${encodeURIComponent(q)}&limit=4`, {
        headers: engineHeadersForBrain(DEMO_BRAIN),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return Response.json({
        configured: true,
        results: Array.isArray(data) ? data : (data?.results ?? []),
      });
    } catch (err) {
      console.error("[demo] engine search failed:", err instanceof Error ? err.message : String(err));
      return Response.json({ configured: false });
    }
  },
);
