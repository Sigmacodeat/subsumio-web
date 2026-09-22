# Blueprint: Markt-Parität 2026 — verbleibende Lücken

Stand: 22.09.2026, **Revision 2 am selben Tag** — erweitert um WP-6
(DE-Launch), WP-7 (Harvey/Legora-Parität+) und WP-8 (P2-Backlog) nach dem
Wettbewerbs-Gap-Check gegen help.harvey.ai, legora.com, noxtua.com und
mitdonna.at. Basis: `docs/AUDIT_KANZLEI_OS_WETTBEWERB_2026-09-21.md`,
**neu verifiziert am Code am 22.09.** — der Audit ist bereits teilweise
überholt (die meisten Welle-A-Defekte und mehrere Welle-B-Items sind seit
dem 21./22.09. gelandet). Dieser Blueprint enthält nur **gegen den
aktuellen Code verifizierte** Restlücken.

## Bereits erledigt (verifiziert, nicht mehr im Scope)

Welle A komplett: Legal-Hold-Löschblock (`operations.ts:1706`),
Vier-Augen serverseitig (`api/legal/fristen/second-check`),
unveränderbare Rechnungen + Storno (`invoices/[slug]/route.ts`,
`invoices/[slug]/storno`), 2FA-Pflicht via Session-Claim `must2fa`
(`middleware.ts:498-507`), Word-Add-in `legal_case`, WhatsApp-Buchung mit
Kollisionsprüfung, `resolveCaseJurisdiction`, Dunning pro brainId,
Fristenbuch-Pagination (`listEnginePages`), Time-Entries Write-Retry,
Upload-Persistenz nicht mehr best-effort, Timer-Widget eingebunden,
Connector-Labels („Nur über IT").

Welle B teilweise: Streitwert (`dispute_value`) am Aktenformular,
Aufgaben mit Zuweisung (`dashboard/tasks/page.tsx`), AHK-Tarif
(`src/lib/legal/ahk*.ts`), BMD/RZL-Export (`src/lib/fibu-export/`),
öffentliche Erstanfrage (`/erstanfrage` + `api/intake/public`),
Copilot-Memory, Planning-Panel, Word-Add-in Summarize/Draft.

## In dieser Session geliefert (22.09.2026)

- **WP-1.1 Aktenzeichen-Nummernkreis:** `aktenzeichenPrefix` in
  Kanzlei-Settings (`kanzlei-settings.ts`), automatische Prefix-Auflösung
  in `case-numbering.ts` (`PREFIX-YY-NNNN`), UI-Feld in
  `settings/kanzlei/page.tsx`. Jahres-Reset + Verify-Retry bestehend.
- **WP-1.2 NTG + GGG:** `src/lib/legal/ggg.ts` + `ggg-tariff-data.ts`
  (TP 1/TP 2, Ermäßigungen Anm. 2/3/4, Kfz-Fixgebühr, RIS-gepinnt) und
  `ntg.ts` + `ntg-tariff-data.ts` (Anl. 1 Z 1 Scheibenstaffel, §§ 18–20,
  § 26 Zeitgebühr, 3.633.640-€-Deckel). UI: `GggTariffForm`,
  `NtgTariffForm` im `InvoiceQuickCreateDialog`. 22 Lib-Tests.
- **WP-1.3 Verzugszinsen:** `src/lib/legal/verzugszinsen.ts` +
  `verzugszinsen-data.ts` (§§ 1000/1333 ABGB, § 456/458 UGB mit
  OeNB-Basiszinssatz-Historie und Halbjahres-Segmentierung, act/365 +
  30/360, 40-€-Betreibungspauschale). UI: `VerzugszinsenCalculator`
  übernimmt direkt ins Forderungsformular (`claim-account`). § 1415 ABGB
  Tilgungsreihenfolge dokumentiert. 8 Tests.
- **WP-1.4 camt.053:** `src/lib/camt053.ts` (ISO-20022-Parser, .001.02/.08,
  namespace-agnostisch), Route `POST /api/fibu/camt-import`, geteilter
  Match+Persist-Pfad `fibu-import.server.ts` (auch vom Bank-Feed genutzt),
  Upload-Button in `dashboard/fibu`. 2 Tests.
- **WP-1.5 eTHB:** `buildTreuhandMeldung()` in `trust-accounting.ts` —
  Meldeentwurf an die Treuhandeinrichtung (§ 10a Abs. 2 RAO) bei
  Treuhanderlag > 40.000 € (Schwellenwarnung existierte bereits). 1 Test.
- **WP-2.6 DOCX-Engine:** `src/lib/docx-template.ts` (docxtemplater 3.69.3
  - pizzip 3, `{{platzhalter}}` über Run-Grenzen, `{{#loop}}`-Serienbrief),
    Route `POST /api/legal/docx-fill` (Base64-Template × Akte/Kanzlei-
    Variablen via `resolveKnownVariables` × Empfänger-Zeilen → docx/zip).
    6 Tests.

Verifikation: `bun run verify` grün (tsc ×2, 459 Routen, Grounding,
Tokens, Links, Nested-Interactive); 70 Tests grün.

## Verbleibende Arbeitspakete

### WP-1 Aktenzeichen & Rechnungswesen (P0) — ✅ GELIEFERT (22.09., siehe "In dieser Session geliefert")

1. ~~Echter Aktenzeichen-Nummernkreis~~ ✅ `case-numbering.ts` +
   `aktenzeichenPrefix` in Kanzlei-Settings + UI-Feld.
2. ~~NTG + GGG Tarife~~ ✅ `ggg.ts`/`ntg.ts` + Tarifdaten +
   `GggTariffForm`/`NtgTariffForm` im Rechnungsdialog, 22 Tests.
3. ~~Forderungsbetreibung~~ ✅ teilweise: Verzugszinsen-Rechner
   (`verzugszinsen.ts`, §§ 1000/1333 ABGB, § 456/458 UGB, OeNB-Historie,
   40-€-Betreibungspauschale, § 1415 ABGB Tilgungsreihenfolge) +
   Übernahme ins Forderungsformular. **Rest offen:** Mahnklage-/
   Exekutions-Vorbereitung (EKV-Antragsdaten), Ratenvereinbarung.
4. ~~Bankimport camt.053~~ ✅ `camt053.ts` + `POST /api/fibu/camt-import`
   - `fibu-import.server.ts` (geteilter Match/Persist-Pfad) +
     Upload-Button in `dashboard/fibu`.
5. ~~eTHB-Meldung~~ ✅ `buildTreuhandMeldung()` in `trust-accounting.ts`
   (§ 10a Abs. 2 RAO, >40.000 €).

### WP-2 Vorlagen-Engine & DMS-Tiefe (P0/P1)

6. **DOCX-Vorlagen-Befüllung.** ✅ Engine geliefert (22.09.):
   `src/lib/docx-template.ts` (docxtemplater 3.69.3 + pizzip,
   `{{platzhalter}}` über Run-Grenzen, `{{#loop}}`-Serienbrief),
   `POST /api/legal/docx-fill`. **Rest offen:** UI-Anbindung in
   `templates/page.tsx` (heute nur Zwischenablage), Briefpapier-Overlay,
   Serienbrief-UI (Beteiligten-Auswahl → N Dokumente).
7. ~~**Dateiversionen + Check-in/Check-out.**~~ ✅ **GELÖST** —
   Lock `checked_out_by` im Dokument-Frontmatter, Snapshots als
   `document_version`-Seiten (`legal/doc-versions/<doc>/v<N>`),
   serverseitige 409-Enforcement in `POST /api/pages`, Routen
   `checkout`/`checkin`/`release`/`versions` (mit nicht-destruktivem
   Restore = Sicherheits-Snapshot vorher), Lock-Badge im Akten-
   Dokumenten-Tab + Panel auf der Brain-Dokumentseite.
   **Rest offen:** Binär-Diff (aktuell Text-Snapshot), Zeilen-Diff-UI.
8. ~~**Unterordner/Subakten**~~ ✅ **GELÖST** — `folder`-Feld im
   Dokument-Frontmatter (Unterordner via „/" im Namen), Ordner-Filter
   - Ordner-Badge im Akten-Dokumenten-Tab, „In Ordner ablegen"-Dialog
     mit Vorschlägen bestehender Ordner (`documents-tab.tsx`).
     **Rest offen:** echte Baum-Ansicht statt Filter (Ordner sind
     aktuell flache Facette, „/" im Namen erlaubt Verschachtelung).
9. **Papierkorb-UI** — Engine `restore_page` existiert; braucht Web-Route
   `api/trash` + Liste + Restore-Button (Trash-API-Route existiert bereits
   als Stub? prüfen `api/trash`).
10. ~~**Scan-Eingang & Posteingangsbuch.**~~ ✅ **GELÖST** —
    `dashboard/posteingangsbuch` existierte bereits (Kanäle
    upload/email/whatsapp/erv/scan/portal, Eingangsstempel,
    CSV-Export, Auto-Eintrag bei Upload); ergänzt wurde die
    **deterministische Aktenzuordnung** (`suggestCaseForInbound` in
    `inbound-register.ts`: Aktenzeichen > Parteien > Titel-Tokens,
    als „Vorschlag" markiert, nie still übernommen) + 2 Route-Tests.
11. ~~**PDF-Werkzeuge.**~~ ✅ **GELÖST** — `src/lib/pdf-tools.ts`
    (mergePdfs, stampAttachments mit Anlagennummer + AZ + Seitenzählung,
    mergeStampedAttachments), `POST /api/legal/pdf-tools?op=merge|stamp-merge`,
    UI `dashboard/pdf-tools` (Reihenfolge per Pfeilen, AZ-Feld).
    **Schwärzung** läuft bewusst clientseitig: pdfjs rendert Seiten,
    Nutzer zieht Rahmen, Export rasterisiert zu bildbasierter PDF —
    irreversibel, keine Textschicht, Dokument verlässt die Kanzlei nie.

### WP-3 Mandanten & Kommunikation (P1)

12. ~~**Rechnungen im Portal**~~ ✅ **GELÖST** — `GET
/api/portal/invoices` (token-verifiziert, nur sent/overdue/paid der
    Akte), EPC-QR pro offener Rechnung als Data-URL (GiroCode,
    Banking-App), neuer „Rechnungen"-Tab im Portal mit Status-Badges
    und de-AT-Beträgen. Stripe-Payment-Link-Route (`fibu/payment-links`)
    existiert bereits für Kartenzahlung.
13. ~~**Fragebögen im Portal**~~ ✅ **GELÖST** — `src/lib/questionnaires.ts`
    (text/textarea/date/select/checkbox, Pflichtfelder, Immutable-Answers),
    `POST/GET /api/legal/questionnaires` (Kanzlei) + `GET/POST
/api/portal/questionnaires` (Mandant, token-verifiziert),
    Kanzlei-UI `QuestionnairesPanel` im Akten-Overview, Portal-Formular
    im Info-Tab. Antworten landen in `frontmatter.questionnaires`.
14. ~~**Kommunikationsverlauf pro Akte**~~ ✅ **GELÖST** —
    `GET /api/legal/communications?case_slug=` aggregiert Posteingang,
    Postausgang, Portal-Nachrichten und E-Mails (Ethical-Wall-Prüfung via
    `caseAccessForUser`, `Promise.allSettled` für Teilausfall),
    `CommunicationsPanel` im Aktivitäts-Tab mit Kanal-Filter,
    Richtungs-Icons und Zustellstatus.
15. ~~**Öffentliche Terminbuchung**~~ ✅ **GELÖST** —
    `GET/POST /api/booking/public` (anonym, `createPublicHandler`,
    per-IP-Limit + Honeypot), Slot-Generierung via `generateSlots` gegen
    belegte `booking`- UND `appointment`-Seiten (WhatsApp-Flow-Buchungen
    eingeschlossen), serverseitige Re-Verifizierung beim Buchen (409 bei
    Parallelkonflikt), Opt-in via Kanzlei-Settings (`bookingEnabled` +
    Arbeitszeiten/Slot-Länge in den Settings), öffentliche Seite `/termin`,
    Kanzlei-Mail-Benachrichtigung (nie an den Anfragenden).
16. ~~**Nachricht an Mandant als Leistung buchen**~~ ✅ **GELÖST** —
    `POST /api/portal/reply` nimmt optional `bill_minutes` entgegen und
    hängt einen `time_entry` (billable, Anwalt, activity_type=email) an die
    Akte — mit dem Verify-Retry gegen Lost-Updates aus api/time. Antwort-
    Dialog in `/dashboard/communications` mit Checkbox + Minuten-Input;
    Toast meldet „gesendet + verbucht" bzw. warnt bei Billing-Fehler.

### WP-4 Kanzleialltag (P1)

17. **Workflow-Engine „wenn X dann Y".** Trigger (Akte angelegt, Frist <
    N Tage, Rechnung überfällig, Dokument hochgeladen) → Aktionen
    (Aufgabe, Mail, Status). Engine-seitiger Cron-Evaluator + UI-Builder.
    ✅ **Teil geliefert:** Regeln als `automation`-Pages mit 8 Events
    (case.created, case.status_changed, document.uploaded, deadline.created,
    deadline.due_soon, message.received, booking.created, invoice.overdue),
    Payload-Filtern und {platzhalter}-Interpolation; Aktionen create_task /
    notify (SSE) / send_mail / start_workflow. CRUD via `api/automations`,
    UI-Builder `AutomationsPanel` auf `/dashboard/workflows`. Cron-Evaluator
    `api/cron/automations` scannt alle Entity-Pages, dispatcht via
    `dispatchAutomations`, Idempotenz über `fired_keys` (FIFO-Cap 500).
    Fix: `updateAutomation` nutzt POST-merge (Engine hat kein PUT).
18. **KYC ausbauen.** PEP-Liste (OpenSanctions API o.ä.), UN/OFAC-
    Sanktionslisten, Ausweis-Upload + Prüfprotokoll.
    ✅ **Geliefert:** `src/lib/sanctions/` (EU-FSF, UN-SC, OFAC-SDN Parser +
    Store, OpenSanctions-PEP-Screening, Name-Matching), Sync-Cron
    `api/cron/sanctions-sync`, KYC-UI mit § 8b-RAO-Prüfprotokoll
    (Risiko-Faktoren, wirtschaftliche Eigentümer, Sanktionscheck mit
    Listen-Stand/Quelle). Ergänzt: Ausweis-Upload-Control — Scan landet
    via `api.upload.file` als DMS-Dokument in der Akte
    (`identification.document_file_slug`, § 8b Abs. 5 RAO).
19. **Kalender 2-Wege pro Nutzer.** msgraph.ts + outlook/calendar-Routen
    existieren — von „ein Postfach/Admin" auf pro-Nutzer-OAuth heben.
    ✅ **Geliefert:** Delegierter OAuth-Flow (`api/outlook/connect` +
    `callback` mit State-Cookie/Timing-Safe-Compare, `disconnect`,
    `status`), Tokens verschlüsselt im User-Store (`ms365*` in
    SENSITIVE_USER_FIELDS), Auto-Refresh. Rückrichtung: `calendar/create`
    schreibt bei verbundenem Account in den persönlichen Kalender
    (`/me/events`), sonst App-Level-Fallback; Cron `outlook-user-sync`
    spiegelt `/me/calendarView` pro Nutzer (Slug mit User-ID) und pusht
    geflaggte Termine nach. Settings-Card „Outlook-Kalender (persönlich)".
20. **CTI.** Webhook für Placetel/sipgate/3CX: eingehender Ruf →
    Anruferkennung → Akt-Öffnen + Telefonnotiz mit Timer.
21. **Outlook-Add-in: Anhänge ablegen** (Mail-Anhänge → Akt-DMS).
22. **Native Store-Apps.** Capacitor-Gerüst existiert; iOS-/Android-
    Projekte anlegen, Push, Biometrie, Share-Extension.

### WP-5 KI-Parität Harvey/Legora (P1/P2)

23. **Copilot natives Tool-Use ausbauen.** Tool-Route mit Zod-Schemas +
    Confirmation-Flow existiert (`api/copilot/tools`) — alle
    Kanzlei-Aktionen als Tools abbilden (Akte anlegen, Frist setzen,
    Rechnung entwerfen, Vorlage rendern, Registerabfrage-Hook).
24. **Plan-Ansicht verdrahten.** `planning-mode-panel.tsx` existiert —
    mit echten Agent-Läufen verbinden (sichtbarer Plan, Unterbrechen,
    Umlenken, Freigabe pro Schritt).
25. **„Nächste Schritte" in der Akte.** `rundown-widget.tsx` existiert —
    pro-Akt-Variante ohne Prompt, auf Akten-Detailseite einbinden.
26. **KI-Redlining im Word-Add-in.** Summarize/Draft existieren im
    Add-in — Redline-Endpunkt (`api/legal/*redline*` prüfen) verdrahten,
    Playbook-Auswahl, Tracked-Changes im DOCX.
27. **Antwortentwurf im Outlook-Add-in** (Thread-Zusammenfassung +
    Entwurf als Draft).
28. **Mandatsannahme-Agent.** Website-Chat-Widget → Erstanfrage-Flow →
    Kollisionsprüfung → Terminvorschlag (baut auf `intake/public` +
    conflict-check auf).
29. **MCP-Server für Kanzleien freischalten.** Engine hat MCP;
    API-Key-Scope + Doku + UI-Schalter.
30. **Gedächtnis pro Nutzer fertigstellen.** `copilot-memory` existiert
    — UI-Verwaltung + Injection in Copilot-Kontext + DSGVO-Löschpfad.

### WP-6 DE-Launch-Layer (P0 für Deutschland — NEU, 22.09. Revision 2)

Der bestehende Blueprint ist AT-fokussiert. Für den deutschen Markt fehlen
eigene Arbeitspakete — **kein Eintrag darf auf AT-Logik zurückfallen**
(`resolveCaseJurisdiction` ist die Kanalstelle).

31. **DE-Fristen-Engine.** `src/lib/legal/frist-engine.ts` ist rein AT
    (ZPO/AVG/ABGB, vhfZ). Bauen: §§ 187–193 BGB (Fristbeginn/-ende,
    Wochen-/Monatsfristen), Feiertage **pro Bundesland** (16
    Landeskalender), keine vhfZ — dafür Verlängerungsregeln bei
    Notfristen im ERV. `rechtsraum.ts` ist die bestehende
    Jurisdiktions-Abstraktion — dort `de` durchgängig verdrahten
    (Fristen, Tarife, Texte).
32. **DE-Tarife.** `src/lib/rvg.ts` existiert ✅. Fehlen: **GKG**
    (Gerichtskosten, analog `ggg.ts` — Struktur kann übernommen werden),
    **JVEG** (Zeugen-/Sachverständigenentschädigung),
    Kostenvorschuss-Logik.
33. **beA nativer Versand + eEB.** Import existiert
    (`server/src/core/ingestion/connectors/bea-import.ts`), Versand nur
    über externe Middleware. Bauen: beA-Versand aus dem Akt,
    eEB-Empfangsbekanntmachung mit Frist-Auslösung (automatische
    Fristenerkennung existiert — eEB-Datum als Fristbeginn verdrahten).
    Archivierte UI wieder aktivieren: `src/app/_archive/de/dashboard/bea/`.
34. **DATEV-Strategie klären.** `src/lib/datev-direct.ts` ist ein
    ehrlich gelabelter Platzhalter (kein API-Call; Details:
    `docs/DATEV_DIRECT_INTEGRATION_GAP.md`). Echter Export existiert:
    `datev-export.ts` (CSV für DATEV Unternehmen Online). Optionen:
    DATEV-Partnerschaft (Rechnungsdaten-Service 1.0 / Belegbilder) oder
    CSV-Export als kommunizierten Standard belassen. **Entscheidung
    nötig** — dann ggf. `api/datev-direct` aus `_archive/de/` reaktivieren.
35. **DE-Register.** Handelsregister, Unternehmensregister,
    Insolvenzbekanntmachungen, Vollstreckungsportal — analog zu
    AT-Register-Partnerentscheidung; gemeinsames Adapter-Interface
    (`register-provider.ts`) für beide Märkte bauen.
36. **Anderkonto § 43a BRAO.** AT-Fremdgeld (§ 10a RAO, 40.000-€-Schwelle)
    existiert — DE-Variante mit eigenen Melde-/Prüfregeln ergänzen.
37. **Archivierte DE-Flächen reaktivieren.** `src/app/_archive/de/`
    enthält 12 TSX-Dateien (bea, datev-direct, datev-export,
    fao-tracking) aus dem AT-only-Pilot — Audit durchführen, was
    reaktivierbar ist vs. neu zu bauen.
38. **DE-Corpus fertigstellen.** `DE_LAW_SOURCES_*` (jurisdiction.ts)
    und source-router-Routing sind im Working Tree in Arbeit;
    Vollständigkeits-Audit wie bei AT (`audit-completeness-vs-ris` →
    DE-Äquivalent gegen gesetze-im-internet.de / Landesportale).

### WP-7 Harvey-/Legora-Parität+ (P1/P2 — NEU, 22.09. Revision 2)

Verifiziert gegen help.harvey.ai Release Notes (Sept 2026) und
legora.com. Alles darunter ist **nicht** im bisherigen Blueprint.

39. **Review-Table Agent-Actions.** Harvey (Aug 2026): Bulk-Edit,
    Auto-Gruppierung, Metadaten-Import per natürlicher Sprache direkt
    auf der Review-Tabelle; geführte Tabellenerstellung
    ("beschreibe die Spalten"). `TabularReviewGrid.tsx` hat **keine**
    Agent-Aktionen — Copilot-Tool `tabular_review_action` bauen +
    Assistant-geführter Create-Flow.
40. **Client-runnable Workflows im Portal (Legora-USP).** Mandanten
    führen publizierte Kanzlei-Workflows selbst aus — gegrounded, unter
    Kanzlei-Brand, Prompts/Logik verborgen. Subsumio hat Portal-Chat mit
    Grounding + Adversarial-Guards ✅ (`api/portal/chat/route.ts`) —
    fehlt: Workflow-Publishing (`portal/workflows`), Ausführung pro
    Mandant, Branding. **Alleinstellung im DACH-Markt.**
41. **Monitors-as-a-Service.** `api/cron/regulatory-monitors` +
    Novellen-Erkennung existieren intern ✅. Fehlt: mandantenfähige
    kuratierte Alerts (wiederkehrende Beratungsleistung der Kanzlei —
    Legora verkauft das so), Owner-Zuweisung, Impact-Assessment,
    Versand an Mandanten nach Freigabe. **Monetarisierbares Modul.**
42. **Agent-Tasks (Harvey II Spaces).** Aufgaben an Anwalt **oder
    Agent** zuweisen; Agent erbt Aktenkontext. Tasks mit Zuweisung
    existieren — `assignee_type: "agent"` + Ausführung via Copilot-Tools.
43. **Conversational Workflow-Builder ("Magic Builder").** Workflows per
    Dialog bauen statt Block-Editor — Ergänzung zu WP-4.17: Builder-Chat,
    der den Workflow-JSON erzeugt und live aktualisiert.
44. **Office-Deliverables aus Agenten.** Bearbeitbare DOCX/XLSX/PPTX als
    Agent-Output (Harvey Jun 2026). `exceljs` + `docxtemplater` sind im
    Projekt; `pptxgenjs` prüfen/hinzufügen. `api/work-products` als
    Ablageort existiert bereits.
45. **Agentic Vault Organization.** Vault-Ordner per natürlicher Sprache
    organisieren lassen (Harvey Sep 2026) — baut auf WP-2.8
    (Unterordner) auf; danach umsetzbar.
46. **Externe AI-Präsenz.** Legora hat ein ChatGPT-Enterprise-Plugin.
    WP-5.29 (MCP-Freischaltung) deckt die halbe Strecke — ergänzend:
    öffentliche API-Doku + GPT-Actions-kompatible OpenAPI-Spec.

### WP-8 P2-Backlog — aus dem Audit fallengelassen (NEU, getrackt damit nichts verloren geht)

47. **e-Rechnung-Versand.** Erzeugung existiert (ebInterface/XRechnung/
    ZUGFeRD) — Versand an e-Rechnung.gv.at / PEPPOL fehlt.
48. **Datenexport mit Originaldateien.** JSON-Export existiert;
    Originaldateien + Dokumentenspiegel fehlen (Kanzlei-Wechselszenario,
    Vertrauens-Feature).
49. **Litigation Analytics als Nutzerprodukt.** Modell angelegt —
    Gericht-/Richter-/Outcome-Analytics als konsumierbare Fläche.
50. **Defensible Review-Nachweis.** Review-Sets (Bates, Privilege,
    Redaction) existieren — eDiscovery-Grade braucht Coding-Consistency,
    Sampling, Export-Protokoll.
51. **WhatsApp Mandant bidirektional.** Aktuell nur Ablage +
    Standardantwort; echte Zwei-Wege-Kommunikation mit Consent-Handling.
52. **Self-Hosted-Angebot.** Donna wirbt damit; die Engine kann es —
    Produkt-/Betriebsmodell definieren (kein Code-Item, aber
    Vertriebsrelevant).
53. **Sonstiges P2:** RKSV-Registrierkasse, Rechtsschutz-Deckungsanfrage
    (Versand), Personalmodul (Urlaub/Arbeitszeit), Desktop-Sync/WebDAV,
    Google-Kalender/CalDAV, OneDrive/SharePoint UI-Setup (derzeit CLI,
    Label "Nur über IT"), öffentliche API-Doku, SMS/Video/NPS im Portal,
    Offline-Modus der mobilen App.

## NICHT codierbar — Entscheidung/User-Aufgabe (Welle C)

- **webERV-Versand:** Partnervertrag nötig (MANZ webERV-Service,
  stp.one/WEBSuite, ÖGIZIN). Code-Seite kann erst nach Partnerwahl
  gebaut werden (Adapter-Interface vorbereiten möglich).
- **Registerabfragen** (GB/FB/ZMR/GISA/Ediktsdatei): Abfragedienst-
  Vertrag (MEDIX/MANZ/stp.one). Adapter-Interface vorbereitbar —
  **gemeinsam mit dem DE-Adapter aus WP-6.35 entwerfen** (beide Märkte,
  ein Interface).
- **QES/PDF-AS:** Code vorhanden; braucht PDF-AS-Server-Deployment.
- **ISO 27001/42001, SOC 2:** Prozess, kein Code. Bei DE-Ausbau
  zusätzlich **BSI C5** relevant (Noxtua wirbt damit).
- **DATEV-Partnerschaft:** Voraussetzung für WP-6.34 (echte
  Direktanbindung statt CSV).
- **Verlagsinhalte-Lizenzierung (DE):** Noxtuas Moat sind >130 Mio.
  Dokumente über Verlagskooperationen (C.H.Beck, Nomos, MANZ, Helbing).
  Ohne Fachliteratur-Lizenz ist die DE-Recherche strukturell begrenzt —
  Gespräche früh starten, `LITERATUR_CORPUS.md` ist die Code-Seite.
- **beA-Versand:** Eigene beA-Zertifizierung vs. Middleware-Partner —
  Entscheidung nötig (WP-6.33).

## DoD pro Paket

- Tests grün (`vitest` für lib, Playwright für Flows), `bun run verify`
  clean, i18n DE/AT, Toast bei Mutationen, Loading/Empty/Error-States,
  RBAC + Audit via `createHandler`, Engine-Invarianten eingehalten
  (sourceScopeOpts, kein JSONB-Stringify, Engine-Parity bei
  Schema-Änderung).

## Reihenfolge-Empfehlung

WP-1 ✅ geliefert → WP-2.6 Engine ✅ (UI-Anbindung offen) →
**als Nächstes:** WP-2.7–11 (DMS-Tiefe) + WP-2.6-UI → WP-5.23/25/26
(sichtbare KI-Parität für Vertrieb) → WP-3 → WP-4 → Rest.

**Parallel-Track DE (WP-6):** WP-6.31 (DE-Fristen) + WP-6.32 (GKG/JVEG)

- WP-6.38 (Corpus-Audit) sind reiner Code ohne Partnerabhängigkeit und
  können sofort starten. WP-6.34/35 und beA-Versand blockieren auf
  Vertragsentscheidungen — die gehören **jetzt** auf die Agenda, weil sie
  die längste Vorlaufzeit haben.

**Vertriebs-Differenzierung (WP-7):** WP-7.40 (Client-Workflows im
Portal) und WP-7.41 (Monitors-as-a-Service) sind die Punkte, bei denen
Subsumio Harvey/Legora nicht nur einholt, sondern im DACH-Markt
überholt — beide bauen auf existierenden Bausteinen (Portal-Chat mit
Grounding, regulatory-monitors) auf.
