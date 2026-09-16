// Shared access check for client-portal routes.
//
// A portal token grants a client access to exactly ONE matter in ONE firm
// brain. Every portal route must (1) verify the token, (2) talk to the engine
// with that firm's brain headers — never the engine default — and (3) refuse
// matters that are archived or not released for the portal.

import { apiError } from "@/lib/api-response";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { caseFrontmatter } from "@/lib/legal-types";
import { verifyPortalToken, type PortalTokenPayload } from "@/lib/portal-token";

export interface PortalAccess {
  payload: PortalTokenPayload & { brain_id: string };
  caseSlug: string;
  headers: Record<string, string>;
}

export async function resolvePortalAccess(token: string): Promise<PortalAccess | Response> {
  const payload = await verifyPortalToken(token);
  if (!payload) {
    return apiError("invalid_or_expired_token", "Token ungültig oder abgelaufen", 403);
  }
  if (!payload.brain_id) {
    return apiError(
      "new_portal_link_required",
      "Bitte fordern Sie einen neuen Portal-Link bei Ihrer Kanzlei an.",
      403
    );
  }

  const headers = engineHeadersForBrain(payload.brain_id);
  const res = await fetch(`${ENGINE_URL}/api/pages/${encodeURIComponent(payload.case_slug)}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    return apiError(
      "case_not_found",
      "Akte konnte nicht geladen werden",
      res.status === 404 ? 404 : 502
    );
  }
  const fm = caseFrontmatter(await res.json());
  if (fm.status === "archived") {
    return apiError(
      "case_archived",
      "Diese Akte wurde archiviert und ist nicht mehr verfügbar.",
      403
    );
  }
  if (!fm.portal_enabled) {
    return apiError(
      "portal_disabled",
      "Diese Akte ist derzeit nicht für das Mandantenportal freigegeben.",
      403
    );
  }

  return {
    payload: { ...payload, brain_id: payload.brain_id },
    caseSlug: payload.case_slug,
    headers,
  };
}
