// Demo health probe for the /demo entry page — checks the engine is
// reachable and the demo-template source actually contains the seeded
// matter, so the entry button can degrade to a fallback instead of
// starting a broken session.

import { createPublicHandler } from "@/lib/api-handler";
import { env } from "@/lib/env";
import { DEMO_CASE_SLUG, demoTemplateSource } from "@/content/demo-matter";

export const dynamic = "force-dynamic";

export const GET = createPublicHandler({}, async (req) => {
  const engineUrl = env("SUBSUMIO_API_URL");
  if (!engineUrl) return Response.json({ configured: false });
  const jur = req.nextUrl.searchParams.get("jur") === "de" ? "de" : "at";
  try {
    const headers: Record<string, string> = { "x-subsumio-source": demoTemplateSource(jur) };
    const apiKey = env("SUBSUMIO_WEB_API_KEY");
    if (apiKey) headers["x-subsumio-api-key"] = apiKey;
    const slugPath = DEMO_CASE_SLUG.split("/").map(encodeURIComponent).join("/");
    const res = await fetch(`${engineUrl}/api/pages/${slugPath}`, {
      headers,
      signal: AbortSignal.timeout(4_000),
    });
    return Response.json({ configured: res.ok });
  } catch {
    return Response.json({ configured: false });
  }
});
