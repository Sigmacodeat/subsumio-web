# Umsetzungsplan: Daily-Use-Readiness — vollständige Workflow-Abdeckung

**Auftrag:** Keine halben Sachen, Markt-Reife-Anspruch. Basis: drei parallele Codebase-Scans
(Akten-Lebenszyklus, mandantenseitige Kommunikation, Benachrichtigungen/Mobile/Tests), die auf
den bisherigen Runden aufbauen (Fristensystem, Notfrist-Enforcement, Vertrauens-Standard,
Settings-Hub — alle bereits verifiziert fertig).

**Leitprinzip dieser Runde:** Die gefährlichste Fehlerklasse ist nicht "Feature fehlt", sondern
**"Feature sieht fertig aus, versagt aber lautlos"** — genau das Muster, das schon beim
Notfrist-Guard in Runde 1 der Fall war (UI-Sperre da, Server-Guard am falschen Datenpfad). Diese
Runde hat drei neue Fälle derselben Klasse gefunden: stille Erinnerungs-Ausfälle, ein
DocuSign-Status, der nie mit der Realität synchronisiert wird, und ein Mandantenportal, das die
i18n-Infrastruktur importiert, aber nie benutzt. Diese Fälle stehen bewusst in P0, noch vor reinen
Vervollständigungen.

---

## P0 — Stille Fehlerklassen (Sicherheits- und Vertrauensrisiko)

### TODO 1 — Deadline-Reminder-Cron: sichtbares Fehlschlagen statt stillem Ausfall

**Fund:** `src/app/api/cron/deadline-reminders/route.ts` prüft `smtpConfigured` nur beim
Cron-Start (Zeile ~71); fällt SMTP mitten im Lauf aus, verschwindet die E-Mail-Zustellung lautlos
— keine In-App-Notiz, kein Fehler im Dashboard. Zeile ~269: `if (!notificationSent) continue;`
markiert die Erinnerung dann gar nicht als gesendet (führt zu Wiederholung, aber ohne Alarm nach
außen). WhatsApp-Zustellung (Zeile ~216) setzt eine verknüpfte Telefon-Identität voraus — ist sie
nicht hinterlegt, gibt es 0 Zustellung ohne jede Rückmeldung. Push (APNs/FCM, `lib/push-send.ts`
Zeilen 53-62) ist bei fehlender Konfiguration ein stiller No-Op.

Der bestehende **Rundown-Cron** (`api/cron/rundown/route.ts`, Zeilen 146-245) macht es bereits
richtig: er zählt `emailed`/`whatsapped` explizit und gibt das zurück. Der Deadline-Cron nicht —
das ist die Vorlage, die übernommen werden muss.

**Umsetzung:**

1. `deadline-reminders/route.ts`: Analog zum Rundown-Cron einen strukturierten Ergebnis-Report
   zurückgeben: `{ total, emailed, whatsapped, push_sent, failed: [{ deadline_id, reason }] }`.
2. Bei `failed.length > 0`: einen Eintrag in einer neuen `notification_failures`-Brain-Page-Art
   anlegen (oder bestehende Audit-Log-Infrastruktur aus `audit`-Route nutzen), damit ein
   fehlgeschlagener Versand **sichtbar im Dashboard** landet (Kandidat: neue Insight-Karte über die
   bestehende Insights-Engine aus der vorherigen Runde — `deadline_risk`-Typ existiert bereits,
   um einen `notification_failure`-Typ erweitern).
3. Health-Check ergänzen (`api/cron/health/route.ts`, bereits vorhanden — dort einbauen):
   SMTP/WhatsApp/Push-Konfigurationsstatus prüfen und bei fehlender Konfiguration eine
   Warnung auf der Settings-Hub-Kachel für Benachrichtigungen anzeigen (nicht erst beim
   nächsten fehlgeschlagenen Versand).
4. Test: `deadline-reminders.test.ts` (neu) — Fall "SMTP wirft Fehler" → Report zeigt `failed`
   mit Grund, kein stiller Fehlschlag.

**Fertig wenn:** Ein Lawyer sieht im Dashboard aktiv, wenn eine Fristerinnerung nicht zugestellt
werden konnte — nicht erst, wenn die Frist bereits verstrichen ist.

### TODO 2 — DocuSign-Rückschluss: Signatur-Status muss mit der Realität synchron sein

**Fund:** `src/app/dashboard/signature/page.tsx` (Zeile ~204, ~296) markiert eine Anfrage manuell
als "gesendet", der tatsächliche Status lebt aber ausschließlich bei DocuSign. Der Webhook-Handler
(`src/app/api/docusign/webhook/route.ts`) empfängt signed/declined-Events, aber es gibt **keinen
bestätigten Rückschluss**, der (a) den signierten Vertrag automatisch als Dokument in die Akte
zurückspielt und (b) den `signature_request`-Status in der Brain-Page aktualisiert. Das bedeutet:
ein Anwalt kann im Dashboard "gesendet" sehen, obwohl der Mandant längst unterschrieben hat — oder
umgekehrt fälschlich "signiert" annehmen.

**Umsetzung:**

1. `docusign/webhook/route.ts` erweitern: bei `envelope-completed`-Event das signierte PDF per
   DocuSign-API abrufen (`GET /envelopes/{id}/documents/combined`), als neues Dokument in die
   zugehörige Akte hochladen (bestehender Upload-Pfad aus `documents-tab.tsx` wiederverwenden),
   und die `signature_request`-Page auf `status: "signed", signed_at, signed_document_slug`
   aktualisieren.
2. Bei `envelope-declined`: Status `declined` setzen + eine Insight-Karte (Insights-Engine aus
   vorheriger Runde) im Akt anzeigen ("Signatur abgelehnt — Rücksprache nötig").
3. `signature/page.tsx`: Statusanzeige direkt aus der aktualisierten Brain-Page lesen, kein reines
   "wurde gesendet"-Tracking mehr als einzige Quelle.
4. Test: Mock-Webhook-Payload für `envelope-completed` → Dokument erscheint in der Akte,
   Status-Feld korrekt gesetzt.

**Fertig wenn:** Signiert ein Mandant über DocuSign, erscheint das unterschriebene Dokument
automatisch in der Akte, ohne dass der Anwalt manuell nachschauen oder synchronisieren muss.

### TODO 3 — Mandantenportal: tatsächlich zweisprachig, nicht nur mit importiertem Hook

**Fund:** `src/app/portal/[token]/page.tsx` importiert `useLang()` (Zeile 18), **ruft die Funktion
aber nie auf** — alle Labels sind hartkodiertes Deutsch ("Mandanten-Portal", "Sachverhalt",
"Ansprüche", "Fristen", "Nachrichten", "Hochladen", "Erforderlich", Zeilen 326-601). Das ist die
einzige **extern, mandantenseitig** sichtbare Oberfläche des Produkts — und sie ist komplett
unbenutzbar für nicht-deutschsprachige Mandanten, obwohl das Produkt an anderer Stelle
Englisch-Support anbietet. Betrifft auch `EmailComposeDialog.tsx` (Zeile 127, hartkodierte
Grußformel) und weitere client-facing Screens (Document-Requests, Signature, WhatsApp-Seiten
laut Scan, dort aber intern/Anwalts-Ansicht — niedrigere Priorität als das externe Portal).

**Umsetzung:**

1. `portal/[token]/page.tsx`: `useLang()` tatsächlich aufrufen, alle hartkodierten Strings durch
   `t("portal.xxx")`-Keys ersetzen, neue Keys in `content/dashboard.ts` mit vollständigem `de`+`en`
   Paar anlegen (Muster aus den bereits sauber zweisprachigen `settings.tier_*`-Einträgen
   übernehmen — die Infrastruktur ist nachweislich intakt, nur hier nicht genutzt).
2. Sprachwahl im Portal: da der externe Mandant sich nicht im internen Locale-Kontext befindet,
   Sprachauswahl aus dem Token-Kontext ableiten (Feld `client_locale` auf der Case-Frontmatter,
   Default `de`) oder ein sichtbares Sprach-Toggle im Portal-Header anzeigen.
3. `EmailComposeDialog.tsx`: Platzhalter-Grußformel über `t()` lokalisieren.
4. Test: Rendering-Test für `portal/[token]/page.tsx` mit `lang=en` → keine deutschen
   Rest-Strings mehr im Output (Grep-Assertion gegen bekannte deutsche Marker-Wörter).

**Fertig wenn:** Ein englischsprachiger Mandant kann das Portal vollständig auf Englisch nutzen,
nicht nur die interne Anwalts-Oberfläche.

---

## P1 — Workflow-Lücken (tägliche Reibung, aber nicht sicherheitskritisch)

### TODO 4 — Abrechnungsabschluss: Zeit ↔ Rechnung tatsächlich verknüpfen

**Fund:** `time-tracking/page.tsx` zeigt Zeiteinträge dauerhaft als "unbilled" an, selbst nachdem
eine Rechnung erstellt und bezahlt wurde — der Endpunkt `api/time/mark-billed/route.ts`
**existiert bereits, wird aber nie aufgerufen.** `billing-tab.tsx` (Zeile ~481-504) hat einen
"Rechnung erstellen"-Button, aber keinen Rückkanal, der die verwendeten Zeiteinträge als
abgerechnet markiert. `src/lib/rvg.ts` (vollständiger §13-RVG-Rechner) wird nirgends aus
Invoicing/Billing heraus aufgerufen — steht isoliert als ungenutztes Utility.

**Umsetzung:**

1. Beim Erstellen einer Rechnung aus `billing-tab.tsx`/`invoicing/page.tsx`: die einbezogenen
   Zeiteinträge/Auslagen sammeln und nach erfolgreichem Speichern automatisch
   `POST /api/time/mark-billed` mit den betroffenen IDs aufrufen (Endpunkt existiert, nur die
   UI-Seite fehlt).
2. `rvg.ts`-Rechner als optionalen Berechnungsschritt in die Rechnungserstellung einbinden (Toggle
   "nach RVG berechnen" vs. Stundensatz — Kanzlei-Einstellung aus `settings/kanzlei` als Default).
3. Test: Rechnung erstellen → zugehörige Zeiteinträge zeigen `billed: true` in nachfolgender
   Abfrage.

**Fertig wenn:** Zeittracking- und Rechnungsstatus zeigen ohne manuellen Abgleich denselben Stand.

### TODO 5 — Aktenschließung: Checkliste vor dem Archivieren

**Fund:** Es gibt keine "Bereit zum Schließen?"-Prüfung. Eine Akte kann archiviert werden, obwohl
noch offene Fristen, unbezahlte/nicht erstellte Rechnungen oder ungelöste Konfliktprüfungs-Hinweise
bestehen. Die bestehende "Institutionen-Checkliste" im Overview-Tab ist ein anderes Feature
(externe Meldepflichten), keine Abschluss-Checkliste.

**Umsetzung:**

1. Neue Komponente `MatterCloseoutChecklist` (im Overview- oder Strategy-Tab, dort wo bereits die
   Institutionen-Checkliste sitzt): prüft beim Klick auf "Archivieren" automatisch: offene
   Fristen (aus dem Fristen-Read-Model), unbezahlte Rechnungen (`status !== "paid"`), unbestätigte
   Vier-Augen-Kontrollen, offene Dokumentenanfragen. Zeigt eine Warnliste, Archivierung bleibt
   möglich (kein Hard-Block, aber informierte Entscheidung), mit explizitem "Trotzdem
   archivieren"-Bestätigungsschritt, wenn Warnungen vorliegen.
2. `matter-detail-context.tsx`: `handleArchive`-Funktion (aktuell nicht auffindbar neben
   `handleRestore` — vermutlich Aufruf direkt im Status-Dialog) um den Checklisten-Aufruf
   ergänzen.
3. Test: Akte mit offener kritischer Frist → Archivieren zeigt Warnung, erfordert Bestätigung.

**Fertig wenn:** Ein Anwalt kann eine Akte nicht mehr versehentlich mit offenen Fristen oder
unbezahlten Rechnungen unbemerkt schließen.

### TODO 6 — Dokumentenanfragen: Benachrichtigung beim Versand + Erinnerung bei Nicht-Reaktion

**Fund:** Status-Wechsel auf "gesendet" (`document-requests/page.tsx`) löst **keine** tatsächliche
Mandanten-Benachrichtigung aus (kein E-Mail/WhatsApp/Portal-Alert) — nur ein Frontmatter-Update.
Keine automatische Erinnerung, wenn ein Mandant nach X Tagen nicht reagiert hat.

**Umsetzung:**

1. Beim Setzen von `status: "sent"`: falls Portal-Link aktiviert ist, automatisch eine
   E-Mail/WhatsApp-Benachrichtigung an den hinterlegten Mandanten-Kontakt auslösen (bestehende
   `EmailComposeDialog`/WhatsApp-Sendepfade wiederverwenden, nicht neu bauen).
2. Neuer Cron `api/cron/document-request-reminders/route.ts` (Muster: bestehender
   `deadline-reminders`-Cron): Anfragen, die seit >7 Tagen `sent`/`partially_fulfilled` ohne Update
   sind, erhalten eine automatische Erinnerung (max. 2 Erinnerungen, dann Eskalation als Task an
   den zuständigen Anwalt statt weiterer Mandanten-Nachrichten).
3. Test: Anfrage mit `sent_at` vor 8 Tagen ohne Fulfillment → Cron erzeugt Erinnerung + Log-Eintrag.

**Fertig wenn:** Eine gesendete Dokumentenanfrage braucht keine manuelle Nachverfolgung mehr durch
den Anwalt.

### TODO 7 — E-Mail-Antwort-Threading und Import-Mehrdeutigkeit

**Fund:** Gesendete E-Mails erzeugen keinen Antwort-Thread zurück zur Akte — Antworten müssen
manuell über `email-import` importiert werden. Dort matched die Fallback-Logik
(`api/email-import/route.ts`, Zeilen ~27-49) bei mehrdeutigen Treffern per `.find()` **stillschweigend
die erste passende Akte** — falsche Zuordnung ohne Rückfrage möglich.

**Umsetzung:**

1. Ambiguität beheben: Findet der Import mehr als eine passende Akte, **nicht automatisch
   zuordnen** — stattdessen wie bei "kein Treffer" die Vorschlagsliste (existiert bereits für den
   No-Match-Fall) anzeigen und eine explizite Bestätigung durch den Anwalt verlangen.
2. Gesendete E-Mails (`send-email/route.ts`) erhalten ein `Reply-To`, das auf eine
   pro-Akte-eindeutige Adresse oder einen Tracking-Header verweist, sodass eingehende Antworten
   (sofern über denselben Import-Mechanismus verarbeitet) automatisch der richtigen Akte
   zugeordnet werden können, statt erneut über Namens-Fuzzy-Matching zu laufen.
3. Test: Zwei Akten mit identischem Mandantennamen → Import einer E-Mail von diesem Mandanten
   erzwingt Anwalts-Bestätigung statt Auto-Zuordnung.

**Fertig wenn:** Keine E-Mail wird mehr ohne Bestätigung einer falschen Akte zugeordnet.

### TODO 8 — Mobile: Dokumenten-Ansicht und Offline-Grundfunktionen

**Fund:** `mobile/document/page.tsx` zeigt nur Text-Snippets, kein PDF-/Bild-Rendering — für
schnelles Nachlesen eines Vertrags im Gerichtssaal unbrauchbar. Keine der 5 Mobile-Routen hat
Offline-Caching; bei schlechtem WLAN im Gericht liefert jede Suche/Anzeige nichts. Zeiterfassung
(`mobile/time/page.tsx`, Zeilen ~77-106) gibt bei Backend-Fehler keine sichtbare Rückmeldung, ob
der Eintrag synchronisiert wurde.

**Umsetzung (in dieser Reihenfolge, kleinster Aufwand zuerst):**

1. **Sync-Feedback zuerst** (kleinster Aufwand, größter Vertrauensgewinn): Zeiterfassung zeigt
   explizit "gespeichert" / "wird synchronisiert" / "Fehler — erneut versuchen" statt stillem
   Fallback auf Local-Storage.
2. PDF-Viewer für `mobile/document/page.tsx`: vorhandene PDF-Rendering-Bibliothek des Projekts
   (falls im Desktop-Vault bereits verwendet — dort nachschauen und wiederverwenden statt neu
   integrieren) für die mobile Ansicht einbinden.
3. Offline-Grundcache: zuletzt geöffnete Akte + ihre Fristen/Notizen im Service-Worker/IndexedDB
   cachen (Umfang bewusst klein halten: nicht "alles offline", sondern "das, was ich gerade
   angeschaut habe, bleibt lesbar").
4. Test: Zeiterfassung mit simuliertem Netzwerkfehler → UI zeigt Fehlerzustand, kein stiller
   Datenverlust-Eindruck.

**Fertig wenn:** Ein Anwalt kann im Gerichtssaal mit schwachem WLAN mindestens die zuletzt
angesehene Akte lesen und sicher sein, dass eine Zeiterfassung entweder gespeichert wurde oder
sichtbar fehlgeschlagen ist.

### TODO 9 — WhatsApp: Posteingang statt Einweg-Templates

**Fund:** Die WhatsApp-Oberfläche (`whatsapp/page.tsx`) kann Vorlagen versenden und protokolliert
eingehende Events, hat aber **keine Ansicht, um eingehende Mandanten-Nachrichten zu lesen oder zu
beantworten** — faktisch nur ein Broadcast-Werkzeug, kein Zwei-Wege-Kanal, obwohl der Webhook dafür
bereits Daten empfängt.

**Umsetzung:**

1. Neue Thread-Ansicht (Muster: Chat-UI-Komponenten aus `components/chat/` wiederverwenden statt
   neu bauen) auf Basis der bereits geloggten `conversation_event`-Pages, gruppiert nach
   Telefonnummer/Akte.
2. Antwort-Absenden direkt aus der Thread-Ansicht über den bestehenden WhatsApp-Send-Pfad.
3. Test: Eingehendes Webhook-Event für eine Nummer → erscheint als lesbare Nachricht im Thread,
   Antwort-Senden funktioniert.

**Fertig wenn:** Ein Anwalt kann eine WhatsApp-Konversation mit einem Mandanten vollständig
innerhalb des Dashboards führen, nicht nur Vorlagen verschicken.

### TODO 10 — Retention-Automatisierung

**Fund:** `compliance/retention/page.tsx` ist ein manuelles Prüf-Dashboard — Archivierung einer
Akte löst **keine** automatische Fristsetzung für die spätere Löschprüfung aus. Nach mehreren
Jahren muss jemand manuell nachsehen, welche Akten löschreif sind.

**Umsetzung:**

1. Beim Archivieren einer Akte automatisch ein `retention_review_due_at` (archived_at + 6 Jahre,
   konfigurierbar über Kanzlei-Einstellung) auf der Case-Frontmatter setzen.
2. Neuer, in bestehende Cron-Infrastruktur eingebetteter wöchentlicher Check: Akten mit
   überschrittenem `retention_review_due_at` erzeugen eine Insight-Karte/Aufgabe für den
   Compliance-Verantwortlichen — keine automatische Löschung (das bleibt bewusst eine
   Mensch-Entscheidung, siehe Datenschutz-Verantwortung), aber eine aktive Erinnerung statt
   passiver Dashboard-Liste.
3. Test: Akte mit `archived_at` vor 6+ Jahren und ohne Review → erscheint in der
   Compliance-Warnliste.

**Fertig wenn:** Löschreife Akten werden aktiv gemeldet, statt nur bei manuellem Nachschauen
sichtbar zu sein.

### TODO 11 — Kalender: In-UI-Bearbeitung statt nur Einweg-Export

**Fund:** `calendar/page.tsx` ist reine Anzeige; Termine lassen sich nur über den Akte-Tab ändern,
nicht direkt im Kalender. `calendar-export/page.tsx` liefert nur einen `.ics`-Export, keinen
Import/Zwei-Wege-Sync — die Sidebar-Beschriftung "Sync" ist irreführend für ein reines
Export-Feature (siehe auch Naming-Hygiene-Punkt aus der vorherigen Runde).

**Umsetzung:**

1. Direktes Verschieben/Bearbeiten eines Termins aus der Kalenderansicht heraus (Klick auf Termin
   → Inline-Editor, der denselben Schreibpfad wie der Akte-Tab nutzt — keinen zweiten
   Dateneingang schaffen).
2. Sidebar-Label `nav.calendar_export` von "Kalender-Export" belassen (bereits korrekt benannt
   laut letzter Runde) — sicherstellen, dass keine Stelle mehr "Sync" suggeriert, wo nur Export
   passiert.
3. Vollen Zwei-Wege-Sync (Google/Outlook-Kalender-API) als separates, größeres Vorhaben zurückstellen
   (hoher Aufwand, externe OAuth-Integration) — In-UI-Bearbeitung ist der Punkt mit dem besten
   Aufwand/Nutzen-Verhältnis für diese Runde.

**Fertig wenn:** Eine Terminverschiebung durch das Gericht lässt sich direkt im Kalender erfassen,
ohne in den Akte-Tab wechseln zu müssen.

---

## P2 — Vervollständigung (kein Blocker, aber für "perfekt" nötig)

### TODO 12 — Suche: volltextfähig und mit Scope-Filtern

**Fund:** Command-Palette und Suchleiste liefern nur metadatenbasierte Treffer (Titel/Kontakt),
auf 5-8 Ergebnisse pro Kategorie gedeckelt, ohne Filterung nach Dokumenttyp/Akte/Zeitraum. Bei
1000+ Akten/10K+ Dokumenten ein spürbares Skalierungsproblem.

**Umsetzung:** Bestehenden Brain-Volltextindex (bereits für andere Screens vorhanden) auch in der
Command-Palette nutzen, Scope-Selector ("nur diese Akte", "nur Dokumente", "nur Kontakte")
ergänzen, Ergebnis-Deckel durch "mehr laden"-Paginierung ersetzen statt hartem Cutoff.

**Fertig wenn:** Eine Suche nach einem Vertragsbegriff findet Treffer im Dokumenteninhalt, nicht
nur im Titel.

### TODO 13 — Testabdeckung für die zuletzt neu gebauten sicherheitsrelevanten Module

**Fund:** `src/lib/citation-gate-client.ts` und `src/lib/use-grounded-answer.ts` (beide aus der
Vertrauens-Standard-Runde) haben **keine** Testdatei — genau die Module, die die
Zitat-Verifikation für Chat/Rechtsprechung/Strategy-Tab tragen.

**Umsetzung:** `citation-gate-client.test.ts` (Extraktionsregex, Edge Cases: mehrere Zitate im
selben Satz, keine Zitate, unbekannte Gesetzeskürzel) und
`use-grounded-answer.test.ts` (Hook-State-Übergänge: pending → done, pending → error, Reset)
ergänzen.

**Fertig wenn:** Beide Module haben Testabdeckung auf demselben Niveau wie die übrigen
sicherheitskritischen Module (`legal-deadlines.test.ts` als Referenz-Qualität).

### TODO 14 — OCR-Fehlerbehandlung sichtbar machen

**Fund:** Dokumente mit `extraction_status: "ocr_failed"` bleiben ohne jede Handlungsoption in der
Oberfläche hängen — kein Retry-Button, keine manuelle Korrektur-Möglichkeit.

**Umsetzung:** In `documents-tab.tsx` bei `ocr_failed`-Status einen "Erneut versuchen"-Button
sowie einen Hinweis-Link zur manuellen Textkorrektur/Admin-Eskalation ergänzen.

**Fertig wenn:** Ein fehlgeschlagenes OCR-Dokument hat einen sichtbaren nächsten Schritt statt
stillem Stillstand.

---

## Reihenfolge

```
P0 (parallel bearbeitbar, unabhängige Dateien):
  TODO 1 (Notification-Reliability) ── eigener Bereich (Cron + Insights-Erweiterung)
  TODO 2 (DocuSign-Rückschluss)     ── eigener Bereich (Webhook + Dokumenten-Upload)
  TODO 3 (Portal-i18n)              ── eigener Bereich (Content-Keys + Portal-Page)

P1 (nach P0, da einige auf der Insights-Engine/dem Fristen-Read-Model aus früheren Runden aufbauen):
  TODO 4 (Billing-Verknüpfung) → TODO 5 (Closeout-Checkliste, nutzt TODO 4's billed-Status)
  TODO 6 (Doc-Request-Reminder) — unabhängig, kann parallel laufen
  TODO 7 (E-Mail-Threading) — unabhängig
  TODO 8 (Mobile) — unabhängig, Punkt 1 (Sync-Feedback) zuerst als Quick-Win
  TODO 9 (WhatsApp-Posteingang) — unabhängig, größerer Aufwand
  TODO 10 (Retention-Automatisierung) — baut auf TODO 5's Archiv-Trigger auf
  TODO 11 (Kalender-Inline-Edit) — unabhängig

P2 (jederzeit, keine Abhängigkeiten):
  TODO 12, 13, 14 — parallel bearbeitbar
```

**Empfohlener erster Schritt:** P0 komplett — das sind die drei Fälle, in denen das Produkt dem
Anwalt oder dem Mandanten aktiv eine falsche Sicherheit vorgaukelt (Erinnerung kam an / Signatur
ist da / Portal funktioniert), obwohl das nicht stimmt. Das ist dieselbe Fehlerklasse, die im
allerersten Audit-Durchgang beim Notfrist-Guard gefunden wurde — sie verdient dieselbe Priorität.

## Verifikationspflicht für die nächste Runde

Aus den bisherigen Verifikationsrunden gelernt: **immer mit `rm tsconfig.tsbuildinfo` vor
`tsc --noEmit` prüfen** (stale Incremental-Cache maskiert echte Fehler) und **immer zusätzlich
`next build` laufen lassen**, nicht nur Typecheck + Vitest — das ist die einzige verlässliche
Prüfung für Client/Server-Bundling-Fehler wie den `node:fs`-Vorfall aus der vorherigen Runde.
