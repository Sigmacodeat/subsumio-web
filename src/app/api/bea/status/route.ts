import { createHandler, apiSuccess } from "@/lib/api-handler";
import { resolveFilingTransport } from "@/lib/legal/filing-transport";

export const dynamic = "force-dynamic";

/**
 * GET /api/bea/status — Gesundheitszustand des beA-Transports.
 * Liefert configured/reachable, damit die UI ehrlich anzeigt, ob der
 * Middleware-Versand aktiv ist oder nur der XML-Export-Pfad greift.
 */
export const GET = createHandler({ action: "brain.read", rateTier: "standard" }, async () => {
  const transport = resolveFilingTransport("beA", {
    endpoint: process.env.BEA_MIDDLEWARE_URL,
    apiKey: process.env.BEA_MIDDLEWARE_API_KEY,
  });
  const status = await transport.status();
  return apiSuccess(status);
});
