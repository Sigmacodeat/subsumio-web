/**
 * Vollmachten-Verwaltung
 * =======================
 * Power of attorney as document type with scope + expiry.
 * Templates, e-signature via DocuSign, expiry reminders.
 */

export type PowerOfAttorneyType = "general" | "litigation" | "transactional" | "limited" | "post";

export type PoAStatus = "draft" | "sent" | "signed" | "expired" | "revoked";

export interface PowerOfAttorney {
  id: string;
  case_slug: string;
  client_name: string;
  client_email?: string;
  type: PowerOfAttorneyType;
  scope: string;
  granted_at?: string;
  expires_at?: string;
  status: PoAStatus;
  docusign_envelope_id?: string;
  document_slug?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export function createPowerOfAttorney(input: {
  case_slug: string;
  client_name: string;
  client_email?: string;
  type: PowerOfAttorneyType;
  scope: string;
  expires_at?: string;
  notes?: string;
}): PowerOfAttorney {
  const now = new Date().toISOString();
  return {
    id: `poa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    case_slug: input.case_slug,
    client_name: input.client_name,
    client_email: input.client_email,
    type: input.type,
    scope: input.scope,
    expires_at: input.expires_at,
    status: "draft",
    created_at: now,
    updated_at: now,
    notes: input.notes,
  };
}

export function isPoAValid(poa: PowerOfAttorney, date?: Date): boolean {
  const now = date ?? new Date();
  if (poa.status !== "signed") return false;
  if (poa.expires_at && new Date(poa.expires_at) < now) return false;
  return true;
}

export function getExpiringPoAs(
  poas: PowerOfAttorney[],
  daysAhead: number,
  date?: Date
): PowerOfAttorney[] {
  const now = date ?? new Date();
  const cutoff = new Date(now.getTime() + daysAhead * 86400000);
  return poas.filter((p) => {
    if (p.status !== "signed" || !p.expires_at) return false;
    const expiry = new Date(p.expires_at);
    return expiry > now && expiry <= cutoff;
  });
}

export const POA_TYPE_LABELS: Record<PowerOfAttorneyType, { de: string; en: string }> = {
  general: { de: "Generalvollmacht", en: "General Power of Attorney" },
  litigation: { de: "Prozessvollmacht", en: "Litigation Power of Attorney" },
  transactional: { de: "Geschäftsvollmacht", en: "Transactional Power of Attorney" },
  limited: { de: "Einzelfallvollmacht", en: "Limited Power of Attorney" },
  post: { de: "Postvollmacht", en: "Postal Power of Attorney" },
};

export const POA_STATUS_LABELS: Record<PoAStatus, { de: string; en: string }> = {
  draft: { de: "Entwurf", en: "Draft" },
  sent: { de: "Versendet", en: "Sent" },
  signed: { de: "Unterzeichnet", en: "Signed" },
  expired: { de: "Abgelaufen", en: "Expired" },
  revoked: { de: "Widerrufen", en: "Revoked" },
};
