export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId?: string;
  userId?: string;
  userEmail?: string;
  details?: Record<string, unknown>;
  ip?: string;
  hash?: string;
  prev_hash?: string;
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
  | "invoice.e_invoice_generate"
  | "invoice.e_invoice_parse"
  | "invoice.e_invoice_validate"
  | "document.upload"
  | "document.download"
  | "document.delete"
  | "document.presign"
  | "document.confirm"
  | "document.presign_batch"
  | "document.import_from_submission"
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
  | "workflow.approve"
  | "workflow.start"
  | "workflow.update"
  | "workflow.delete"
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
  | "tax.strategy"
  | "tax.risk_analysis"
  | "tax.precedent_search"
  | "tax.appeal_generator"
  | "tax.bfh_feed"
  | "tax.client_letter"
  | "tax.triage"
  | "legal.statute"
  | "legal.playbook"
  | "legal.contradictions"
  | "legal.retrieval_feedback"
  | "legal.translate"
  | "legal.receipt"
  | "legal.obligation_extract"
  | "legal.case_scanner"
  | "legal.precedent_search"
  | "legal.portfolio_insights"
  | "legal.strategy"
  | "legal.research"
  | "legal.schriftsatz"
  | "legal.fristenreport"
  | "legal.subsumption"
  | "legal.ground"
  | "settings.update"
  | "settings.jurisdiction"
  | "billing.upgrade"
  | "billing.credit_purchase"
  | "billing.credit_consumption"
  | "billing.credit_refund"
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
  | "admin.data_delete"
  | "admin.data_export"
  | "admin.audit_export"
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
  | "litigation.step_update"
  | "legal.commentary_synthesize"
  | "share.receive"
  | "intake.scan_upload"
  | "intake.convert"
  | "inbox.mark_read"
  | "triage.action"
  | "bea.send"
  | "bea.retry"
  | "autopilot.run"
  | "system.alert"
  | "system.integrity_check"
  | "rciid.case_submitted"
  | "rciid.webhook_received"
  | "rciid.status_updated"
  | "rciid.report_downloaded"
  | "rciid.billing_auto"
  | "rciid.wallet_detected"
  | "rciid.case_scanned"
  | "rciid.quality_feedback"
  | "rciid.suggestion_accepted"
  | "submission.review"
  | "ai.injection_detected"
  | "ai.injection_blocked"
  | "ai.reasoning_trace"
  | "ai.webhook_escalate"
  | "ai.webhook_block"
  | "verification.policy_allowed"
  | "verification.policy_denied"
  | "verification.override_granted"
  | "verification.receipt_invalidated";

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
  "invoice.e_invoice_generate": "E-Rechnung generiert",
  "invoice.e_invoice_parse": "E-Rechnung importiert",
  "invoice.e_invoice_validate": "E-Rechnung validiert",
  "document.upload": "Dokument hochgeladen",
  "document.download": "Dokument heruntergeladen",
  "document.delete": "Dokument gelöscht",
  "document.presign": "Upload vorbereitet (Presigned URL)",
  "document.confirm": "Upload bestätigt und verarbeitet",
  "document.presign_batch": "Batch-Upload vorbereitet",
  "document.import_from_submission": "Dokument aus Mandanten-Einreichung importiert",
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
  "legal.receipt": "Verification Receipt",
  "legal.obligation_extract": "Verpflichtungen extrahiert",
  "legal.case_scanner": "Case Scanner",
  "legal.precedent_search": "Präzedenzfall-Suche",
  "legal.portfolio_insights": "Portfolio-Analytics",
  "legal.research": "Deep Research gestartet",
  "legal.schriftsatz": "Schriftsatz generiert",
  "legal.fristenreport": "Fristenreport generiert",
  "legal.subsumption": "Interaktive Subsumtion",
  "legal.ground": "Citation Grounding",
  "settings.update": "Einstellungen geändert",
  "settings.jurisdiction": "Rechtsraum geändert",
  "billing.upgrade": "Plan geändert",
  "billing.credit_purchase": "Credits gekauft",
  "billing.credit_consumption": "Credits verbraucht",
  "billing.credit_refund": "Credits erstattet",
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
  "admin.data_delete": "Admin: Benutzerdaten gelöscht",
  "admin.data_export": "Admin: Benutzerdaten exportiert",
  "admin.audit_export": "Admin: Audit-Log exportiert",
  "dms.push": "Dokument an DMS gepusht",
  "space.update": "Shared Space aktualisiert",
  "space.delete": "Shared Space gelöscht",
  "whatsapp.document_to_space": "WhatsApp-Dokument zugeordnet",
  "litigation.create": "Verfahren angelegt",
  "litigation.update": "Verfahren aktualisiert",
  "litigation.delete": "Verfahren gelöscht",
  "rciid.case_submitted": "RCIID Krypto-Forensik übermittelt",
  "rciid.webhook_received": "RCIID Webhook empfangen",
  "rciid.status_updated": "RCIID Status aktualisiert",
  "rciid.report_downloaded": "RCIID Bericht heruntergeladen",
  "rciid.billing_auto": "RCIID Forensik automatisch abgerechnet",
  "rciid.wallet_detected": "Krypto-Wallet in Fall erkannt",
  "rciid.case_scanned": "Fall nach Krypto-Adressen gescannt",
  "rciid.quality_feedback": "RCIID Datenqualitäts-Feedback empfangen",
  "rciid.suggestion_accepted": "Krypto-Forensik-Vorschlag akzeptiert",
  "litigation.phase_advance": "Phase gewechselt",
  "litigation.step_update": "Schritt aktualisiert",
  "legal.commentary_synthesize": "Kommentierung synthetisiert",
  "share.receive": "Geteilte Inhalte empfangen",
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
  "tax.strategy": "Steuerstrategie generiert",
  "tax.risk_analysis": "Steuer-Risikoanalyse",
  "tax.precedent_search": "Steuerrechtsprechung-Recherche",
  "tax.appeal_generator": "Einspruchsgenerator",
  "tax.bfh_feed": "BFH-Rechtsprechung-Feed",
  "tax.client_letter": "Mandantenbrief generiert",
  "tax.triage": "Steuer-Triage klassifiziert",
  "inbox.mark_read": "Nachricht als gelesen markiert",
  "triage.action": "Triage-Aktion ausgeführt",
  "submission.review": "Mandanteneingang geprüft",
  "bea.send": "beA-Versand gestartet",
  "bea.retry": "beA-Versand Retry",
  "system.alert": "System-Warnung",
  "system.integrity_check": "Integritätsprüfung (GoBD)",
  "ai.injection_detected": "AI Prompt-Injection erkannt",
  "ai.injection_blocked": "AI Prompt-Injection blockiert",
  "ai.reasoning_trace": "AI Reasoning Trace erstellt",
  "ai.webhook_escalate": "AI Webhook Escalation gesendet",
  "ai.webhook_block": "AI Webhook Block-Event gesendet",
  "verification.policy_allowed": "Verifikations-Policy: Aktion erlaubt",
  "verification.policy_denied": "Verifikations-Policy: Aktion verweigert",
  "verification.override_granted": "Verifikations-Policy: Anwaltlicher Override erteilt",
  "verification.receipt_invalidated": "Verifikations-Policy: Receipt invalidiert (Inhaltsänderung)",
};

export function auditLabel(action: string): string {
  return ACTION_LABELS[action] || action;
}
