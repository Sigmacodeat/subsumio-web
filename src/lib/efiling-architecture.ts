/**
 * beA/ERV/eFiling Architecture — P1-EFILE-001 + P1-EFILE-002
 * ============================================================
 * Architekturentscheidung und Filing Package Datenmodell für
 * elektronischen Rechtsverkehr (beA, ERV, eFiling).
 *
 * P1-EFILE-001: Architekturentscheidung
 *   - 3 Optionen bewertet: direkter Versand, Partneradapter, validierter Export
 *   - Empfehlung: Partneradapter (Middleware) mit Fallback auf validierten Export
 *   - Trust-Boundary, Security, Audit-Anforderungen
 *
 * P1-EFILE-002: Filing Package Datenmodell
 *   - FilingPackage mit Approval, Receipt, Fristkopplung, Audit
 *   - FilingDocument mit Signatur-Status, Checksum
 *   - FilingReceipt mit Bestätigung, Fehler-Handling
 */

// ── P1-EFILE-001: Architecture Decision ───────────────────────────────

export type FilingChannel = "beA" | "ERV" | "eFiling" | "export";
export type ArchitectureOption = "direct_send" | "partner_adapter" | "validated_export";

export interface ArchitectureOptionDetails {
  option: ArchitectureOption;
  title: string;
  description: string;
  pros: string[];
  cons: string[];
  effort: "low" | "medium" | "high";
  risk: "low" | "medium" | "high";
  time_to_market: "weeks" | "months" | "quarters";
  requires_certification: boolean;
  requires_vpn: boolean;
  requires_special_hardware: boolean;
}

export const ARCHITECTURE_OPTIONS: Record<ArchitectureOption, ArchitectureOptionDetails> = {
  direct_send: {
    option: "direct_send",
    title: "Direkter Versand (beA-Client)",
    description: "Direkte Integration des beA-Protokolls in die Subsumio-Backend-Infrastruktur mit eigenem Zertifikat und VPN-Tunnel.",
    pros: [
      "Volle Kontrolle über Sendeprozess",
      "Keine Abhängigkeit von Drittanbietern",
      "Geringe laufende Kosten",
    ],
    cons: [
      "Erfordert beA-Zertifikat pro Kanzlei",
      "VPN-Tunnel zum beA-Server nötig",
      "Hohe Implementierungskomplexität",
      "Regelmäßige Protokoll-Updates erforderlich",
      "Haftung bei Protokollfehlern",
    ],
    effort: "high",
    risk: "high",
    time_to_market: "quarters",
    requires_certification: true,
    requires_vpn: true,
    requires_special_hardware: false,
  },
  partner_adapter: {
    option: "partner_adapter",
    title: "Partneradapter (Middleware)",
    description: "Integration über zertifizierten Middleware-Anbieter (z.B. Xjustiz, e-Government-Portal) der das beA-Protokoll kapselt.",
    pros: [
      "Schnellste Time-to-Market",
      "Kein eigenes beA-Zertifikat nötig",
      "Kein VPN-Tunnel erforderlich",
      "Middleware übernimmt Protokoll-Updates",
      "Geringes Implementierungsrisiko",
      "Multi-Channel (beA + ERV + eFiling) über ein API",
    ],
    cons: [
      "Laufende Lizenzkosten pro Versand",
      "Abhängigkeit vom Middleware-Anbieter",
      "Latenz durch zusätzlichen Hop",
    ],
    effort: "low",
    risk: "low",
    time_to_market: "weeks",
    requires_certification: false,
    requires_vpn: false,
    requires_special_hardware: false,
  },
  validated_export: {
    option: "validated_export",
    title: "Validierter Export (PDF/XML-Package)",
    description: "Generierung eines validierten Filing-Packages (PDF/A + XML-Metadaten) zum manuellen Upload im beA-Portal.",
    pros: [
      "Geringste Komplexität",
      "Keine Zertifikate oder VPN nötig",
      "Volle Kontrolle über Daten",
      "Kann als Fallback dienen",
    ],
    cons: [
      "Kein automatisierter Versand",
      "Manueller Aufwand pro Filing",
      "Keine automatische Empfangsbestätigung",
      "Fristwahrung riskanter (manueller Schritt)",
    ],
    effort: "low",
    risk: "medium",
    time_to_market: "weeks",
    requires_certification: false,
    requires_vpn: false,
    requires_special_hardware: false,
  },
};

export const RECOMMENDED_OPTION: ArchitectureOption = "partner_adapter";

export interface ArchitectureDecision {
  recommended: ArchitectureOption;
  fallback: ArchitectureOption;
  rationale: string;
  decided_at: string;
  decided_by: string;
  trust_boundary: string;
  security_requirements: string[];
  audit_requirements: string[];
}

export const ARCHITECTURE_DECISION: ArchitectureDecision = {
  recommended: "partner_adapter",
  fallback: "validated_export",
  rationale:
    "Partneradapter bietet die beste Balance aus Time-to-Market, Risiko und Funktionsumfang. " +
    "Validierter Export als Fallback für Ausfälle oder Kanzleien ohne Middleware-Vertrag.",
  decided_at: new Date().toISOString(),
  decided_by: "architecture-review",
  trust_boundary:
    "Middleware-Anbieter ist trusted third party. Subsumio sendet validiertes Package an Middleware-API, " +
    "Middleware übernimmt beA-Protokoll, Signatur und Versand. Empfangsbestätigung wird zurückgemeldet.",
  security_requirements: [
    "TLS 1.2+ für alle Verbindungen zur Middleware",
    "API-Key-Authentifizierung pro Kanzlei",
    "Audit-Log für jeden Filing-Versuch",
    "PII-Verschlüsselung at-rest für Filing-Packages",
    "DSGVO-konforme Datenverarbeitung (AVV mit Middleware)",
    "Privilege-Check vor Versand (Ethical Wall)",
  ],
  audit_requirements: [
    "Jeder Filing-Versuch wird mit Timestamp, User, Case, DocumentIDs geloggt",
    "Empfangsbestätigung (Receipt) wird persistiert",
    "Fehlgeschlagene Filings werden mit Fehlercode und Retry-Status geloggt",
    "Fristkopplung: Filing ist mit Frist verknüpft, Status-Änderungen trigger Notifications",
  ],
};

// ── P1-EFILE-002: Filing Package Data Model ───────────────────────────

export type FilingStatus =
  | "draft"           // In Erstellung
  | "pending_approval" // Wartet auf Freigabe
  | "approved"        // Freigegeben
  | "sending"         // Wird gesendet
  | "sent"            // Erfolgreich gesendet
  | "failed"          // Senden fehlgeschlagen
  | "retrying"        // Retry läuft
  | "cancelled";      // Abgebrochen

export type FilingPriority = "normal" | "urgent" | "fristgebunden";

export type SignatureStatus = "unsigned" | "pending" | "signed" | "failed";

export interface FilingDocument {
  id: string;
  title: string;
  file_path: string;
  file_hash: string;
  mime_type: string;
  size_bytes: number;
  signature_status: SignatureStatus;
  signature_signed_by?: string;
  signature_signed_at?: string;
  is_main_document: boolean;
  is_attachment: boolean;
  sort_order: number;
}

export interface FilingReceipt {
  receipt_id: string;
  received_at: string;
  received_by: string;
  confirmation_code: string;
  raw_response?: string;
  error_code?: string;
  error_message?: string;
  is_success: boolean;
}

export interface FilingPackage {
  id: string;
  case_slug: string;
  brain_id: string;
  org_id: string;
  channel: FilingChannel;
  status: FilingStatus;
  priority: FilingPriority;
  /** Verfahrensnummer beim Gericht */
  court_case_number?: string;
  /** Gericht (Aktenzeichen) */
  court?: string;
  /** Dokumente im Package */
  documents: FilingDocument[];
  /** Empfangsbestätigungen */
  receipts: FilingReceipt[];
  /** Verknüpfte Frist */
  deadline_id?: string;
  deadline_date?: string;
  /** Freigabe */
  approved_by?: string;
  approved_at?: string;
  /** Sender */
  created_by: string;
  created_at: string;
  updated_at: string;
  sent_at?: string;
  /** Retry-Info */
  retry_count: number;
  max_retries: number;
  last_error?: string;
  /** Middleware-Referenz */
  middleware_reference?: string;
  /** Audit-Trail */
  audit_entries: FilingAuditEntry[];
}

export interface FilingAuditEntry {
  timestamp: string;
  actor: string;
  action: string;
  details?: string;
  previous_status?: FilingStatus;
  new_status?: FilingStatus;
}

// ── Factory ───────────────────────────────────────────────────────────

export function createFilingPackage(params: {
  case_slug: string;
  brain_id: string;
  org_id: string;
  channel: FilingChannel;
  priority?: FilingPriority;
  court?: string;
  court_case_number?: string;
  deadline_id?: string;
  deadline_date?: string;
  created_by: string;
}): FilingPackage {
  const now = new Date().toISOString();
  return {
    id: `filing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    case_slug: params.case_slug,
    brain_id: params.brain_id,
    org_id: params.org_id,
    channel: params.channel,
    status: "draft",
    priority: params.priority ?? "normal",
    court: params.court,
    court_case_number: params.court_case_number,
    documents: [],
    receipts: [],
    deadline_id: params.deadline_id,
    deadline_date: params.deadline_date,
    created_by: params.created_by,
    created_at: now,
    updated_at: now,
    retry_count: 0,
    max_retries: 3,
    audit_entries: [
      {
        timestamp: now,
        actor: params.created_by,
        action: "created",
        new_status: "draft",
      },
    ],
  };
}

export function createFilingDocument(params: {
  title: string;
  file_path: string;
  file_hash: string;
  mime_type: string;
  size_bytes: number;
  is_main_document?: boolean;
  sort_order?: number;
}): FilingDocument {
  return {
    id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: params.title,
    file_path: params.file_path,
    file_hash: params.file_hash,
    mime_type: params.mime_type,
    size_bytes: params.size_bytes,
    signature_status: "unsigned",
    is_main_document: params.is_main_document ?? false,
    is_attachment: !params.is_main_document,
    sort_order: params.sort_order ?? 0,
  };
}

// ── State Transitions ─────────────────────────────────────────────────

export function addAuditEntry(
  pkg: FilingPackage,
  actor: string,
  action: string,
  details?: string,
  previousStatus?: FilingStatus,
  newStatus?: FilingStatus,
): FilingPackage {
  return {
    ...pkg,
    updated_at: new Date().toISOString(),
    audit_entries: [
      ...pkg.audit_entries,
      {
        timestamp: new Date().toISOString(),
        actor,
        action,
        details,
        previous_status: previousStatus,
        new_status: newStatus,
      },
    ],
  };
}

export function submitForApproval(pkg: FilingPackage, actor: string): FilingPackage {
  const updated = addAuditEntry(pkg, actor, "submit_for_approval", undefined, pkg.status, "pending_approval");
  return { ...updated, status: "pending_approval" };
}

export function approveFiling(pkg: FilingPackage, actor: string): FilingPackage {
  const updated = addAuditEntry(pkg, actor, "approve", undefined, pkg.status, "approved");
  return {
    ...updated,
    status: "approved",
    approved_by: actor,
    approved_at: new Date().toISOString(),
  };
}

export function sendFiling(pkg: FilingPackage, middlewareReference: string): FilingPackage {
  const updated = addAuditEntry(pkg, "system", "send", `middleware_ref: ${middlewareReference}`, pkg.status, "sending");
  return {
    ...updated,
    status: "sending",
    middleware_reference: middlewareReference,
    sent_at: new Date().toISOString(),
  };
}

export function confirmReceipt(pkg: FilingPackage, receipt: FilingReceipt): FilingPackage {
  const newStatus: FilingStatus = receipt.is_success ? "sent" : "failed";
  const updated = addAuditEntry(
    pkg,
    "system",
    "receipt",
    `code: ${receipt.confirmation_code}, success: ${receipt.is_success}`,
    pkg.status,
    newStatus,
  );
  return {
    ...updated,
    status: newStatus,
    receipts: [...pkg.receipts, receipt],
  };
}

export function retryFiling(pkg: FilingPackage): FilingPackage | null {
  if (pkg.retry_count >= pkg.max_retries) return null;
  const updated = addAuditEntry(pkg, "system", "retry", `attempt ${pkg.retry_count + 1}`, pkg.status, "retrying");
  return {
    ...updated,
    status: "retrying",
    retry_count: pkg.retry_count + 1,
  };
}

export function cancelFiling(pkg: FilingPackage, actor: string, reason: string): FilingPackage {
  const updated = addAuditEntry(pkg, actor, "cancel", reason, pkg.status, "cancelled");
  return { ...updated, status: "cancelled" };
}

// ── Validation ────────────────────────────────────────────────────────

export interface FilingValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateFilingPackage(pkg: FilingPackage): FilingValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!pkg.id) errors.push("ID is required");
  if (!pkg.case_slug) errors.push("case_slug is required");
  if (!pkg.brain_id) errors.push("brain_id is required");
  if (!pkg.org_id) errors.push("org_id is required");
  if (!pkg.created_by) errors.push("created_by is required");

  if (pkg.documents.length === 0) {
    errors.push("At least one document is required");
  }

  const mainDocs = pkg.documents.filter((d) => d.is_main_document);
  if (mainDocs.length === 0) {
    errors.push("At least one main document is required");
  }
  if (mainDocs.length > 1) {
    warnings.push("Multiple main documents — consider splitting into separate filings");
  }

  if (pkg.priority === "fristgebunden" && !pkg.deadline_date) {
    errors.push("Fristgebunden filing must have a deadline_date");
  }

  if (pkg.status === "approved" && !pkg.approved_by) {
    errors.push("Approved filing must have approved_by");
  }

  if (pkg.status === "sent" && pkg.receipts.length === 0) {
    errors.push("Sent filing must have at least one receipt");
  }

  if (pkg.channel === "beA" && !pkg.court) {
    warnings.push("beA filing should specify a court");
  }

  for (const doc of pkg.documents) {
    if (doc.signature_status === "unsigned" && doc.is_main_document) {
      warnings.push(`Main document "${doc.title}" is unsigned`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Helpers ───────────────────────────────────────────────────────────

export function getFilingStatusLabel(status: FilingStatus): string {
  const labels: Record<FilingStatus, string> = {
    draft: "Entwurf",
    pending_approval: "Wartet auf Freigabe",
    approved: "Freigegeben",
    sending: "Wird gesendet",
    sent: "Gesendet",
    failed: "Fehlgeschlagen",
    retrying: "Retry läuft",
    cancelled: "Abgebrochen",
  };
  return labels[status];
}

export function getChannelLabel(channel: FilingChannel): string {
  const labels: Record<FilingChannel, string> = {
    beA: "beA (besonderes elektronisches Anwaltspostfach)",
    ERV: "ERV (Elektronischer Rechtsverkehr)",
    eFiling: "eFiling (Gerichtliches elektronisches Filing)",
    export: "Export (PDF/XML-Package)",
  };
  return labels[channel];
}

export function isTerminalStatus(status: FilingStatus): boolean {
  return status === "sent" || status === "cancelled";
}

export function canRetry(pkg: FilingPackage): boolean {
  return pkg.status === "failed" && pkg.retry_count < pkg.max_retries;
}

export function getFilingDocumentsByType(pkg: FilingPackage, isMain: boolean): FilingDocument[] {
  return pkg.documents.filter((d) => d.is_main_document === isMain);
}
