import { createHandler, apiSuccess } from "@/lib/api-handler";

/**
 * GET /api/admin/ip-allowlist
 * POST /api/admin/ip-allowlist
 *
 * Manages the IP allowlist for enterprise access control.
 * Phase 1: Returns the current env-based allowlist (read-only display).
 * When SUBSUMIO_IP_ALLOWLIST is set, the middleware enforces it.
 *
 * The allowlist is env-driven (SUBSUMIO_IP_ALLOWLIST=10.0.0.0/8,192.168.1.100).
 * This API surfaces the current configuration for the admin UI.
 */

export const GET = createHandler(
  {
    // Installation-wide network configuration: platform operators only, never a
    // firm role (every firm owner is admin of their own firm).
    action: "platform.operator",
    rateTier: "standard",
  },
  async (_ctx) => {
    const rawAllowlist = process.env.SUBSUMIO_IP_ALLOWLIST ?? "";
    const entries = rawAllowlist
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const trustedProxyHops = process.env.SUBSUMIO_TRUSTED_PROXY_HOPS ?? "0";

    return apiSuccess({
      entries,
      enabled: entries.length > 0,
      trusted_proxy_hops: parseInt(trustedProxyHops, 10) || 0,
      note:
        entries.length === 0
          ? "IP allowlist is not configured. All IPs are allowed."
          : "IP allowlist is active. Only listed IPs/CIDRs can access the application.",
    });
  }
);
