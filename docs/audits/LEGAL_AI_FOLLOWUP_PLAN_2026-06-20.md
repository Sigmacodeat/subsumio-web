# Subsumio Legal-AI — Folge-Plan (Stand 2026-06-20)

Dieser Plan ist das Ergebnis einer vollständigen Paket-für-Paket-Verifikation gegen
`docs/audits/LEGAL_AI_ACTION_TODO_PLAN_2026-06-20.md` — nicht gegen dessen eigene
Status-Spalte, sondern gegen den tatsächlichen Code. Ausgenommen: die Matter-Scope-/
Permission-Filter-Arbeit an P0-SECR-002 und P31-SB-001, die in dieser Session bereits
verifiziert und nachgeschärft wurde (App-Schicht + Engine-Schicht, siehe Commits
`4f8b998f`, `d3ec8d3df`).

**Kernbefund:** Die ursprüngliche Status-Tabelle ("75 Fertig, 100%") gilt nur für die
~20 explizit benannten P0-/P1-Ticket-IDs. Auf Ebene der 32 großen Pakete ist das Bild
deutlich gemischter: viele Pakete sind **Teilweise**, einige **Überclaimed** (Code
existiert, aber nicht das, was der Pakettitel verspricht), und ein wiederkehrendes
Muster ist **fertiges, aber unverdrahtetes Engineering** — Module, die vollständig
gebaut und getestet sind, aber nirgends aufgerufen werden.

## Strukturelle Beobachtung: Anbindung statt Neubau

Bevor irgendetwas neu gebaut wird, zuerst prüfen, ob es schon existiert:

| Modul                              | Zustand                                                                        | Was fehlt                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `src/lib/efiling-architecture.ts`  | Vollständiges, getestetes `FilingPackage`-State-Machine-Modell                 | Keine Route/UI nutzt es — `bea/page.tsx` ist davon isoliert      |
| `src/lib/migration-project.ts`     | Vollständiges, getestetes Lifecycle-Modell (planning→dry_run→cutover→rollback) | `import-kanzlei/page.tsx` referenziert es nirgends               |
| axe-core a11y-Tests                | Zwei echte Test-Spec-Dateien                                                   | Kein Playwright-Projekt, 0 Treffer in CI — komplett unverdrahtet |
| `evaluateReleaseGate()` (Paket 14) | Funktionierendes Eval-Gate                                                     | Wird nirgends aus `.github/workflows/*.yml` aufgerufen           |

Diese vier sind die günstigsten Fixes im ganzen Plan: kein Neubau, nur Verkabelung.

---

## Priorität A — Sicherheit/Compliance (vor allem anderen)

1. ~~**DocuSign-Token-Verschlüsselung**~~ — **Korrektur:** beim genaueren Hinsehen
   bereits korrekt implementiert. `docusignAccessToken`/`docusignRefreshToken` stehen
   in `SENSITIVE_USER_FIELDS` (`src/lib/auth/store.ts`) und werden von beiden Adaptern
   (File + Postgres) an allen Lese-/Schreibstellen ver-/entschlüsselt, inkl. OAuth-Callback.
   Konstante exportiert + echter Round-Trip-Test ergänzt
   (`src/lib/auth/sensitive-fields-encryption.test.ts`), um das dauerhaft abzusichern.
   Der ursprüngliche Audit-Befund war ein False Positive.
2. ~~**Legal-Hold-Enforcement in die Engine-Schicht ziehen**~~ — **Erledigt.**
   `server/src/core/facts/forget.ts`'s `forgetFactInFence()` — der einzige Choke-Point,
   den sowohl `gbrain forget` (CLI, `recall.ts`) als auch der MCP-Op `forget_fact`
   (`operations.ts`) durchlaufen — prüft jetzt `frontmatter.legal_hold === true` auf
   der Entity-Seite UND der Source-Dokument-Seite vor jedem Forget (neuer
   `ForgetFactResult.path: 'legal_hold'`). Fail-open nur bei fehlender Seite (kein
   Hold-Flag = kein Hold), fail-closed sobald eine Seite gefunden wird und das Flag
   trägt. `decay.ts` ist reine Confidence-Scoring-Logik ohne Datenverlust-Risiko —
   dort ist kein Hold-Check nötig (anders als ursprünglich im Audit vermutet). 4 neue
   Tests (`server/test/legal-hold-forget.test.ts`), inkl. Source-Dokument-Fall.
   **Offen:** das tote App-Layer-Modul `src/lib/facts-forget-decay.ts` (nie irgendwo
   importiert) — entweder an einen echten Aufrufer anbinden oder als bewusst
   archivierte Referenzimplementierung kennzeichnen, damit niemand fälschlich
   annimmt, es sei der aktive Schutzmechanismus.
3. ~~**Vault-Verschlüsselung**~~ — **Korrektur nach Prüfung: kein App-Code-Fix möglich/sinnvoll.**
   "Vault" ist keine eigene Speicherschicht — `src/app/dashboard/vault/page.tsx` ist nur
   eine gefilterte Ansicht auf normale Brain-Pages (`api.ts`/`compiled_truth`). Beim
   Upload (`src/app/api/upload/route.ts` → Engine `/api/upload` in `web-api.ts`) wird
   **kein separates Roh-Datei-Blob** gespeichert — `importFromContent()` extrahiert nur
   Text in `compiled_truth`/Frontmatter derselben `pages`-Tabelle wie jede andere Seite.
   Es gibt also keinen abgrenzbaren "Vault-Blob", den man gezielt verschlüsseln könnte.
   Feld-Verschlüsselung wie bei DocuSign-Tokens scheidet aus, weil `compiled_truth` für
   Volltextsuche + Embeddings (RAG) im Klartext durchsuchbar bleiben MUSS — Verschlüsseln
   würde die Kernsuche brechen. Die korrekte Antwort auf "sind Mandantendaten beim
   Hoster verschlüsselt" ist eine **Infrastruktur-/Hosting-Entscheidung** (Disk-Encryption-
   at-Rest beim Postgres-Provider, z. B. Neon/Supabase/RDS aktivieren — bei den meisten
   Managed-Anbietern bereits Standard), keine Anwendungscode-Aufgabe. `DATABASE_URL` ist
   in `.env.example`/`server/.env.example` provider-agnostisch — **offen**: dokumentieren,
   welcher Postgres-Provider in Produktion läuft, und bestätigen, dass dessen
   Encryption-at-Rest aktiv ist (Betriebs-Checkliste, kein Code-Ticket).
4. **Outlook-Add-in: API-Key aus Klartext-localStorage entfernen** —
   `outlook-addin/src/taskpane.ts` speichert den API-Key im Klartext im Browser
   (XSS-Angriffsfläche auf Anwaltszugang). Auf token-basierten/verschlüsselten
   Mechanismus wie andere Add-ins umstellen.
5. **AI-Act-/Model-Policy technisch durchsetzen** — `src/lib/ai-act.ts` und
   `src/lib/model-config.ts` sind rein deklarativ (Label-Metadaten ohne
   Laufzeit-Whitelist/EU-only-Gate). Falls Marketing/Vertrieb technische
   Durchsetzung suggeriert, ist das ein Compliance-Risiko — entweder Gate bauen
   oder Marketingaussage korrigieren.

## Priorität B — Produkthaftung/Qualitätssicherung

6. **AI-Quality-Eval-Gate in CI verdrahten** (Paket 14) — `evaluateReleaseGate()`
   existiert und funktioniert, läuft aber nur manuell. In
   `.github/workflows/ci.yml` als blockierenden Step einhängen, bevor ein Release
   mit potenziell halluzinierenden Antworten ausgeliefert wird.
7. **Accessibility-Tests in CI einhängen** (Paket 27) — axe-core ist installiert,
   Tests existieren, aber kein Playwright-Projekt + keine CI-Stage. EAA-Pflicht
   gilt seit 28.06.2025 für B2B-Dienste an bestimmte Kundengruppen — das ist ein
   Termin-Risiko, kein reines Polish-Thema.
8. **Performance/Last-Test einmal echt ausführen** (Paket 28) — `loadtest-scenarios.ts`
   und `performance-budgets.ts` generieren nur k6-Skripte, führen aber nie etwas aus.
   Ein einziger echter Lauf gegen eine Staging-Umgebung validiert den
   "production-ready"-Anspruch erstmals empirisch.

## Priorität C — Anbindung bestehender, fertiger Module

9. **`efiling-architecture.ts` an `bea/page.tsx` + Approval-Flow anbinden**
   (Paket 22) — bevor Court-Filing neu spezifiziert wird, das bestehende
   `FilingPackage`-Modell reaktivieren.
10. **`migration-project.ts` an `import-kanzlei/page.tsx` anbinden** (Paket 26) —
    zwei parallele, unverbundene Implementierungen zusammenführen.

## Priorität D — Paket-33-USP-Lücken (proaktiver Sekretär)

11. **Daily-Briefing mit Superbrain/Matter-Context groundieren** — `daily-briefing.ts`
    hat 0 Imports aus `context-engine.ts`/`matter-context.ts`. Aktuell nur Fristen
    aus einer flachen Liste, kein echtes Akten-Verständnis im Briefing-Text.
12. **Feedback-Capture-Kanal aktivieren** — `briefing-feedback.ts` ist geschrieben,
    aber nie aus dem WhatsApp-Webhook aufgerufen (toter Code). Ohne ihn bleibt
    `proactivePrecision` in `secretary-metrics.ts` für immer `null`.
13. **Echten Notification-Event-Bus bauen, Cron-Duplikate konsolidieren** —
    `src/app/api/notifications/route.ts` ist reines CRUD, kein Bus.
    `cron/deadline-reminders` und `cron/deadlines` sind seit Längerem doppelt
    implementiert; beides blockiert die Event-Bus-Anbindung von Paket 33.
14. **WhatsApp `rvg_calc`/`deadline_calc` mit Citation/Grounding versehen**
    (Paket 7A, Task 4 aus dem Originalplan) — automatisierte Rechtsaussagen ohne
    Grounding-Metadaten sind ein Citation-Gate-Lücke im sonst gut abgedeckten
    WhatsApp-Pfad.

## Weitere bestätigte Lücken (niedrigere Priorität, aber im Plan nachzuziehen)

- **Paket 3 Workflow Engine:** kein relationales Datenmodell (`workflow_run` etc.),
  nur generische Brain-Pages mit `type: "workflow"`-Frontmatter.
- **Paket 4 Contract Review:** nur 2-Wege-Vergleich, kein Undo/Redo, kein
  DOCX-Export-Roundtrip.
- **Paket 5 Word Add-in:** reines Scaffold (79 Zeilen), keine echte Funktionalität.
- **Paket 8 Bulk Review:** kein `review_set`-Modell, keine Issue-Coding/Privilege-Flags/
  Sampling/Export-Typen — im Wesentlichen nicht gebaut.
- **Paket 9 Matter Graph:** generische GBrain-Knotentypen statt Legal-Entitäten
  (Mandant/Gegner/Gericht/Richter), kein Similar-Case-Finder.
- **Paket 13 Document Intelligence:** keine Dokumentklassifikation, keine
  Bates-Nummerierung, keine Duplikaterkennung beim Upload.
- **Paket 15 Billing:** kein Trust-/Anderkonto/IOLTA-Ledger, kein
  AI-Spend-Tracking pro Matter/User.
- **Paket 16 Mobile/Offline:** Offline-Sync ohne Konfliktauflösung, Service
  Worker ohne echten Push-Handler.
- **Paket 24 Litigation Analytics:** komplett nicht gebaut (reine
  Rechtsprechungssuche statt Richter-/Outcome-Analytics).
- **Paket 25 Co-Editing:** nur asynchrone Kommentare + SSE-Notifications, kein
  Presence/Cursor/Typing — kein echtes Co-Editing.
- **Paket 30 Knowledge Management:** keine Kuratierungsschicht (Gold-Standard/
  Curated/Knowledge-Owner) über der reinen Precedent-Suche.

## Hinweis zur weiteren Nutzung dieses Plans

Dieses Dokument ist ein **Folge-Plan**, kein Ersatz für
`LEGAL_AI_ACTION_TODO_PLAN_2026-06-20.md`. Wenn ein Punkt hier umgesetzt wird,
sollte der Status zusätzlich im Hauptplan nachgezogen werden (gleiche Disziplin
wie bei P0-SECR-002 in dieser Session: Status nur ändern, wenn durch Lesen des
echten Codes verifiziert, nicht durch Vertrauen in eine vorherige Status-Zeile).
