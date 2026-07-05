/**
 * Fax-Gateway — Outbound/Inbound Fax via Provider API
 * =====================================================
 * Courts/authorities still fax. Outbound via provider API,
 * inbound as inbox source (W2.1).
 */

export type FaxProvider = "sipgate" | "retarus" | "interfax" | "manual";

export type FaxStatus = "queued" | "sent" | "delivered" | "failed" | "received";

export interface FaxTransmission {
  id: string;
  direction: "outbound" | "inbound";
  provider: FaxProvider;
  from_number?: string;
  to_number: string;
  case_slug?: string;
  subject: string;
  pages?: number;
  document_slug?: string;
  status: FaxStatus;
  provider_reference?: string;
  error?: string;
  sent_at?: string;
  delivered_at?: string;
  received_at?: string;
  created_at: string;
  updated_at: string;
}

export interface FaxProviderInterface {
  name: FaxProvider;
  sendFax(input: {
    to: string;
    documentSlug: string;
    caseSlug?: string;
    subject?: string;
  }): Promise<{ reference: string; status: FaxStatus }>;
  checkStatus(reference: string): Promise<{ status: FaxStatus; deliveredAt?: string }>;
}

export function createFaxTransmission(input: {
  direction: "outbound" | "inbound";
  provider?: FaxProvider;
  to_number: string;
  from_number?: string;
  case_slug?: string;
  subject: string;
  document_slug?: string;
}): FaxTransmission {
  const now = new Date().toISOString();
  return {
    id: `fax-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    direction: input.direction,
    provider: input.provider ?? "manual",
    from_number: input.from_number,
    to_number: input.to_number,
    case_slug: input.case_slug,
    subject: input.subject,
    document_slug: input.document_slug,
    status: input.direction === "inbound" ? "received" : "queued",
    received_at: input.direction === "inbound" ? now : undefined,
    created_at: now,
    updated_at: now,
  };
}

export function validateFaxNumber(number: string): boolean {
  const cleaned = number.replace(/[\s\-()]/g, "");
  return /^\+?[1-9]\d{6,14}$/.test(cleaned);
}

export function formatFaxNumber(number: string): string {
  const cleaned = number.replace(/[\s\-()]/g, "");
  if (!cleaned.startsWith("+") && cleaned.startsWith("00")) {
    return "+" + cleaned.slice(2);
  }
  if (!cleaned.startsWith("+") && cleaned.startsWith("0")) {
    return "+49" + cleaned.slice(1);
  }
  return cleaned;
}
