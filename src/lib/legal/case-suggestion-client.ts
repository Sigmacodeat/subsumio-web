import { csrfFetch } from "@/lib/csrf";

/**
 * Clients for POST /api/review-inbox/party-decision and
 * /api/review-inbox/case-field-decision. Throw an Error with the server's
 * German, user-facing text (e.g. the conflict message) — callers show it
 * instead of reporting success.
 */
async function post<T>(url: string, body: Record<string, unknown>, fallback: string): Promise<T> {
  const res = await csrfFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await res.json().catch(() => null)) as { data?: T; error?: string } | null;
  if (!res.ok) throw new Error(payload?.error || fallback);
  return (payload?.data ?? {}) as T;
}

export interface PartyDecisionRequest {
  caseSlug: string;
  index: number;
  action: "approve" | "reject";
  role?: string;
  contactSlug?: string;
  conflictWaiverReason?: string;
}

export function decidePartySuggestion(
  req: PartyDecisionRequest
): Promise<{ contact_slug?: string | null; applied?: string[] }> {
  return post(
    "/api/review-inbox/party-decision",
    {
      case_slug: req.caseSlug,
      index: req.index,
      action: req.action,
      ...(req.role ? { role: req.role } : {}),
      ...(req.contactSlug ? { contact_slug: req.contactSlug } : {}),
      ...(req.conflictWaiverReason ? { conflict_waiver_reason: req.conflictWaiverReason } : {}),
    },
    req.action === "approve"
      ? "Partei konnte nicht übernommen werden."
      : "Parteivorschlag konnte nicht verworfen werden."
  );
}

export function decideCaseFieldSuggestion(req: {
  caseSlug: string;
  index: number;
  action: "approve" | "reject";
  value?: string | number;
}): Promise<{ applied?: string[] }> {
  return post(
    "/api/review-inbox/case-field-decision",
    {
      case_slug: req.caseSlug,
      index: req.index,
      action: req.action,
      ...(req.value !== undefined ? { value: req.value } : {}),
    },
    req.action === "approve"
      ? "Aktendaten konnten nicht übernommen werden."
      : "Vorschlag konnte nicht verworfen werden."
  );
}

/** Contact-dialog role → party role of the suggestion decision. */
export function partyRoleFromContactRole(role: string | undefined): string | undefined {
  switch (role) {
    case "client":
      return "mandant";
    case "opponent":
      return "gegner";
    case "lawyer":
      return "gegnervertreter";
    case "court":
      return "gericht";
    case "other":
      return "sonstige";
    default:
      return undefined;
  }
}

/** Suggestion role → preset of the contact dialog ("other" when the side is open). */
export function contactRoleForSuggestion(
  role: string | undefined
): "client" | "opponent" | "court" | "lawyer" | "other" {
  switch ((role ?? "").toLowerCase()) {
    case "mandant":
    case "client":
    case "klient":
      return "client";
    case "gegner":
    case "opponent":
      return "opponent";
    case "gericht":
    case "behoerde":
    case "behörde":
    case "court":
      return "court";
    case "gegnervertreter":
    case "vertreter":
      return "lawyer";
    default:
      return "other";
  }
}
