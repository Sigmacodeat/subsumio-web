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
  | "matter.access_update"
  | "data_room.create"
  | "data_room.share"
  | "data_room.invite"
  | "data_room.accept"
  | "data_room.revoke"
  | "data_room.access"
  | "trust.booking"
  | "trust.reversal"
  | "trust.reconciliation"
  | "trust.status"
  | "kyc.create"
  | "kyc.update"
  | "kyc.verify"
  | "kyc.fail"
  | "kyc.mandate_end"
  | "case.delete"
  | "case.restore"
  | "case.view"
  | "case.export"
  | "invoice.create"
  | "invoice.update"
  | "invoice.delete"
  | "invoice.send"
  | "invoice.remind"
  | "invoice.e_invoice_generate"
  | "invoice.e_invoice_parse"
  | "invoice.e_invoice_validate"
  | "invoice.rksv_sign"
  | "invoice.rksv_dep_export"
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
  | "deadline.second_check"
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
  | "settings.brain_learning"
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
  | "whatsapp.inbound_muted"
  | "whatsapp.outbound_sent"
  | "whatsapp.outbound_blocked"
  | "whatsapp.briefing_feedback"
  | "whatsapp.flow_case_created"
  | "whatsapp.flow_appointment_booked"
  | "sms.consent_granted"
  | "sms.consent_revoked"
  | "sms.outbound_sent"
  | "sms.outbound_blocked"
  | "sms.delivery_status"
  | "feedback.submit"
  | "time.auto_extract"
  | "admin.user_update"
  | "admin.tenant_suspend"
  | "admin.tenant_reactivate"
  | "automation.create"
  | "automation.update"
  | "automation.delete"
  | "admin.tenant_role_change"
  | "admin.tenant_owner_transfer"
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
  | "support.session_start"
  | "support.session_end"
  | "acl.add_member"
  | "acl.remove_member"
  | "acl.delete_group"
  | "acl.set_permission"
  | "acl.remove_permission"
  | "dms.push"
  | "dms.content_download"
  | "space.update"
  | "email.send"
  | "docusign.send"
  | "docusign.status"
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
  | "signature.qes_start"
  | "signature.qes_signed"
  | "signature.qes_failed"
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
  | "absence.update"
  | "inbound_register.retry"
  | "post_upload_task.retry"
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
  | "corpus.law_refetch"
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
  | "email.account_connect"
  | "email.account_update"
  | "email.account_disconnect"
  | "email.account_sync"
  | "email.draft_reply"
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
  "user.login": "Anmeldung",
  "user.logout": "Abmeldung",
  "user.signup": "Registrierung",
  "case.create": "Akte angelegt",
  "case.update": "Akte aktualisiert",
  "matter.access_update": "Aktenzugriff geändert",
  "data_room.create": "Datenraum angelegt",
  "data_room.share": "Dokumente im Datenraum geändert",
  "data_room.invite": "In Datenraum eingeladen",
  "data_room.accept": "Datenraum-Einladung angenommen",
  "data_room.revoke": "Datenraum-Zugang entzogen",
  "data_room.access": "Dokument im Datenraum abgerufen",
  "trust.booking": "Treuhandbuchung erfasst",
  "trust.reversal": "Treuhandbuchung storniert",
  "trust.reconciliation": "Treuhandkonto abgeglichen",
  "trust.status": "Status des Treuhandkontos geändert",
  "kyc.create": "Identitätsprüfung angelegt",
  "kyc.update": "Identitätsprüfung bearbeitet",
  "kyc.verify": "Identitätsprüfung abgeschlossen",
  "kyc.fail": "Identitätsprüfung nicht bestanden",
  "kyc.mandate_end": "Mandatsende für Aufbewahrung erfasst",
  "case.delete": "Akte archiviert",
  "case.restore": "Akte wiederhergestellt",
  "case.view": "Akte geöffnet",
  "case.export": "Akte exportiert (ZIP)",
  "invoice.create": "Rechnung erstellt",
  "invoice.update": "Rechnung aktualisiert",
  "invoice.delete": "Rechnung gelöscht",
  "invoice.send": "Rechnung versendet",
  "invoice.remind": "Zahlungserinnerung",
  "invoice.e_invoice_generate": "E-Rechnung generiert",
  "invoice.e_invoice_parse": "E-Rechnung importiert",
  "invoice.e_invoice_validate": "E-Rechnung validiert",
  "invoice.rksv_sign": "RKSV-Beleg signiert",
  "invoice.rksv_dep_export": "RKSV-DEP exportiert",
  "document.upload": "Dokument hochgeladen",
  "document.download": "Dokument heruntergeladen",
  "document.delete": "Dokument gelöscht",
  "document.presign": "Upload vorbereitet",
  "document.confirm": "Upload bestätigt und verarbeitet",
  "document.presign_batch": "Sammel-Upload vorbereitet",
  "document.import_from_submission": "Dokument aus Mandanten-Einreichung importiert",
  "document.retry": "Dokument-Retry gestartet",
  "deadline.create": "Frist erstellt",
  "deadline.update": "Frist aktualisiert",
  "deadline.delete": "Frist gelöscht",
  "deadline.second_check": "Notfrist zweitgeprüft",
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
  "legal.eval_fixture_review": "Qualitätsprüfung: Testfall geprüft",
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
  "settings.brain_learning": "Kanzlei-Gehirn lernt mit: geändert",
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
  "query.submit": "KI-Anfrage",
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
  "whatsapp.inbound_muted": "WhatsApp-Nachricht stumm (opted out)",
  "whatsapp.outbound_sent": "WhatsApp proaktiv gesendet",
  "whatsapp.outbound_blocked": "WhatsApp-Versand geblockt",
  "whatsapp.briefing_feedback": "WhatsApp-Briefing-Feedback",
  "whatsapp.flow_case_created": "WhatsApp-Flow: Akte angelegt",
  "whatsapp.flow_appointment_booked": "WhatsApp-Flow: Termin gebucht",
  "sms.consent_granted": "SMS-Einwilligung erteilt",
  "sms.consent_revoked": "SMS-Einwilligung widerrufen",
  "sms.outbound_sent": "SMS gesendet",
  "sms.outbound_blocked": "SMS-Versand geblockt",
  "sms.delivery_status": "SMS-Zustellstatus",
  "time.auto_extract": "KI-Zeiterfassung generiert",
  "feedback.submit": "Retrieval-Feedback",
  "admin.user_update": "Admin: Benutzer aktualisiert",
  "admin.tenant_suspend": "Betreiber: Kanzlei gesperrt",
  "admin.tenant_reactivate": "Betreiber: Kanzlei entsperrt",
  "admin.tenant_role_change": "Betreiber: Rolle in Kanzlei geändert",
  "admin.tenant_owner_transfer": "Betreiber: Kanzlei-Inhaber gewechselt",
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
  "admin.corpus_pipeline": "Admin: Korpus-Verarbeitung gesteuert",
  "admin.chunk_edit": "Admin: Chunk bearbeitet",
  "admin.chunk_delete": "Admin: Chunk gelöscht",
  "admin.chunk_reembed": "Admin: Chunk Re-Embed angestoßen",
  "admin.chunk_flag": "Admin: Chunk markiert",
  "admin.chunk_clear_flag": "Admin: Chunk-Markierung entfernt",
  "support.session_start": "Subsumio-Support: Zugriff gestartet",
  "support.session_end": "Subsumio-Support: Zugriff beendet",
  "dms.push": "Dokument an DMS gepusht",
  "dms.content_download": "DMS-Dokument geöffnet",
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
  "intake.scan_upload": "Intake: Scan hochgeladen",
  "intake.convert": "Intake: Dokument konvertiert",
  "inbox.mark_read": "Nachricht als gelesen markiert",
  "triage.action": "Triage-Aktion ausgeführt",
  "submission.review": "Mandanteneingang geprüft",
  "bea.send": "Elektronischer Versand gestartet",
  "bea.retry": "Elektronischer Versand wiederholt",
  "system.alert": "System-Warnung",
  "system.integrity_check": "Integritätsprüfung (Belege)",
  "ai.injection_detected": "AI Prompt-Injection erkannt",
  "ai.injection_blocked": "AI Prompt-Injection blockiert",
  "ai.reasoning_trace": "AI Reasoning Trace erstellt",
  "ai.webhook_escalate": "KI-Webhook: Eskalation gesendet",
  "ai.webhook_block": "KI-Webhook: Sperr-Ereignis gesendet",
  "verification.policy_allowed": "Verifikations-Policy: Aktion erlaubt",
  "verification.policy_denied": "Verifikations-Policy: Aktion verweigert",
  "verification.override_granted": "Verifikations-Policy: Anwaltlicher Override erteilt",
  "verification.receipt_invalidated": "Verifikations-Policy: Receipt invalidiert (Inhaltsänderung)",
  "signature.capture": "Signatur erfasst",
  "signature.qes_start": "Qualifizierte Signatur gestartet",
  "signature.qes_signed": "Dokument qualifiziert signiert",
  "signature.qes_failed": "Qualifizierte Signatur fehlgeschlagen",
  "poa.generate_pdf": "Vollmacht-PDF generiert",
  "admin.settlement_retry": "Admin: Settlement-Retry",
  "billing.budget_alert": "Billing: Budget-Alert gesendet",
  "legal.berufungsgruende": "Berufungsgründe generiert",
  "legal.opponent_simulation": "Gegner-Simulation durchgeführt",
  "legal.reorder_gruende": "Berufungsgründe neu sortiert",
  "workflow.advance": "Workflow-Schritt fortgeführt",
  "legal.pipeline_trigger": "Automatische Fallaufarbeitung gestartet",
  "org.join": "Organisation beigetreten",
  "gdpr.data_deletion": "DSGVO-Accountlöschung",
  "absence.create": "Abwesenheit angelegt",
  "absence.update": "Abwesenheit geändert",
  "inbound_register.retry": "Posteingangs-Registrierung erneut eingereiht",
  "post_upload_task.retry": "Hintergrund-Aufgabe erneut eingereiht",
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
  "corpus.law_refetch": "Gesetz zum Nachladen vorgemerkt",
  "acl.group_create": "ACL-Gruppe erstellt",
  "docusign.disconnect": "DocuSign getrennt",
  "copilot.explain": "Assistent: Begründung abgerufen",
  "copilot.memory_create": "Assistent: Erinnerung erstellt",
  "copilot.memory_update": "Assistent: Erinnerung aktualisiert",
  "copilot.memory_delete": "Assistent: Erinnerung gelöscht",
  "copilot.plan_create": "Assistent: Plan erstellt",
  "copilot.plan_update": "Assistent: Plan aktualisiert",
  "copilot.plan_abandon": "Assistent: Plan verworfen",
  "copilot.notification_dismiss": "Assistent: Hinweis geschlossen",
  "copilot.draft_review": "Assistent: Entwurf geprüft",
  "copilot.draft_issue_update": "Assistent: Entwurfsanmerkung aktualisiert",
  "legal.clause_annotation": "Klausel-Annotation erstellt",
  "legal.clause_annotation_review": "Klausel-Annotation reviewiert",
  "connector.configure": "Connector konfiguriert",
  "connector.toggle": "Connector getoggelt",
  "experience.profile_update": "Erfahrungsprofil aktualisiert",
  "dashboard.briefing": "Tagesübersicht abgerufen",
  "presence.update": "Anwesenheit aktualisiert",
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
  "pages.batch_read": "Wissensseiten gesammelt gelesen",
  "pages.batch_list": "Wissensseiten gesammelt aufgelistet",
  "autopilot.run": "Autopilot-Lauf",
  "autopilot.policy_create": "Autopilot-Policy erstellt",
  "autopilot.policy_list": "Autopilot-Policies abgefragt",
  "autopilot.policy_update": "Autopilot-Policy aktualisiert",
  "upload.token_issued": "Upload-Token ausgestellt",
  "email.import": "E-Mail importiert",
  "notifications.list": "Benachrichtigungen abgerufen",
  "notifications.mark_read": "Benachrichtigung als gelesen markiert",
  "notifications.mark_all_read": "Alle Benachrichtigungen als gelesen markiert",
  "notifications.deadline_create": "Fristen-Benachrichtigung erstellt",
  "notifications.deadline_batch_create": "Fristen-Benachrichtigungen gesammelt erstellt",
  "notifications.delete": "Benachrichtigung gelöscht",
  "legal.judgements_import": "Urteile importiert",
  "legal.case_investigation": "Sachverhaltsprüfung durchgeführt",
  "legal.case_investigation_review": "Sachverhaltsprüfung: Widerspruch geprüft",
  "legal.batch_pipeline": "Sammelverarbeitung ausgeführt",
  "legal.permissions_check": "Rechteprüfung ausgeführt",
  "legal.batch_edit": "Sammelbearbeitung ausgeführt",
  "legal.writing_style_save": "Schreibstil gespeichert",
  "legal.writing_style_delete": "Schreibstil gelöscht",
  "legal.frist_compute": "Frist berechnet",
  "legal.wiedervorlage_create": "Wiedervorlage erstellt",
  "legal.eval_gate": "Qualitätsprüfung ausgeführt",
  "review_table.ask": "Tabellenprüfung: Frage gestellt",
  "email.messages_list": "E-Mail-Liste abgefragt",
  "email.message_send": "E-Mail gesendet",
  "email.reply": "E-Mail beantwortet",
  "email.message_detail": "E-Mail-Detail abgefragt",
  "email.message_update": "E-Mail aktualisiert",
  "email.account_connect": "Postfach verbunden",
  "email.account_update": "Postfach aktiviert oder pausiert",
  "email.account_disconnect": "Postfach getrennt",
  "email.account_sync": "Postfach abgerufen",
  "email.draft_reply": "Antwortentwurf erstellt",
  "billing.seats_list": "Nutzerplätze abgerufen",
  "billing.seats_change": "Nutzerplätze geändert",
  "billing.proration_preview": "Vorschau der anteiligen Abrechnung",
  "billing.plan_change": "Tarif gewechselt",
  "claim.create": "Forderung erstellt",
  "claim.list": "Forderungen abgerufen",
  "claim.payment_allocate": "Zahlung einer Forderung zugeordnet",
  "human_review.submit": "Menschliche Prüfung eingereicht",
  "human_review.summary": "Menschliche Prüfung: Zusammenfassung abgerufen",
  // ── Berechtigungs-/Sammel-IDs aus createHandler (src/app/api) ──
  "acl.add_member": "Zugriffsgruppe: Mitglied hinzugefügt",
  "acl.remove_member": "Zugriffsgruppe: Mitglied entfernt",
  "acl.delete_group": "Zugriffsgruppe gelöscht",
  "acl.remove_permission": "Zugriffsrecht entfernt",
  "acl.set_permission": "Zugriffsrecht gesetzt",
  "admin.read": "Verwaltungsdaten abgerufen",
  "agent.read": "Agenten abgerufen",
  "agent.write": "Agent gestartet oder geändert",
  "auth.2fa": "Zwei-Faktor-Anmeldung geändert",
  "auth.logout": "Abmeldung",
  "billing.read": "Abrechnungsdaten abgerufen",
  "billing.write": "Abrechnung geändert",
  "brain.read": "Kanzleiwissen gelesen",
  "brain.write": "Kanzleiwissen geändert",
  "brain.delete": "Kanzleiwissen: Eintrag gelöscht",
  "case.created": "Akte angelegt",
  "connector.read": "Konnektoren abgerufen",
  "connector.write": "Konnektor geändert",
  "copilot.tool": "Assistent: Aktion ausgeführt",
  "docusign.send": "DocuSign: Dokument zur Unterschrift versendet",
  "docusign.status": "DocuSign: Status aktualisiert",
  "email.send": "E-Mail gesendet",
  "fibu.bank_feed": "Buchhaltung: Bankumsätze verarbeitet",
  "fibu.opos_import": "Buchhaltung: offene Posten importiert",
  "fibu.opos_list": "Buchhaltung: offene Posten abgerufen",
  "invoice.read": "Rechnungen abgerufen",
  "invoice.write": "Rechnung geändert",
  "invoice.e_invoice": "E-Rechnung verarbeitet",
  "legal.ai_deadlines": "Fristen per KI erkannt",
  "legal.anonymize": "Dokument anonymisiert",
  "legal.conflict": "Kollisionsprüfung",
  "legal.contract_draft": "Vertragsentwurf erstellt",
  "legal.deep_analysis": "Tiefenanalyse durchgeführt",
  "legal.document_review": "Dokumentenprüfung durchgeführt",
  "legal.judgements": "Judikatur abgerufen",
  "legal.judgements_sync": "Judikatur synchronisiert",
  "legal.memo": "Memo erstellt",
  "legal.redline": "Änderungsvergleich erstellt",
  "legal.risk_analysis": "Risikoanalyse durchgeführt",
  "legal.due_diligence": "Due-Diligence-Prüfung",
  "legal.rvg": "RVG-Berechnung",
  "platform.operator": "Betreiber-Zugriff",
  "platform.support_session": "Support-Sitzung",
  "presence.list": "Anwesenheit abgerufen",
  "push.register": "Push-Benachrichtigungen aktiviert",
  "push.unregister": "Push-Benachrichtigungen deaktiviert",
  "scim.read": "Benutzerverzeichnis (SCIM): Daten abgerufen",
  "scim.write": "Benutzerverzeichnis (SCIM): Daten geändert",
  "settings.read": "Einstellungen abgerufen",
  "settings.write": "Einstellungen geändert",
  "team.role_change": "Team: Rolle geändert",
  "whatsapp.outbound": "WhatsApp-Nachricht gesendet",
  "workflow.approve": "Ablauf: Schritt freigegeben",
  "workflow.start": "Ablauf gestartet",
  "workflow.update": "Ablauf aktualisiert",
  "workflow.delete": "Ablauf gelöscht",
  "automation.create": "Automatisierung angelegt",
  "automation.update": "Automatisierung geändert",
  "automation.delete": "Automatisierung gelöscht",
};

/** Anzeige für Aktionen, die weder ein Label noch eine lesbare Ableitung haben. */
export const OTHER_AUDIT_ACTION_LABEL = "Sonstige Aktion";

// Kleines Wörterbuch für die Ableitung lesbarer Labels aus unbekannten IDs
// ("<bereich>.<verb>" bzw. "<bereich>.<objekt>_<verb>"). Bewusst klein: lieber
// "Sonstige Aktion" als ein halb englisches Label.
const AUDIT_NOUNS: Record<string, string> = {
  acl: "Zugriffsrechte",
  admin: "Verwaltung",
  agent: "Agent",
  approval: "Freigabe",
  auth: "Anmeldung",
  billing: "Abrechnung",
  brain: "Kanzleiwissen",
  calendar: "Kalender",
  case: "Akte",
  clause: "Klausel",
  client: "Mandant",
  comment: "Kommentar",
  conflict: "Kollisionsprüfung",
  connector: "Konnektor",
  contact: "Kontakt",
  contract: "Vertrag",
  copilot: "Assistent",
  dashboard: "Übersicht",
  data: "Daten",
  deadline: "Frist",
  document: "Dokument",
  drafting: "Entwurf",
  email: "E-Mail",
  evidence: "Beweismittel",
  expense: "Barauslage",
  intake: "Mandatsanfrage",
  invoice: "Rechnung",
  legal: "Rechtsfunktion",
  member: "Mitglied",
  notifications: "Benachrichtigung",
  permission: "Berechtigung",
  portal: "Mandantenportal",
  role: "Rolle",
  settings: "Einstellungen",
  task: "Aufgabe",
  team: "Team",
  template: "Vorlage",
  time: "Zeiterfassung",
  user: "Benutzer",
  vault: "Dokumentenablage",
  webhook: "Webhook",
  whatsapp: "WhatsApp",
  workflow: "Ablauf",
};

const AUDIT_VERBS: Record<string, string> = {
  add: "hinzugefügt",
  added: "hinzugefügt",
  approve: "freigegeben",
  approved: "freigegeben",
  archive: "archiviert",
  archived: "archiviert",
  assign: "zugewiesen",
  assigned: "zugewiesen",
  cancel: "abgebrochen",
  cancelled: "abgebrochen",
  change: "geändert",
  changed: "geändert",
  close: "geschlossen",
  closed: "geschlossen",
  create: "erstellt",
  created: "erstellt",
  delete: "gelöscht",
  deleted: "gelöscht",
  download: "heruntergeladen",
  downloaded: "heruntergeladen",
  export: "exportiert",
  exported: "exportiert",
  import: "importiert",
  imported: "importiert",
  list: "abgerufen",
  read: "gelesen",
  reject: "abgelehnt",
  rejected: "abgelehnt",
  remove: "entfernt",
  removed: "entfernt",
  restore: "wiederhergestellt",
  restored: "wiederhergestellt",
  send: "gesendet",
  sent: "gesendet",
  start: "gestartet",
  started: "gestartet",
  sync: "synchronisiert",
  update: "aktualisiert",
  updated: "aktualisiert",
  upload: "hochgeladen",
  uploaded: "hochgeladen",
  view: "geöffnet",
  viewed: "geöffnet",
  write: "geändert",
};

/**
 * Leitet aus einer unbekannten Aktions-ID ein deutsches Label ab
 * ("case.created" → "Akte: erstellt", "team.member_removed" → "Team: Mitglied
 * entfernt"). Liefert null, wenn ein Bestandteil nicht im Wörterbuch steht.
 */
export function humaniseAuditAction(action: string): string | null {
  const parts = action.split(".");
  if (parts.length < 2) return null;
  const noun = AUDIT_NOUNS[parts[0]];
  if (!noun) return null;
  const tokens = parts.slice(1).join("_").split("_").filter(Boolean);
  if (tokens.length === 0) return null;
  const verb = AUDIT_VERBS[tokens[tokens.length - 1]];
  if (!verb) return null;
  const objects: string[] = [];
  for (const token of tokens.slice(0, -1)) {
    const object = AUDIT_NOUNS[token];
    if (!object) return null;
    objects.push(object);
  }
  return `${noun}: ${[...objects, verb].join(" ")}`;
}

/** true, wenn für die ID ein gepflegtes oder ableitbares Label existiert. */
export function hasAuditLabel(action: string): boolean {
  return Boolean(ACTION_LABELS[action] || humaniseAuditAction(action));
}

/**
 * Deutsches Label für eine Audit-Aktion. Rohe IDs werden Nutzern nie als Label
 * gezeigt: gepflegtes Label → abgeleitetes Label → "Sonstige Aktion".
 * Die rohe ID bleibt für Administratoren als Tooltip verfügbar (Audit-Seite).
 */
export function auditLabel(action: string): string {
  if (!action) return "";
  return ACTION_LABELS[action] || humaniseAuditAction(action) || OTHER_AUDIT_ACTION_LABEL;
}
