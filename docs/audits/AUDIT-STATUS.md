# Subsumio Gesamt-Audit — Fortschritts-Ledger

Systematisches Domänen-Audit des gesamten Produkts. Jede Domäne: Blueprint →
Pakete → Tests → Self-Audit → Edge-Case-Stress → DoD-Gate → PR → Merge → Deploy.

| # | Domäne | PR | Merge-Commit | Status | Kernaussage |
|---|--------|----|--------------|--------|-------------|
| 1 | Fristen & Zeit | #40 | 51d565be | ✅ live | Reminder-Stufen, Notfrist-Eskalation, Edit/Cancel im Cockpit, Cancel-Exklusion überall |
| 2 | Akte & Dokumente | #41 | ba421acbd1 | ✅ live | Trash-Retention+Purge-Cron, echte Versionen, reviewed_by, Versions-Snapshots beim Löschen |
| 3 | Kommunikation | #42 | 87b4d44b | ✅ live | HTML-Escaping, sendFirmMail (SMTP→Resend), Akten-Anhänge, inbound_register-Action |
| 4 | Geld | #43 | ce2c9c3c | ✅ live | e-Invoice serverseitig, OPOS-Lebenszyklus (war komplett tot), OPOS-Read-Fixes |
| 5 | Mandantenportal & Zugriff | #44 | 0a139469cc | ✅ live | Kill-Switch-Parität, Link-Registry+Einzelwiderruf, Reset-Cutoff, Share-Persistenz |
| 6 | Auth / Org / RBAC | #45 | — | 🔄 in Arbeit | Invite-Cutoff (iat+inviteRevokedAt), Register→Signup-Alias, echte Lifecycle-Tests |
| 7 | Suche & KI (Grounding) | — | — | ⬜ offen | Grounding-Invariante, Retrieval, CitationPanel |
| 8 | Zeit & Honorar | — | — | ⬜ offen | Zeiterfassung→Rechnung, RVG/FAO (teils retired) |
| 9 | DSGVO & Daten-Lebenszyklus | — | — | ⬜ offen | Retention, Löschkonzept, Export, Auftragsverarbeitung |
| 10 | Settings & Onboarding | — | — | ⬜ offen | Kanzlei-Settings, Wizard, Feature-Flags |
| 11 | Workflow-/E2E-Querschnitt | — | — | ⬜ offen | Gesamt-Userflows, verwaiste Routen, Rest-Risiken |

## Offene proaktive Vorschläge (über Domänen hinweg)

- [ ] Fristen: Wochenend-/Ruhezeit-Handling für Eskalations-Mails
- [ ] Geld: OPOS-Backfill für Altrechnungen; Mahnformeln vereinheitlichen (20/40/60 vs. 5/10/15 €); restliche `as unknown as AuditAction`-Casts
- [ ] Kommunikation: Delivery-Status-Reconciliation (Bounce-Webhook); Tracking-Retention (DSGVO); beA-Dead-UI-Check
- [ ] Portal: optionale zweite Faktor-Ebene für sensible Akten; Link-Registry ggf. als DB-Tabelle; Portal-Aktivitäts-Feed
- [ ] Auth: E-Mail-Änderungs-Flow (me-PATCH nur name/locale); „Aktive Sessions"-Liste mit Einzel-Revocation; Join in suspendierte Org via altem Link technisch möglich (folgenlos — nächster Request fail-closed, aber UX-wart)
