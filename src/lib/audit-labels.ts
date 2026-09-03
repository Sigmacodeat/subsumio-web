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
  | "document.retry"
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
  | "legal.eval_fixture_review"
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
  | "onboarding.progress"
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
  | "admin.backup"
  | "admin.dr"
  | "admin.feature_flag"
  | "admin.feedback_triage"
  | "admin.fine_tuning_gate"
  | "admin.ip_allowlist"
  | "admin.model_vetting"
  | "admin.regression_mining"
  | "admin.backfill_doc_type"
  | "admin.corpus_pipeline"
  | "admin.chunk_edit"
  | "admin.chunk_delete"
  | "admin.chunk_reembed"
  | "admin.chunk_flag"
  | "admin.chunk_clear_flag"
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
  | "verification.receipt_invalidated"
  | "signature.capture"
  | "poa.generate_pdf"
  | "admin.settlement_retry"
  | "billing.budget_alert"
  | "legal.berufungsgruende"
  | "legal.opponent_simulation"
  | "legal.reorder_gruende"
  | "workflow.advance"
  | "legal.pipeline_trigger"
  | "org.join"
  | "gdpr.data_deletion"
  | "absence.create"
  | "booking.create"
  | "corpus.file_create"
  | "corpus.file_delete"
  | "backup.restore"
  | "backup.delete"
  | "corpus_files.restore"
  | "corpus_files.bulk_edit"
  | "corpus_files.publish"
  | "corpus_files.flag"
  | "corpus_files.build_index"
  | "corpus_files.validate_schema"
  | "corpus_alerts.mark_read"
  | "corpus_command_center.trigger_delta"
  | "acl.group_create"
  | "docusign.disconnect"
  | "copilot.explain"
  | "copilot.memory_create"
  | "copilot.memory_update"
  | "copilot.memory_delete"
  | "copilot.plan_create"
  | "copilot.plan_update"
  | "copilot.plan_abandon"
  | "copilot.notification_dismiss"
  | "copilot.draft_review"
  | "copilot.draft_issue_update"
  | "legal.clause_annotation"
  | "legal.clause_annotation_review"
  | "connector.configure"
  | "connector.toggle"
  | "experience.profile_update"
  | "dashboard.briefing"
  | "presence.update"
  | "security.2fa_qrcode"
  | "agent.supervisor_run"
  | "agent.control"
  | "triage.classify"
  | "act_import.create"
  | "act_import.refresh"
  | "act_import.finalize"
  | "act_import.item_upsert"
  | "time_tracking.start"
  | "time_tracking.stop"
  | "time_tracking.heartbeat"
  | "time_tracking.passive_preference"
  | "legal.knowledge_sources"
  | "legal.chronology_build"
  | "pages.batch_read"
  | "pages.batch_list"
  | "autopilot.policy_create"
  | "autopilot.policy_list"
  | "autopilot.policy_update"
  | "upload.token_issued"
  | "email.import"
  | "notifications.list"
  | "notifications.mark_read"
  | "notifications.mark_all_read"
  | "notifications.deadline_create"
  | "notifications.deadline_batch_create"
  | "notifications.delete"
  | "legal.judgements_import"
  | "legal.batch_pipeline"
  | "legal.permissions_check"
  | "legal.batch_edit"
  | "legal.writing_style_save"
  | "legal.writing_style_delete"
  | "legal.frist_compute"
  | "legal.wiedervorlage_create"
  | "legal.eval_gate"
  | "review_table.ask"
  | "email.messages_list"
  | "email.message_send"
  | "email.reply"
  | "email.message_detail"
  | "email.message_update"
  | "billing.seats_list"
  | "billing.seats_change"
  | "billing.proration_preview"
  | "billing.plan_change"
  | "claim.create"
  | "claim.list"
  | "claim.payment_allocate"
  | "human_review.submit"
  | "human_review.summary"
  | "legal.case_investigation"
  | "legal.case_investigation_review";

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
  "document.retry": "Dokument-Retry gestartet",
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
  "legal.eval_fixture_review": "Eval-Fixture-Review",
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
  "onboarding.progress": "Onboarding-Fortschritt aktualisiert",
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
  "admin.backup": "Admin: Backup erstellt/wiederhergestellt",
  "admin.dr": "Admin: Disaster Recovery",
  "admin.feature_flag": "Admin: Feature-Flag geändert",
  "admin.feedback_triage": "Admin: Feedback triagiert",
  "admin.fine_tuning_gate": "Admin: Fine-Tuning Gate",
  "admin.ip_allowlist": "Admin: IP-Allowlist geändert",
  "admin.model_vetting": "Admin: Modell geprüft/befördert",
  "admin.regression_mining": "Admin: Regression-Mining",
  "admin.backfill_doc_type": "Admin: Doc-Type Backfill",
  "admin.corpus_pipeline": "Admin: Corpus-Pipeline gesteuert",
  "admin.chunk_edit": "Admin: Chunk bearbeitet",
  "admin.chunk_delete": "Admin: Chunk gelöscht",
  "admin.chunk_reembed": "Admin: Chunk Re-Embed angestoßen",
  "admin.chunk_flag": "Admin: Chunk markiert",
  "admin.chunk_clear_flag": "Admin: Chunk-Markierung entfernt",
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
  "signature.capture": "Signatur erfasst",
  "poa.generate_pdf": "Vollmacht-PDF generiert",
  "admin.settlement_retry": "Admin: Settlement-Retry",
  "billing.budget_alert": "Billing: Budget-Alert gesendet",
  "legal.berufungsgruende": "Berufungsgründe generiert",
  "legal.opponent_simulation": "Gegner-Simulation durchgeführt",
  "legal.reorder_gruende": "Berufungsgründe neu sortiert",
  "workflow.advance": "Workflow-Schritt fortgeführt",
  "legal.pipeline_trigger": "Pipeline gestartet",
  "org.join": "Organisation beigetreten",
  "gdpr.data_deletion": "DSGVO-Accountlöschung",
  "absence.create": "Abwesenheit angelegt",
  "booking.create": "Terminbuchung erstellt",
  "corpus.file_create": "Corpus-Datei erstellt",
  "corpus.file_delete": "Corpus-Datei gelöscht",
  "backup.restore": "Backup wiederhergestellt",
  "backup.delete": "Backup gelöscht",
  "corpus_files.restore": "Corpus-Datei wiederhergestellt",
  "corpus_files.bulk_edit": "Corpus-Dateien Bulk-Edit",
  "corpus_files.publish": "Corpus-Import veröffentlicht",
  "corpus_files.flag": "Corpus-Datei markiert",
  "corpus_files.build_index": "Corpus-Index gebaut",
  "corpus_files.validate_schema": "Corpus-Schema validiert",
  "corpus_alerts.mark_read": "Corpus-Alerts als gelesen markiert",
  "corpus_command_center.trigger_delta": "Corpus-Delta getriggert",
  "acl.group_create": "ACL-Gruppe erstellt",
  "docusign.disconnect": "DocuSign getrennt",
  "copilot.explain": "Copilot: Erklärung",
  "copilot.memory_create": "Copilot: Memory erstellt",
  "copilot.memory_update": "Copilot: Memory aktualisiert",
  "copilot.memory_delete": "Copilot: Memory gelöscht",
  "copilot.plan_create": "Copilot: Plan erstellt",
  "copilot.plan_update": "Copilot: Plan aktualisiert",
  "copilot.plan_abandon": "Copilot: Plan verworfen",
  "copilot.notification_dismiss": "Copilot: Notification dismissed",
  "copilot.draft_review": "Copilot: Draft-Review",
  "copilot.draft_issue_update": "Copilot: Draft-Issue aktualisiert",
  "legal.clause_annotation": "Klausel-Annotation erstellt",
  "legal.clause_annotation_review": "Klausel-Annotation reviewiert",
  "connector.configure": "Connector konfiguriert",
  "connector.toggle": "Connector getoggelt",
  "experience.profile_update": "Erfahrungsprofil aktualisiert",
  "dashboard.briefing": "Dashboard-Briefing abgerufen",
  "presence.update": "Presence aktualisiert",
  "security.2fa_qrcode": "2FA-QR-Code generiert",
  "agent.supervisor_run": "Agent-Supervisor gestartet",
  "agent.control": "Agent gesteuert",
  "triage.classify": "Triage klassifiziert",
  "act_import.create": "Act-Import erstellt",
  "act_import.refresh": "Act-Import aktualisiert",
  "act_import.finalize": "Act-Import finalisiert",
  "act_import.item_upsert": "Act-Import-Item upserted",
  "time_tracking.start": "Zeiterfassung gestartet",
  "time_tracking.stop": "Zeiterfassung gestoppt",
  "time_tracking.heartbeat": "Zeiterfassung Heartbeat",
  "time_tracking.passive_preference": "Passive Zeiterfassung-Einstellung",
  "legal.knowledge_sources": "Wissensquellen abgefragt",
  "legal.chronology_build": "Chronologie erstellt",
  "pages.batch_read": "Seiten Batch-Read",
  "pages.batch_list": "Seiten Batch-List",
  "autopilot.policy_create": "Autopilot-Policy erstellt",
  "autopilot.policy_list": "Autopilot-Policies abgefragt",
  "autopilot.policy_update": "Autopilot-Policy aktualisiert",
  "upload.token_issued": "Upload-Token ausgestellt",
  "email.import": "E-Mail importiert",
  "notifications.list": "Notifications abgefragt",
  "notifications.mark_read": "Notification als gelesen markiert",
  "notifications.mark_all_read": "Alle Notifications als gelesen",
  "notifications.deadline_create": "Deadline-Notification erstellt",
  "notifications.deadline_batch_create": "Deadline-Notifications Batch erstellt",
  "notifications.delete": "Notification gelöscht",
  "legal.judgements_import": "Urteile importiert",
  "legal.case_investigation": "Sachverhaltsprüfung durchgeführt",
  "legal.case_investigation_review": "Sachverhaltsprüfung: Widerspruch reviewiert",
  "legal.batch_pipeline": "Batch-Pipeline ausgeführt",
  "legal.permissions_check": "Rechteprüfung ausgeführt",
  "legal.batch_edit": "Batch-Edit ausgeführt",
  "legal.writing_style_save": "Schreibstil gespeichert",
  "legal.writing_style_delete": "Schreibstil gelöscht",
  "legal.frist_compute": "Frist berechnet",
  "legal.wiedervorlage_create": "Wiedervorlage erstellt",
  "legal.eval_gate": "Eval-Gate ausgeführt",
  "review_table.ask": "Review-Table: Frage gestellt",
  "email.messages_list": "E-Mail-Liste abgefragt",
  "email.message_send": "E-Mail gesendet",
  "email.reply": "E-Mail beantwortet",
  "email.message_detail": "E-Mail-Detail abgefragt",
  "email.message_update": "E-Mail aktualisiert",
  "billing.seats_list": "Seats abgefragt",
  "billing.seats_change": "Seats geändert",
  "billing.proration_preview": "Proration-Preview",
  "billing.plan_change": "Plan gewechselt",
  "claim.create": "Claim erstellt",
  "claim.list": "Claims abgefragt",
  "claim.payment_allocate": "Claim-Zahlung zugeordnet",
  "human_review.submit": "Human-Review eingereicht",
  "human_review.summary": "Human-Review Zusammenfassung",
};

export function auditLabel(action: string): string {
  return ACTION_LABELS[action] || action;
}
