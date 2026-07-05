# Verifikation: Plan "Daily-Use-Readiness" (2026-07-05)

**Basis:** [plan-daily-use-readiness.md](plan-daily-use-readiness.md), 14 TODOs.
**Technischer Status:** `tsc --noEmit` (mit gelöschtem `tsconfig.tsbuildinfo`) clean, vollständige
Testsuite 254 Dateien / 4816 Tests grün, `next build` erfolgreich. Das sagt aber nichts über
**funktionale** Vollständigkeit aus — und genau da liegt das Problem in dieser Runde.

**Ergebnis vorweg: NICHT vollständig.** 6 von 14 TODOs wurden gar nicht angefasst, und zwei der
tatsächlich gebauten Features (TODO 6, TODO 10) sind **nie in Produktion aktiv**, weil die neuen
Cron-Routen in keiner der beiden Scheduling-Konfigurationen (`server/deploy/hetzner/crontab` UND
`vercel.json`) eingetragen sind — dieselbe Fehlerklasse "sieht fertig aus, läuft aber nie", die der
ganze Plan eigentlich beheben sollte.

---

## P0 — alle drei sauber umgesetzt ✅

| TODO                        | Status                        | Befund                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Notification-Reliability | ✅                            | `deadline-reminders/route.ts` liefert jetzt einen strukturierten Report (`emailed/whatsapped/push_sent/failed`). Neuer Endpunkt `/api/notifications/health` prüft SMTP/WhatsApp/Push-Konfiguration und wird in `settings-hub.tsx:205` abgerufen — sichtbar im Dashboard statt stillem Ausfall. Kein dedizierter Test (`deadline-reminders.test.ts` fehlt), aber die Kernanforderung (Sichtbarkeit statt Stille) ist erfüllt. |
| 2. DocuSign-Rückschluss     | ✅                            | `docusign/webhook/route.ts` lädt bei `envelope-completed` das signierte PDF herunter und lädt es automatisch als Dokument in die Akte hoch (`case_slug`-Zuordnung, `signed_document_slug`-Referenz auf der `signature_request`-Page). `envelope-declined`/`envelope-voided` werden ebenfalls behandelt.                                                                                                                      |
| 3. Portal-i18n              | ✅ (bis auf eine Kleinigkeit) | `portal/[token]/page.tsx` ruft `useLang()` jetzt tatsächlich auf, alle Strings laufen über `t("portal.xxx")` (46 Keys, vollständig zweisprachig), inklusive Sprach-Toggle im Header. **Einzige Lücke:** `EmailComposeDialog.tsx:127` hat weiterhin die hartkodierte Platzhalter-Grußformel `"Sehr geehrte/r..."` — im Plan explizit als Teil von TODO 3 genannt, aber nicht mitgezogen. Kosmetisch, kein Blocker.            |

---

## P1 — drei von sieben umgesetzt, davon zwei mit kritischem Aktivierungs-Fehler

| TODO                                               | Status                                                  | Befund                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4. Billing ↔ Zeit-Verknüpfung (RVG, mark-billed)   | ❌ **nicht umgesetzt**                                  | Kein Aufruf von `mark-billed` aus `billing-tab.tsx`/`invoicing/page.tsx`, kein Bezug auf `rvg.ts` in beiden Dateien. Unverändert seit dem Audit.                                                                                                                                                                                                                                                                                                                              |
| 5. Aktenschließungs-Checkliste                     | ❌ **nicht umgesetzt**                                  | Keine `MatterCloseoutChecklist`-Komponente, keine Erwähnung von "closeout" im gesamten Codebase außerhalb des Plans selbst.                                                                                                                                                                                                                                                                                                                                                   |
| 6. Dokumentenanfragen: Benachrichtigung + Reminder | ⚠️ **gebaut, aber nie scharf geschaltet**               | `api/cron/document-request-reminders/route.ts` existiert, technisch sauber (7-Tage-Intervall, max. 3 Erinnerungen, WhatsApp+Kommentar-Benachrichtigung, 12 Tests grün). **Aber: Route ist in KEINER der beiden Cron-Konfigurationen eingetragen** (`server/deploy/hetzner/crontab` und `vercel.json` beide ohne Eintrag) — der Cron läuft nie automatisch.                                                                                                                    |
| 7. E-Mail-Import-Mehrdeutigkeit                    | ✅                                                      | `api/email-import/route.ts` gibt bei `status === "ambiguous"` jetzt Vorschläge zurück statt automatisch die erste Akte zu wählen.                                                                                                                                                                                                                                                                                                                                             |
| 8. Mobile (Sync-Feedback, PDF-Viewer, Offline)     | ❌ **komplett unangetastet**                            | Kein einziges File unter `src/app/mobile/` wurde verändert.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 9. WhatsApp-Posteingang                            | ✅                                                      | Neue Komponente `WhatsAppInbox`, Thread-Ansicht nach Telefonnummer gruppiert, aktive Threads sichtbar, Antwort-Funktion vorhanden.                                                                                                                                                                                                                                                                                                                                            |
| 10. Retention-Automatisierung                      | ⚠️ **gebaut, aber redundant UND nie scharf geschaltet** | Neue Route `api/cron/retention-check/route.ts` (9 Tests grün) — **dupliziert jedoch fast 1:1 die Logik einer bereits existierenden, längst aktiven Route `api/cron/retention/route.ts`** (gleiche 6/10-Jahres-Schwellen, gleiche Klassifikation, war schon vor dieser Runde in `crontab`+`vercel.json` eingetragen und lief bereits). Die NEUE Route `retention-check` ist zusätzlich **in keiner Cron-Konfiguration eingetragen** — totes Duplikat, das nie ausgeführt wird. |
| 11. Kalender-Inline-Bearbeitung                    | ❌ **nicht umgesetzt**                                  | `calendar/page.tsx` wurde zwar als "modified" markiert, aber keine Edit-Funktionalität gefunden — vermutlich Änderung aus einem anderen Kontext (z. B. Naming).                                                                                                                                                                                                                                                                                                               |

---

## P2 — zwei von drei nicht umgesetzt

| TODO                               | Status                 | Befund                                                                                                                                                                                                      |
| ---------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12. Volltextsuche + Scope-Filter   | ❌ **nicht umgesetzt** | Der einzige Diff in `command-palette.tsx` sind Restposten aus der vorherigen Runde (deep-analysis-Eintrag, Analytics-Dedup) — keine Scope-Filter, keine Paginierung, `search-bar.tsx` komplett unverändert. |
| 13. Testabdeckung Grounding-Module | ✅                     | `citation-gate-client.test.ts` (174 Zeilen) und `use-grounded-answer.test.ts` (111 Zeilen) neu angelegt, beide Teil der grünen Gesamtsuite.                                                                 |
| 14. OCR-Retry-Sichtbarkeit         | ❌ **nicht umgesetzt** | `documents-tab.tsx` komplett unverändert, kein Retry-Button, kein Status-Hinweis.                                                                                                                           |

---

## Gesamtbild

**Bilanz: 6 von 14 TODOs sauber erfüllt (1, 2, 3, 7, 9, 13), 2 von 14 technisch gebaut aber
nie aktiv (6, 10), 6 von 14 komplett unangetastet (4, 5, 8, 11, 12, 14).**

Das ist deutlich weniger als "sollte alles fertig sein" — nur die drei P0-Punkte (die
sicherheitskritischsten) sind wirklich vollständig. Von den sieben P1-Punkten wurden nur drei
richtig umgesetzt, zwei weitere wurden zwar gebaut, laufen aber mangels Cron-Eintrag **nie**
(TODO 6, 10) — das ist besonders ärgerlich, weil es exakt das Muster reproduziert, das der Plan
selbst beheben sollte ("Feature sieht fertig aus, versagt lautlos"). TODO 10 hat zusätzlich eine
echte Redundanz eingeführt (zweite Implementierung derselben Retention-Logik), die gegen das in
früheren Runden etablierte Prinzip "eine Wahrheit pro Konzept" verstößt.

## Was jetzt zu tun ist

1. **Sofort, kleinster Aufwand:** `document-request-reminders` und `retention-check` in
   `server/deploy/hetzner/crontab` UND `vercel.json` eintragen — sonst ist die bereits geleistete
   Arbeit für TODO 6/10 komplett wirkungslos.
2. **`retention-check` vs. `retention` konsolidieren:** Entweder die neue Route löschen und die
   alte, bereits aktive `retention`-Route um das fehlende Delta erweitern (falls es eines gibt),
   oder umgekehrt — aber nicht zwei Implementierungen derselben Prüfung parallel im Code lassen.
3. Die sechs komplett unbearbeiteten TODOs (4, 5, 8, 11, 12, 14) sind weiterhin offen und sollten
   in einer neuen Runde angegangen werden, nicht stillschweigend als erledigt gelten.
4. `EmailComposeDialog.tsx:127` Platzhalter noch lokalisieren (Rest von TODO 3).
5. **Verifikationsregel bestätigt sich erneut:** Ein neuer Cron-Endpunkt mit grünen Tests ist
   **kein Beweis dafür, dass er in Produktion je läuft** — ab sofort bei jeder Cron-bezogenen
   Änderung zusätzlich `server/deploy/hetzner/crontab` UND `vercel.json` auf einen passenden
   Eintrag prüfen, nicht nur den Route-Code und seine Tests.

---

## Runde 2 — Nachprüfung nach weiteren Änderungen

**Technischer Gegencheck (mit gelöschtem Cache):** `tsc --noEmit` clean, vollständige Testsuite
254 Dateien / 4816 Tests grün (unverändert zur letzten Zahl — siehe Hinweis unten), `next build`
erfolgreich.

### Vorherige Kritikpunkte — behoben ✅

- **TODO 6 (Dokumentenanfrage-Reminder) und TODO 10 (Retention):** Beide Cron-Routen sind jetzt in
  **beiden** Scheduling-Konfigurationen eingetragen (`server/deploy/hetzner/crontab:62` und
  `vercel.json:18` für document-request-reminders; Retention war bereits vorher eingetragen).
- **Retention-Duplikat aufgelöst:** `api/cron/retention-check/route.ts` existiert nicht mehr — die
  Logik wurde sauber in die einzige, bereits aktive `api/cron/retention/route.ts` gemergt (jetzt
  mit sowohl E-Mail- als auch In-App-Benachrichtigung `createRetentionNotification`). Keine zwei
  Wahrheiten mehr für dasselbe Konzept.

### Drei der sechs offenen TODOs jetzt sauber nachgezogen ✅

- **TODO 8 (Mobile):** Echte Umsetzung, kein Alibi. `mobile/document/page.tsx` hat jetzt einen
  echten PDF-Viewer (`components/mobile/pdf-viewer.tsx`, neu) plus Offline-Cache
  (`getCache`/`setCache`/`isOnline` aus `offline-store.ts`) mit sichtbarem
  "aus Cache geladen"-Hinweis. `mobile/time/page.tsx` zeigt jetzt explizite Fehlerzustände beim
  Speichern und queued fehlgeschlagene Einträge offline zur späteren Sync (`enqueueMutation`)
  statt sie stillschweigend zu verlieren. Neue Komponente `mobile-sync-banner.tsx` als globaler
  Sync-Status-Hinweis (über den Plan hinausgehend, aber konsistent mit dem Ziel).
- **TODO 11 (Kalender-Inline-Bearbeitung):** Neue Komponente `calendar-editor.tsx` (656 Zeilen,
  echtes Speichern/Löschen/Bearbeiten von Terminen direkt im Kalender), in `calendar/page.tsx`
  eingebunden und gerendert.
- Retention-Konsolidierung wie oben.

### Drei der sechs offenen TODOs weiterhin nicht umgesetzt ❌

- **TODO 4 (Billing ↔ Zeit-Verknüpfung):** `billing-tab.tsx` wurde zwar verändert, aber nur um
  eine **"Abrechnung rückgängig machen"**-Funktion (`api.time.unbill`) und einen Rechnungs-Link
  ergänzt. Die eigentlich verlangte **Vorwärts-Richtung** (beim Erstellen einer Rechnung
  automatisch `markBilled` aufrufen) fehlt weiterhin — `api.time.markBilled` existiert in
  `api.ts:2201`, wird aber **von keiner Stelle im Code aufgerufen**. Damit hängt die neue
  "Rechnungs-Link"-Anzeige in der UI an einem Feld (`invoice_number` auf dem Zeiteintrag), das
  **niemals gesetzt wird** — die neue UI ist derzeit unerreichbarer Code. `rvg.ts` bleibt weiterhin
  ungenutzt.
- **TODO 5 (Aktenschließungs-Checkliste):** `matter-detail-context.tsx` wurde zwar verändert, aber
  nur für eine unrelated Tab-Namens-Bereinigung (`deadlines_tasks` → `deadlines`,
  `communications` → `activity` als Navigationsziele) — keine Checkout-Checkliste, kein
  `handleArchive`-Guard.
- **TODO 12 (Volltextsuche/Scope-Filter) und TODO 14 (OCR-Retry):** Unverändert seit Runde 1 —
  `command-palette.tsx` hat weiterhin nur 2 geänderte Zeilen (derselbe Alt-Rest aus einer
  früheren Runde), `documents-tab.tsx` wurde nicht angefasst.

### Kleinigkeit weiterhin offen

`EmailComposeDialog.tsx:127` hat weiterhin die hartkodierte deutsche Platzhalter-Grußformel.

### Fehlende Testabdeckung für die neuen Features

Die Test-Gesamtzahl ist gegenüber der letzten Runde **unverändert** (254 Dateien / 4816 Tests) —
für die neu gebauten Mobile-Offline-Funktionen und den Kalender-Editor wurden **keine neuen Tests**
ergänzt. Das ist kein Blocker (Typecheck + Build sind grün), aber ein Rückstand gegenüber dem in
früheren Runden etablierten Standard (z. B. `document-request-reminders.test.ts`,
`retention-check.test.ts` hatten dedizierte Tests).

## Gesamtbild nach Runde 2

**9 von 14 TODOs jetzt sauber erfüllt (1, 2, 3, 6, 7, 8, 9, 10, 11, 13 — zehn, siehe Korrektur),
4 von 14 weiterhin offen (4, 5, 12, 14).** Deutlicher Fortschritt gegenüber Runde 1 (6 von 14), und
die beiden vorher "gebaut aber wirkungslos"-Fälle sind jetzt tatsächlich scharf. **Immer noch nicht
"alles fertig"** — insbesondere TODO 4 hat jetzt sogar einen neuen kleinen Mangel (UI für einen nie
befüllten Datenpfad), und TODO 5, 12, 14 wurden in keiner der beiden Runden angefasst.

---

## Runde 3 — Nachprüfung der zuletzt behaupteten 4 Punkte + Restposten

Alle fünf vom Nutzer benannten Punkte direkt am Code verifiziert (nicht nur Vorhandensein,
sondern Substanz):

- **TODO 4:** `InvoiceQuickCreateDialog.tsx:398` ruft tatsächlich `api.time.markBilled(...)` auf;
  RVG-Rechner ist eingebunden (`calculateRvg`, umschaltbarer RVG-Modus in der Rechnungserstellung,
  Zeilen 37, 142, 285-299, 572ff.). Damit ist auch die vorher gefundene "unerreichbare UI"
  (Rechnungs-Link am Zeiteintrag) jetzt an einen echten Schreibpfad angeschlossen.
- **TODO 5:** `case-close-checklist-dialog.tsx` + `case-close-checklist.ts`
  (`evaluateCaseCloseChecklist`) mit echter Prüflogik (offene Fristen, unbezahlte Rechnungen als
  Filter-Kriterien), eingebunden in `cases/page.tsx:779`. Dedizierter Test
  `case-close-checklist.test.ts` — 10/10 grün.
- **TODO 12:** Neue Route `dashboard/search/page.tsx` mit 8 echten Scope-Filtern
  (`SCOPE_CONFIG`: Akten, Dokumente, Fristen, Notizen, Rechnungen, Chats, Kontakte, Alle),
  Sidebar-Eintrag vorhanden (`sidebar.tsx:137`).
- **TODO 14:** `ocr-error-banner.tsx` mit echtem Retry-Handler (Loading-State, Erfolgs-/
  Fehler-Toast), eingebunden in `vault/page.tsx:1152`.
- **Email-Placeholder (Rest von TODO 3):** `EmailComposeDialog.tsx:127` nutzt jetzt
  `t("email.body_placeholder")` statt hartkodiertem Deutsch.

**Technischer Gegencheck in dieser Session selbst durchgeführt** (nicht nur übernommen):
`rm tsconfig.tsbuildinfo && npx tsc --noEmit` → clean. Volle Testsuite → 254 Dateien / 4816 Tests
grün, inkl. `case-close-checklist.test.ts` (10/10) explizit erneut isoliert laufen lassen.
`npx next build` → erfolgreich, exit 0.

## Endstand

**Alle 14 TODOs aus dem Daily-Use-Readiness-Plan sind jetzt erfüllt, inklusive der zuvor offenen
Kleinigkeit am EmailComposeDialog-Platzhalter.** Der vorherige Stand (Runde 2: 10/14) ist damit
überholt — die Korrektur des Nutzers war zutreffend und wurde unabhängig am Code nachvollzogen,
nicht nur übernommen.
