export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  userId?: string;
  userEmail?: string;
  details?: Record<string, unknown>;
  ip?: string;
  timestamp: string;
}

export type AuditAction =
  | "user.login"
  | "user.logout"
  | "user.signup"
  | "case.create"
  | "case.update"
  | "case.delete"
  | "case.restore"
  | "case.view"
  | "invoice.create"
  | "invoice.update"
  | "invoice.delete"
  | "invoice.send"
  | "invoice.remind"
  | "document.upload"
  | "document.download"
  | "document.delete"
  | "deadline.create"
  | "deadline.update"
  | "deadline.delete"
  | "evidence.create"
  | "evidence.update"
  | "evidence.delete"
  | "drafting.generate"
  | "drafting.export"
  | "conflict.check"
  | "judgements.search"
  | "legal.contract_draft"
  | "legal.document_review"
  | "legal.deep_analysis"
  | "legal.due_diligence"
  | "legal.risk_analysis"
  | "legal.memo"
  | "legal.redline"
  | "legal.anonymize"
  | "legal.tabular"
  | "legal.judgements_sync"
  | "legal.ai_deadlines"
  | "legal.rvg"
  | "legal.statute"
  | "legal.playbook"
  | "settings.update"
  | "billing.upgrade"
  | "onboarding.complete"
  | "team.invite"
  | "team.remove"
  | "team.role_change"
  | "connector.add"
  | "connector.remove"
  | "connector.sync"
  | "scim.user_provisioned"
  | "scim.user_deprovisioned"
  | "scim.user_updated"
  | "scim.group_synced"
  | "scim.sync_manual"
  | "query.submit"
  | "data.export"
  | "data.delete"
  | "legal.sources_list"
  | "legal.sources_refresh"
  | "whatsapp.identity_created"
  | "whatsapp.identity_updated"
  | "whatsapp.identity_revoked"
  | "whatsapp.sender_denied"
  | "whatsapp.consent_granted"
  | "whatsapp.consent_revoked"
  | "whatsapp.outbound_sent"
  | "whatsapp.outbound_blocked"
  | "whatsapp.briefing_feedback"
  | "feedback.submit"
  | "time.auto_extract";

const ACTION_LABELS: Record<string, string> = {
  "user.login": "Login",
  "user.logout": "Logout",
  "user.signup": "Registrierung",
  "case.create": "Akte angelegt",
  "case.update": "Akte aktualisiert",
  "case.delete": "Akte archiviert",
  "case.restore": "Akte wiederhergestellt",
  "case.view": "Akte geöffnet",
  "invoice.create": "Rechnung erstellt",
  "invoice.update": "Rechnung aktualisiert",
  "invoice.delete": "Rechnung gelöscht",
  "invoice.send": "Rechnung versendet",
  "invoice.remind": "Zahlungserinnerung",
  "document.upload": "Dokument hochgeladen",
  "document.download": "Dokument heruntergeladen",
  "document.delete": "Dokument gelöscht",
  "deadline.create": "Frist erstellt",
  "deadline.update": "Frist aktualisiert",
  "deadline.delete": "Frist gelöscht",
  "evidence.create": "Beweismittel erstellt",
  "evidence.update": "Beweismittel aktualisiert",
  "evidence.delete": "Beweismittel gelöscht",
  "drafting.generate": "Schriftsatz generiert",
  "drafting.export": "Schriftsatz exportiert",
  "conflict.check": "Kollisionsprüfung",
  "judgements.search": "Rechtsprechung gesucht",
  "legal.playbook": "Playbook geändert",
  "legal.tabular": "Tabellarische Prüfung",
  "legal.statute": "Gesetzessuche",
  "settings.update": "Einstellungen geändert",
  "billing.upgrade": "Plan geändert",
  "onboarding.complete": "Onboarding abgeschlossen",
  "team.invite": "Team-Einladung",
  "team.remove": "Team-Mitglied entfernt",
  "connector.add": "Konnektor hinzugefügt",
  "connector.remove": "Konnektor entfernt",
  "connector.sync": "Konnektor synchronisiert",
  "scim.user_provisioned": "SCIM: User provisioniert",
  "scim.user_deprovisioned": "SCIM: User deaktiviert",
  "scim.user_updated": "SCIM: User aktualisiert",
  "scim.group_synced": "SCIM: Gruppe synchronisiert",
  "scim.sync_manual": "SCIM: Manuelle Synchronisation",
  "query.submit": "KI-Query",
  "data.export": "Datenexport (DSGVO)",
  "data.delete": "Datenlöschung (DSGVO)",
  "legal.sources_list": "Quellen-Registry abgefragt",
  "legal.sources_refresh": "Quelle synchronisiert",
  "whatsapp.identity_created": "WhatsApp-Identität angelegt",
  "whatsapp.identity_updated": "WhatsApp-Identität aktualisiert",
  "whatsapp.identity_revoked": "WhatsApp-Identität widerrufen",
  "whatsapp.sender_denied": "WhatsApp-Absender abgewiesen",
  "whatsapp.consent_granted": "WhatsApp-Einwilligung erteilt",
  "whatsapp.consent_revoked": "WhatsApp-Einwilligung widerrufen",
  "whatsapp.outbound_sent": "WhatsApp proaktiv gesendet",
  "whatsapp.outbound_blocked": "WhatsApp-Versand geblockt",
  "whatsapp.briefing_feedback": "WhatsApp-Briefing-Feedback",
  "time.auto_extract": "KI-Zeiterfassung generiert",
  "feedback.submit": "Retrieval-Feedback",
};

export function auditLabel(action: string): string {
  return ACTION_LABELS[action] || action;
}
