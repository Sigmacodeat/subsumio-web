# Subsumio Gesamt-Audit — Fortschritts-Ledger

Systematisches Domänen-Audit des gesamten Produkts. Jede Domäne: Blueprint →
Pakete → Tests → Self-Audit → Edge-Case-Stress → DoD-Gate → PR → Merge → Deploy.

| #   | Domäne                     | PR  | Merge-Commit | Status   | Kernaussage                                                                                   |
| --- | -------------------------- | --- | ------------ | -------- | --------------------------------------------------------------------------------------------- |
| 1   | Fristen & Zeit             | #40 | 51d565be     | ✅ live  | Reminder-Stufen, Notfrist-Eskalation, Edit/Cancel im Cockpit, Cancel-Exklusion überall        |
| 2   | Akte & Dokumente           | #41 | ba421acbd1   | ✅ live  | Trash-Retention+Purge-Cron, echte Versionen, reviewed_by, Versions-Snapshots beim Löschen     |
| 3   | Kommunikation              | #42 | 87b4d44b     | ✅ live  | HTML-Escaping, sendFirmMail (SMTP→Resend), Akten-Anhänge, inbound_register-Action             |
| 4   | Geld                       | #43 | ce2c9c3c     | ✅ live  | e-Invoice serverseitig, OPOS-Lebenszyklus (war komplett tot), OPOS-Read-Fixes                 |
| 5   | Mandantenportal & Zugriff  | #44 | 0a139469cc   | ✅ live  | Kill-Switch-Parität, Link-Registry+Einzelwiderruf, Reset-Cutoff, Share-Persistenz             |
| 6   | Auth / Org / RBAC          | #45 | 9dc5f4169f   | ✅ live  | Invite-Cutoff (iat+inviteRevokedAt), Register→Signup-Alias, echte Lifecycle-Tests             |
| 7   | Suche & KI (Grounding)     | #46 | 55d5f3c14b   | ✅ live  | Guard-Coverage (+6 Flächen), final_answer-Duplikat, Search-Clamp                              |
| 8   | Zeit & Honorar             | —   | —            | 🔄 im PR | billed-Sperre (GoBD), Idle-Tail-Fix Cron, auto-extract persistiert echt, Retry-Writer geteilt |
| 9   | DSGVO & Daten-Lebenszyklus | —   | —            | 🔄 im PR | Legal-Hold-Gate real (war Fake-Claim), 30d-User-Purge, Export-Typen komplett                  |
| 10  | Settings & Onboarding      | —   | —            | ✅ clean | Alle Settings-Routen gehärtet (hash-only Tokens, Policy-Enforcement) — keine Änderung nötig   |
| 11  | Workflow-/E2E-Querschnitt  | —   | —            | 🔄 im PR | Querschnitt-Sweep: keine toten Routen, 501er ehrlich, verify grün                             |

## Offene proaktive Vorschläge (über Domänen hinweg)

- [ ] Fristen: Wochenend-/Ruhezeit-Handling für Eskalations-Mails
- [ ] Geld: OPOS-Backfill für Altrechnungen; Mahnformeln vereinheitlichen (20/40/60 vs. 5/10/15 €); restliche `as unknown as AuditAction`-Casts
- [ ] Kommunikation: Delivery-Status-Reconciliation (Bounce-Webhook); Tracking-Retention (DSGVO); beA-Dead-UI-Check
- [ ] Portal: optionale zweite Faktor-Ebene für sensible Akten; Link-Registry ggf. als DB-Tabelle; Portal-Aktivitäts-Feed
- [ ] KI: Retrieval-Feedback-UI verdrahten (Endpunkt existiert, kein Konsument; In-Memory-Store verliert bei Restart)
- [ ] Auth: E-Mail-Änderungs-Flow (me-PATCH nur name/locale); „Aktive Sessions"-Liste mit Einzel-Revocation; Join in suspendierte Org via altem Link technisch möglich (folgenlos — nächster Request fail-closed, aber UX-wart)
- [ ] Zeit & Honorar: atomares `time_entries`-Append engine-seitig (aktuell Retry-Schleife statt echter Transaktion); Expense-Billing ohne eigenen Endpoint (geht über updatePage-Patch); Timer-Einträge sind Standalone-Pages — mark-billed erreicht nur akten-eingebettete Einträge
- [ ] DSGVO: Auftragsverarbeitungs-Doku (AVV-Template) als Download; Retention-Cron deckt nur Akten, nicht Dokumente/Notizen mit eigener Frist
