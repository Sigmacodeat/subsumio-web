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
  | "document.presign"
  | "document.confirm"
  | "document.presign_batch"
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
  | "tax.stbvv"
  | "tax.elster_submit"
  | "tax.analyze"
  | "tax.summarize"
  | "tax.return_create"
  | "tax.return_update"
  | "tax.return_delete"
  | "tax.assessment_create"
  | "tax.assessment_update"
  | "tax.assessment_delete"
  | "tax.audit_create"
  | "tax.audit_update"
  | "tax.audit_delete"
  | "tax.client_create"
  | "tax.client_update"
  | "tax.client_delete"
  | "legal.statute"
  | "legal.playbook"
  | "legal.contradictions"
  | "legal.retrieval_feedback"
  | "legal.translate"
  | "legal.obligation_extract"
  | "legal.case_scanner"
  | "legal.precedent_search"
  | "legal.portfolio_insights"
  | "legal.strategy"
  | "legal.research"
  | "legal.ground"
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
  | "whatsapp.flow_case_created"
  | "whatsapp.flow_appointment_booked"
  | "feedback.submit"
  | "time.auto_extract"
  | "admin.user_update"
  | "admin.user_deactivate"
  | "acl.add_member"
  | "acl.remove_member"
  | "acl.delete_group"
  | "acl.set_permission"
  | "acl.remove_permission"
  | "dms.push"
  | "space.update"
  | "email.send"
  | "docusign.send"
  | "space.delete"
  | "whatsapp.document_to_space"
  | "litigation.create"
  | "litigation.update"
  | "litigation.delete"
  | "litigation.phase_advance"
  | "litigation.step_update";

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
  "document.presign": "Upload vorbereitet (Presigned URL)",
  "document.confirm": "Upload bestätigt und verarbeitet",
  "document.presign_batch": "Batch-Upload vorbereitet",
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
  "legal.contradictions": "Widerspruchsprüfung",
  "legal.retrieval_feedback": "Retrieval-Feedback",
  "legal.strategy": "Strategie generiert",
  "legal.translate": "Übersetzung",
  "legal.obligation_extract": "Verpflichtungen extrahiert",
  "legal.case_scanner": "Case Scanner",
  "legal.precedent_search": "Präzedenzfall-Suche",
  "legal.portfolio_insights": "Portfolio-Analytics",
  "legal.research": "Deep Research gestartet",
  "legal.ground": "Citation Grounding",
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
  "whatsapp.flow_case_created": "WhatsApp-Flow: Akte angelegt",
  "whatsapp.flow_appointment_booked": "WhatsApp-Flow: Termin gebucht",
  "time.auto_extract": "KI-Zeiterfassung generiert",
  "feedback.submit": "Retrieval-Feedback",
  "admin.user_update": "Admin: Benutzer aktualisiert",
  "admin.user_deactivate": "Admin: Benutzer deaktiviert",
  "dms.push": "Dokument an DMS gepusht",
  "space.update": "Shared Space aktualisiert",
  "space.delete": "Shared Space gelöscht",
  "whatsapp.document_to_space": "WhatsApp-Dokument zugeordnet",
  "litigation.create": "Verfahren angelegt",
  "litigation.update": "Verfahren aktualisiert",
  "litigation.delete": "Verfahren gelöscht",
  "litigation.phase_advance": "Phase gewechselt",
  "litigation.step_update": "Schritt aktualisiert",
  "tax.stbvv": "StBVV-Gebührenberechnung",
  "tax.elster_submit": "ELSTER-Übermittlung",
  "tax.analyze": "Steuerdokument-Analyse",
  "tax.summarize": "Steuerdokument-Zusammenfassung",
  "tax.return_create": "Steuererklärung angelegt",
  "tax.return_update": "Steuererklärung aktualisiert",
  "tax.return_delete": "Steuererklärung gelöscht",
  "tax.assessment_create": "Steuerbescheid angelegt",
  "tax.assessment_update": "Steuerbescheid aktualisiert",
  "tax.assessment_delete": "Steuerbescheid gelöscht",
  "tax.audit_create": "Betriebsprüfung angelegt",
  "tax.audit_update": "Betriebsprüfung aktualisiert",
  "tax.audit_delete": "Betriebsprüfung gelöscht",
  "tax.client_create": "Steuermandant angelegt",
  "tax.client_update": "Steuermandant aktualisiert",
  "tax.client_delete": "Steuermandant gelöscht",
};

export function auditLabel(action: string): string {
  return ACTION_LABELS[action] || action;
}
