# Subsumio Gesamt-Audit — Fortschritts-Ledger

Systematisches Domänen-Audit des gesamten Produkts. Jede Domäne: Blueprint →
Pakete → Tests → Self-Audit → Edge-Case-Stress → DoD-Gate → PR → Merge → Deploy.

| #   | Domäne                     | PR  | Merge-Commit | Status  | Kernaussage                                                                                                                                                                      |
| --- | -------------------------- | --- | ------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Fristen & Zeit             | #40 | 51d565be     | ✅ live | Reminder-Stufen, Notfrist-Eskalation, Edit/Cancel im Cockpit, Cancel-Exklusion überall                                                                                           |
| 2   | Akte & Dokumente           | #41 | ba421acbd1   | ✅ live | Trash-Retention+Purge-Cron, echte Versionen, reviewed_by, Versions-Snapshots beim Löschen                                                                                        |
| 3   | Kommunikation              | #42 | 87b4d44b     | ✅ live | HTML-Escaping, sendFirmMail (SMTP→Resend), Akten-Anhänge, inbound_register-Action                                                                                                |
| 4   | Geld                       | #43 | ce2c9c3c     | ✅ live | e-Invoice serverseitig, OPOS-Lebenszyklus (war komplett tot), OPOS-Read-Fixes                                                                                                    |
| 5   | Mandantenportal & Zugriff  | #44 | 0a139469cc   | ✅ live | Kill-Switch-Parität, Link-Registry+Einzelwiderruf, Reset-Cutoff, Share-Persistenz                                                                                                |
| 6   | Auth / Org / RBAC          | #45 | 9dc5f4169f   | ✅ live | Invite-Cutoff (iat+inviteRevokedAt), Register→Signup-Alias, echte Lifecycle-Tests                                                                                                |
| 7   | Suche & KI (Grounding)     | #46 | 55d5f3c14b   | ✅ live | Guard-Coverage (+6 Flächen), final_answer-Duplikat, Search-Clamp                                                                                                                 |
| 8   | Zeit & Honorar             | #47 | bf980d579a   | ✅ live | billed-Sperre (GoBD), Idle-Tail-Fix Cron, auto-extract persistiert echt, Retry-Writer geteilt                                                                                    |
| 9   | DSGVO & Daten-Lebenszyklus | #47 | bf980d579a   | ✅ live | Legal-Hold-Gate real (war Fake-Claim), 30d-User-Purge, Export-Typen komplett                                                                                                     |
| 10  | Settings & Onboarding      | #47 | bf980d579a   | ✅ live | Auditiert, keine Änderung nötig (hash-only Tokens, Policy-Enforcement, Jurisdiction-Server)                                                                                      |
| 11  | Workflow-/E2E-Querschnitt  | #47 | bf980d579a   | ✅ live | Querschnitt-Sweep: keine toten Routen, 501er ehrlich, verify grün                                                                                                                |
| 8a  | Zeit & Honorar — Rest      | #48 | 21af97378a   | ✅ live | Envelope-Unwrap (/dashboard/time war leer!), Standalone-Timer abrechenbar, Wien-TZ, Booking-Race, Absence-Endtag, Suggestions-Privacy-Filter; Copilot-Invoice retry-sicher       |
| 9a  | DSGVO — Nachbesserung      | #49 | 6ba56d4801   | ✅ live | Legal-Hold-Re-Check beim 30d-Hard-Delete, lib-Extraktion + Tests                                                                                                                 |
| 6a  | Auth — Rest                | #50 | a15e522800   | ✅ live | Session-Registry (sid-Claim, Einzel-Revocation Node+Edge, „Aktive Sitzungen"-UI, Logout nur eigene Session), OWASP-E-Mail-Change (Passwort-Reauth, Single-Use-Token, revoke-all) |
| 7a  | KI — Rest                  | #50 | a15e522800   | ✅ live | Retrieval-Feedback-UI verdrahtet (👍/👎 + Reason-Picker in /dashboard/search), dormant→aktiv                                                                                     |
| 7b  | KI — Feedback-Persistenz   | #55 | 9018c6d394   | ✅ live | Retrieval-Feedback als Engine-Pages persistiert (org-scoped, eval-gate robust bei Engine-Ausfall)                                                                                |
| 8b  | Zeit — Atomares Append     | #56 | a587d36914   | ✅ live | Engine-Ops `page_array_append`/`page_array_mutate` (pglite+pg identisch, ein UPDATE-Statement), alle time_entries-Pfade migriert; Harness-Fix RESTART IDENTITY                   |
| 8c  | Zeit — Expense-Endpoint    | #57 | c5e3345207   | ✅ live | `/api/expenses` CRUD + mark-billed/unbill, billed-Guard 409, UI migriert (updatePage nur noch Offline-Fallback)                                                                  |
| 1a  | Fristen — Ruhetage         | #58 | b029d3f1dd   | ✅ live | `deadlineQuietDays` (Sa/So/Feiertag im Kanzlei-Rechtsraum): Digest+WhatsApp+Eskalation auf nächsten Werktag; Notfrist-Eskalation einmal pro Frist statt täglich                  |
| 8d  | Zeit/Geld — Rest           | #59 | 77e48abf44   | ✅ live | Timer-Obergrenze 12h (Heartbeat-409 + Widget-Aufräumen), `invoice-mark-billed`→`/api/expenses/mark-billed`, Mahnformel 5/10/15 € kumulativ, 7 AuditAction-Casts deklariert       |
| 8e  | Zeit — Atomic Expense Ops  | #62 | 7ba5b6b01e   | ✅ live | Auslagen-Billing/Edits als atomare Engine-Array-Ops statt Read-Modify-Write (Parallel-Agent)                                                                                     |
| 3a  | Kommunikation — Rest       | #65 | 9369263fd0   | ✅ live | Resend-Webhook `/api/webhooks/resend` (Svix, fail-closed) → Delivery-Status-Write-back; Tracking-Events 90d-Retention; beA-Dead-UI-Counts entfernt                               |
| 9b  | DSGVO — Rest               | #60 | e9aeb9de97   | ✅ live | AVV-Muster-Download (md + PDF, „anwaltlich zu prüfen"); Per-Item-Retention `retention_until`/`retention_days` für Dokumente/Notizen im trash-purge-Cron                          |
| 9c  | DSGVO — Retention-Fix      | #66 | 834d0108ed   | ✅ live | Retention unterschreitet nie GoBD-Mindestfrist + respektiert Legal Hold (Parallel-Agent)                                                                                         |
| 3b  | Kommunikation — Dedupe-Fix | #67 | fae1b8fa46   | ✅ live | Resend-Reconcile-Dedupe-Key pro Brain gescoped (Parallel-Agent)                                                                                                                  |
| 12a | Zugriff & Rollen           | —   | —            | ⏳ PR   | Aktenzugriff und Rollen einheitlich in Postfach, Protokoll, Graph, Versionen, Datenräumen, Echtzeit und Erinnerungen                                                             |
| 12b | Mandantentrennung          | —   | —            | ⏳ PR   | Quellen strikt pro Kanzlei (MCP, Quellen-Klon, ACL-Gruppen, Ordner-Import, SMS-Einwilligung, DMS)                                                                                |
| 12c | Geschützte Datensätze      | —   | —            | ⏳ PR   | Kanzleidaten, KYC, Anderkonten, Freigaben, Legal Hold nur über eigene Routen; SMTP-Passwort verschlüsselt; Ladefehler überschreiben nichts mehr                                  |
| 12d | Geld-Integrität            | —   | —            | ⏳ PR   | Gestellte Rechnungen auf allen Schreibwegen unveränderbar, Leistungen atomar reserviert, Unbill/Storno konsistent, Credit-Übertrag nur Restbetrag                                |
| 12e | Akte sicher anlegen        | —   | —            | ⏳ PR   | Ein gemeinsamer Anlage-Pfad (Import, WhatsApp, Copilot, Freigaben) ohne Überschreiben, mit Kollisionsprüfung; Vollsicherung blättert vollständig                                 |
| 12f | Fristen AT                 | —   | —            | ⏳ PR   | AT-Fristengine überall (Akten-Tab, Chat, Widget), Ferialsachen, VfGH/BFG-Fristen, Vier-Augen serverseitig, Notfrist-Schutz, revisionssicheres Protokoll                          |
| 12g | Kollisionsprüfung          | —   | —            | ⏳ PR   | Seitenbewusst (Mandant/Gegner), toleranter Namensabgleich, Mandatsannahme und Freigabe serverseitig                                                                              |
| 12h | Folgearbeiten Audit        | —   | —            | ⏳ PR   | DMS pro Kanzlei mit geprüftem Ausgangsverkehr, alle Benachrichtigungen aktenbewusst, WhatsApp-Einwilligung pro Kanzlei, Alt-Geheimnisse versiegelt, Anlegen ersetzt nie          |
| 12i | Pakete D0–D6 (Qualität)    | —   | —            | ⏳ PR   | Listen vollständig (Cursor-Paging), Schreibfehler nie als Erfolg, CSRF überall, Geld/Kalender/KI/Kommunikation/Kanzleibetrieb/Auth laut Audit-Paketen überarbeitet               |

## Offene proaktive Vorschläge (über Domänen hinweg)

- [ ] Geld: OPOS-Backfill für Altrechnungen
- [ ] Portal: optionale zweite Faktor-Ebene für sensible Akten; Link-Registry ggf. als DB-Tabelle; Portal-Aktivitäts-Feed
- [ ] KI: Retrieval-Feedback soll ins Ranking-Tuning einfließen (Persistenz ✅ seit #55); Beleg-Upload für expense `receipt_slug` verdrahten
- [ ] Auth: Join in suspendierte Org via altem Link technisch möglich (folgenlos — nächster Request fail-closed, aber UX-wart); SSO-Only-Accounts ohne Passwort können E-Mail nicht ändern (brauchen erst Reset-Flow)
- [ ] Kommunikation: `EMAIL_TRACKING_RETENTION_DAYS` (90d) konfigurierbar via Kanzlei-Settings; Bounce/Failed auf case_email sollte Badge/Aufgabe in der Akte erzeugen (aktuell nur Postausgangsbuch); SMTP-Pfad liefert keine Delivery-Events
- [ ] DSGVO: UI zum Setzen von `retention_until`/`retention_days` im Dokumenten-Metadaten-Dialog (Cron-Seite seit #60 live); GoBD-Retention-Ablauf in Release Notes
- [x] ~~Fristen: Wochenend-/Ruhezeit-Handling~~ ✅ #58
- [x] ~~Kommunikation: Bounce-Webhook, Tracking-Retention, beA-Dead-UI~~ ✅ #65
- [x] ~~Zeit: Timer-Obergrenze, `invoice-mark-billed`→`/api/expenses`~~ ✅ #59
- [x] ~~Geld: Mahnformeln, `as unknown as AuditAction`-Casts~~ ✅ #59
- [x] ~~DSGVO: AVV-Template, Retention-Cron für Dokumente/Notizen~~ ✅ #60
