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
    6 Tests. UI geliefert: `TemplateUseDialog` + `SerienbriefDialog` auf
    `/dashboard/templates`, Briefpapier-Overlay via
    `buildLetterheadFromKanzleiSettings` → `/api/word-export`, Beteiligte
    aus Akte als Serienbrief-Empfänger (Dedupe, Toast-Feedback).

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
   Übernahme ins Forderungsformular. ✅ **Mahnklage-/Exekutions-
   Vorbereitung + Ratenvereinbarung geliefert:** `buildMahnAntrag`/
   `buildExekutionsantrag` (AT: §§ 244 ff. ZPO/EKV + §§ 3 ff. EO,
   DE: §§ 688 ff./750 ff. ZPO — Antragstext + Prüfhinweise),
   InstallmentPlan mit Verfallsklausel/Überfällig-Markierung,
   PATCH-Actions mahnklage/vollstreckung/exekution/ratenplan/rate,
   UI in `dashboard/claim-account` (Antragstext-Vorschau).
4. ~~Bankimport camt.053~~ ✅ `camt053.ts` + `POST /api/fibu/camt-import`
   - `fibu-import.server.ts` (geteilter Match/Persist-Pfad) +
     Upload-Button in `dashboard/fibu`.
5. ~~eTHB-Meldung~~ ✅ `buildTreuhandMeldung()` in `trust-accounting.ts`
   (§ 10a Abs. 2 RAO, >40.000 €).

### WP-2 Vorlagen-Engine & DMS-Tiefe (P0/P1)

6. **DOCX-Vorlagen-Befüllung.** ✅ Engine geliefert (22.09.):
   `src/lib/docx-template.ts` (docxtemplater 3.69.3 + pizzip,
   `{{platzhalter}}` über Run-Grenzen, `{{#loop}}`-Serienbrief),
   `POST /api/legal/docx-fill`. **UI geliefert:** `TemplateUseDialog`
   (Akte-Auswahl → Auto-Befüllung bekannter Platzhalter, Vorschau,
   Kopieren + DOCX-Download via `api/word-export` mit Briefpapier aus
   Kanzlei-Settings) und `SerienbriefDialog` (.docx-Upload →
   `extractDocxVariables` → Empfängerzeilen inkl. Beteiligten-Import aus
   der Akte → `docx-fill` mit `rows` → ZIP-Download) sind beide in
   `templates/page.tsx` verdrahtet.
7. ~~**Dateiversionen + Check-in/Check-out.**~~ ✅ **GELÖST** —
   Lock `checked_out_by` im Dokument-Frontmatter, Snapshots als
   `document_version`-Seiten (`legal/doc-versions/<doc>/v<N>`),
   serverseitige 409-Enforcement in `POST /api/pages`, Routen
   `checkout`/`checkin`/`release`/`versions` (mit nicht-destruktivem
   Restore = Sicherheits-Snapshot vorher), Lock-Badge im Akten-
   Dokumenten-Tab + Panel auf der Brain-Dokumentseite.
   Ergänzt (22./23.09.): Zeilen-/Wort-Diff-UI im Versions-Panel —
   „Vergleichen" pro Version rendert `diffWords` Side-by-Side
   (Token-Limit-Guard gegen große Docs). **Binär-Diff geliefert:**
   Check-in speichert `doc_content_hash` (SHA-256) + `doc_content_size`;
   `isBinaryVersion` (MIME-basiert, Heuristik-Fallback) schaltet auf
   Hash-/Größenvergleich um — „identisch/geändert" statt sinnlosem
   Wort-Diff auf PDF/DOCX-Payloads.
8. ~~**Unterordner/Subakten**~~ ✅ **GELÖST** — `folder`-Feld im
   Dokument-Frontmatter (Unterordner via „/" im Namen), Ordner-Filter
   - Ordner-Badge im Akten-Dokumenten-Tab, „In Ordner ablegen"-Dialog
     mit Vorschlägen bestehender Ordner (`documents-tab.tsx`).
     **Baum-Ansicht geliefert (22.09.):** `src/lib/folder-tree.ts`
     (`buildFolderTree` — „/"→echte Knoten, `totalCount` aggregiert,
     de-DE-Sortierung; `folderMatches` — Prefix-Match inkl. Kinder),
     `src/components/legal/folder-tree.tsx` (aufklappbarer Baum,
     `role="treeitem"`, Count-Badges, „Alle"/„Ohne Ordner"), verdrahtet
     im Dokumenten-Tab als Toggle-Panel neben dem Filter-Button.
     18 Tests (Lib + Komponente).
     Ergänzt (23.09.): DnD auf Baum-Knoten, persistenter Collapse-State
     pro Akte, Kontextmenü (Umbenennen/Unterordner) mit Touch-Fallback,
     einmaliger Inline-DnD-Hint. **Bulk-Rename:** `POST
/api/legal/folders/rename` — serverseitiger Prefix-Move mit
     pro-Seiten-Verifikation + Keyed-Lock statt N Client-PATCHes.
9. ~~**Papierkorb-UI**~~ ✅ **GELÖST** — `api/trash` (Liste + Restore via
   Engine `restore_page`) + `dashboard/papierkorb` mit Tests.
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
20. **CTI.** ✅ **Vorhanden + verifiziert:** `api/cti/webhook`
    (Bearer `CTI_WEBHOOK_SECRET`, 503 wenn unkonfiguriert) normalisiert
    Placetel/sipgate/3CX-Payloads (`parseCtiPayload`), Anruferkennung
    über Kontakt-Telefonnummern mit Suffix-Match (`findCallerMatches`),
    schreibt `legal_phone_note` (Dauer bei `ended`), SSE-Banner
    `CtiCallBanner` global im Dashboard-Layout mit „Akte öffnen"-Link,
    `phone-notes-tab` in der Akte. 80 Zeilen Tests grün.
21. **Outlook-Add-in: Anhänge ablegen.** ✅ **Geliefert:** Neuer
    „Anhänge"-Tab im Taskpane — listet Mail-Anhänge (`item.attachments`,
    inline gefiltert), Akte-Auswahl (GET `/api/pages?type=legal_case`,
    Vorauswahl = zuletzt gematchte Akte), Upload pro Anhang via
    `getAttachmentContentAsync` → Blob → kanonisches `POST /api/upload`
    (Scan, Dedup, § 43e-Case-Pflicht, Posteingang). Per-Item-Status
    (⏳/✓/✗). `ReadWriteItem`-Permission reicht.
22. **Native Store-Apps.** ✅ **Geliefert:** `ios/` + `android/` generiert
    (`cap add`, 6 Plugins gesynct: app/camera/filesystem/push/share/
    biometric), pod install ok. Android Share-Target: `ACTION_SEND`-
    Intent-Filter + `MainActivity.handleShareIntent` → neue Seite
    `/mobile/share` (Text → Brain-Notiz `mobile_share`; Datei-Stream via
    `@capacitor/filesystem` → kanonisches `/api/upload` in Akte). Push-
    Bridge + `/api/push/register` + Biometrie + Mobile-Shell
    (cases/deadlines/note/time/document) waren bereits verdrahtet.
    Offen (kein Code): APNs/FCM-Credentials, iOS Share-Extension-Target
    (Xcode), Signing/Store-Submission.

### WP-5 KI-Parität Harvey/Legora (P1/P2)

23. ~~**Copilot natives Tool-Use ausbauen.**~~ ✅ **GELÖST** — 20+ Tools
    in `api/copilot/tools` mit Zod-Schemas + Confirmation-Flow:
    `create_case`, `create_deadline`, `create_task`, `create_contact`,
    `time_entry`, `send_email`, `request_signature`, `intake_create`,
    `document_request_create`, `deadline_mark_done`, `render_template`
    (DOCX-Fill via `docx-fill`-Pipeline), `register_lookup` (Firmenbuch/
    Grundbuch-Hook), `invoice_draft` (kanonische Rechnungsnummer + VAT +
    GoBD-Metadaten), `create_automation_rule` (Admin/Lawyer, koppelbar an
    WP-4.17-Engine). Rollen-Scoping via `agent-conditionals.ts`,
    mutierende Tools in `CONFIRMED_TOOLS`.
24. ~~**Plan-Ansicht verdrahten.**~~ ✅ **GELÖST** — Plan-Schritte sind
    jetzt ausführbar: `proposeStepAction` (`lib/planning-session.ts`)
    lässt die KI pro Schritt ein Copilot-Tool aus einer Whitelist
    (15 Tools) vorschlagen; die Ausführung läuft durch
    `/api/copilot/tools` — inkl. Rollen-Gating, Confirmation-Token für
    mutierende Tools und Credit-Checks. UI: „Mit KI ausführen" →
    Vorschlags-Karte (Tool + Params + Begründung) → „Bestätigen &
    ausführen" → `executed_tool`-Badge + Audit-Notiz am Schritt.
    Unterbrechen (Verwerfen), Umlenken (Refine) und Freigabe pro
    Schritt sind damit vollständig.
25. ~~**„Nächste Schritte" in der Akte.**~~ ✅ **GELÖST** —
    `POST /api/agents/next-steps` startet einen akten-scopeden
    Supervisor-Job (`next-steps:<slug>`), `GET /api/agents?filter=next-steps&case=`
    listet die Läufe pro Akte, `CaseNextStepsPanel` im Overview-Tab
    rendert die priorisierten Empfehlungen mit `useGroundedAnswer` +
    `CitationPanel` (Grounding-Invariant) und Auto-Polling während der
    Agent läuft.
26. ~~**KI-Redlining im Word-Add-in.**~~ ✅ **GELÖST** — Redline-Tab
    im Add-in jetzt vollständig: Playbook-Auswahl (live aus
    `/api/legal/playbooks`), Perspektive (Mandant/Gegenseite/Neutral),
    freie Anwalts-Instruktion end-to-end verdrahtet (Add-in → Web-Route →
    `web-api.ts` → `redlineContract`-Prompt, auch im MCP-Op
    `legal_contract_redline`). Ergebnis rendert strukturierte Redlines
    (Typ/Risiko/Rechtsgrund/Begründung) statt nur Summary; „Als Tracked
    Changes einfügen" baut echte OOXML-Revisionen (`w:ins`/`w:del`,
    Author „Subsumio") aus einem Zeilen-LCS-Diff — Word zeigt sie als
    echte Änderungsverfolgung. Zwei Bugs behoben: Add-in sendete
    `original` statt `original_text` (400) und `instruction` wurde
    von allen drei Schichten ignoriert.
27. ~~**Antwortentwurf im Outlook-Add-in**~~ ✅ **GELÖST** —
    `POST /api/email/draft-reply` entwirft Antworten (Ethical-Wall via
    `caseAccessForUser`, Aktenkontext optional, Prompt-Injection-Schutz
    via `<<<E-MAIL>>>`-Delimiter + `untrusted()`), gibt jetzt auch eine
    **Thread-Zusammenfassung** zurück (`withSummary`-Modus in
    `buildReplyDraftPrompt` + `parseDraftWithSummary`-Parser mit
    Rohtext-Fallback). Add-in sendet `caseSlug` (Aktenkontext fließt
    ein), rendert die Zusammenfassung über dem Entwurf und öffnet ihn
    via `displayReplyAllForm` als echten Outlook-Reply.
28. ~~**Mandatsannahme-Agent.**~~ ✅ **GELÖST** — `/mandat`: geführter
    Chat-Dialog (Rechtsgebiet-Chips → Name → **Gegenseite** → Kontakt →
    Anliegen → DSGVO-Consent) → `POST /api/intake/public` legt
    `intake_request` an → danach direkte Terminbuchung im selben Dialog
    (nächster freier Tag via `/api/booking/public`, Slot-Klick bucht).
    Neue `opponent`-Erfassung: Kollisionsprüfung läuft jetzt auf
    Anfragenden **und** Gegenseite (der eigentliche § 10-RAO-Konflikt).
    Bewusst deterministisch statt LLM — öffentliche Fläche, kein
    Prompt-Injection-Vektor, null Credits.
29. ~~**MCP-Server für Kanzleien freischalten.**~~ ✅ **GELÖST** — Engine-
    MCP (`/mcp`, Bearer-Auth gegen `access_tokens`-Hashes, Request-Log)
    war da; neu: Token-Verwaltung durchgängig — Engine-Routen
    `/api/mcp-tokens` (CRUD, `web-mcp:{brainId}:`-Namespacing,
    `x-subsumio-source`-Tenant-Scope), Web-Proxy
    `api/settings/mcp-tokens` (+`[id]`-Revoke, admin-only, auditiert),
    Settings-UI `/dashboard/settings/mcp` (Liste, Create-Once-Token-Anzeige,
    Widerruf, fertige `claude_desktop_config`-Snippet mit Endpoint),
    Hub-Tile „KI-Zugriff (MCP)" unter Integrationen.
30. ~~**Gedächtnis pro Nutzer fertigstellen.**~~ ✅ **GELÖST** — Memories
    sind jetzt **per-user gescoped**: `owner_id` im Frontmatter,
    `listMemories`/`searchMemories`/`buildMemoryContext` filtern auf
    eigene + firmenweite (Legacy-)Einträge; Update/Delete nur für Owner
    oder Admin (`memory_forbidden` → 403). Injection läuft weiter über
    `buildFullMemoryContext` (chat-panel reicht `user.id` durch). DSGVO:
    `data-export` enthält `copilotMemories` (ownedOnly), `data-deletion`
    löscht eigene Memory-Pages via `deleteMemoriesOfUser` — auch wenn die
    Firmen-Brain bestehen bleibt. UI: „Persönlich"/„Kanzleiweit"-Badge
    auf der Memory-Settings-Seite.

### WP-6 DE-Launch-Layer (P0 für Deutschland — NEU, 22.09. Revision 2)

Der bestehende Blueprint ist AT-fokussiert. Für den deutschen Markt fehlen
eigene Arbeitspakete — **kein Eintrag darf auf AT-Logik zurückfallen**
(`resolveCaseJurisdiction` ist die Kanalstelle).

31. ~~**DE-Fristen-Engine.**~~ ✅ **GELÖST** — `src/lib/legal/
frist-engine-de.ts` (539 Zeilen, 20 Tests): §§ 187–193 BGB, alle 16
    Bundesländer-Feiertage (fest + Oster-Gauss + Buß- und Bettag SN),
    § 199 BGB Jahresendverjährung, Zustellfiktionen § 174 ZPO i.V.m.
    § 4 ERVG + § 181 ZPO, Fristarten-Registry ZPO/StPO/VwGO/BGB. Keine
    vhfZ (korrekt — DE kennt kein § 222-ZPO-Äquivalent). Verdrahtet über
    `deadline-post-check.ts` + `legal-deadlines.ts` (`Bundesland`-Param).
32. ~~**DE-Tarife.**~~ ✅ **GELÖST** — `rvg.ts` (bestand), `gkg.ts` +
    `gkg-tariff-data.ts` (17 Tests), `jveg.ts` + `jveg-tariff-data.ts`
    (9 Tests) — GKG-Gerichtskosten und JVEG-Zeugen-/SV-Entschädigung
    vollständig.
33. **beA nativer Versand + eEB.** Import existiert
    (`server/src/core/ingestion/connectors/bea-import.ts`), Versand nur
    über externe Middleware.
    ✅ **eEB-Frist-Auslösung geliefert (22.09.):** `src/lib/
bea-deadlines.ts` — `eebZustellungsdatum` wendet die Zustellfiktion
    § 174 ZPO i.V.m. § 4 ERVG an (`zustellungBea`: Tag nach
    Bereitstellung, Sonnabend → nächster Werktag);
    `beaDeadlineSuggestions` erkennt Fristen im Nachrichtentext und
    verankert sie deterministisch über die DE-Registry
    (`berechneFristArtDE`, §§ 187–193 BGB — kein vhfZ). Der Import
    (`api/bea/import`) stempelt `eeb_zustellungsdatum` auf die
    Nachrichten-Page und merged Vorschläge gelockt auf
    `suggested_deadlines` der zugeordneten Akte — Anwalt bestätigt im
    bestehenden Review-Inbox. 11 Tests grün.
    Ergänzt (23.09.): **Richtungserkennung** — `direction`
    (inbound/outbound) aus dem Export bzw. via `BEA_OWN_SAFE_ID`;
    Ausgangskopien erzeugen keine Fristvorschläge mehr.
    **Bundesland** aus `legal/settings/kanzlei` (`rechtsraumState`,
    im Kanzlei-Profil für DE-Mandate wählbar) steuert die §-193-BGB-
    Landesfeiertage. Offene beA-Vorschläge werden auf der beA-Seite mit
    Link zur Eingangsprüfung angezeigt.
    **Offen bleibt:** nativer beA-Versand (eigene Zertifizierung vs.
    Middleware-Partner — Entscheidung Welle C).
34. **DATEV-Strategie klären.** `src/lib/datev-direct.ts` ist ein
    ehrlich gelabelter Platzhalter (kein API-Call; Details:
    `docs/DATEV_DIRECT_INTEGRATION_GAP.md`). Echter Export existiert:
    `datev-export.ts` (CSV für DATEV Unternehmen Online). Optionen:
    DATEV-Partnerschaft (Rechnungsdaten-Service 1.0 / Belegbilder) oder
    CSV-Export als kommunizierten Standard belassen. **Entscheidung
    nötig** — dann ggf. `api/datev-direct` aus `_archive/de/` reaktivieren.
35. ~~**DE-Register.**~~ ✅ **GELÖST (Interface)** — `src/lib/legal/
register-adapter.ts`: einheitlicher Vertrag für beide Märkte
    (`firmenbuch_at`, `grundbuch_at`, `handelsregister_de`,
    `unternehmensregister_de`, `insolvenz_de`, `vollstreckungsportal_de`),
    `resolveRegisterAdapter` liefert ohne Partner-Config sauberen
    „nicht konfiguriert"-Zustand — niemals erfundene Daten. Konkrete
    Provider-Implementierungen folgen nach Partnerwahl (Welle C).
36. ~~**Anderkonto § 43a BRAO.**~~ ✅ **GELÖST** — `src/lib/
trust-accounting.ts` trägt `TrustJurisdiction "at"|"de"`; § 43a Abs. 3
    BRAO (unverzügliche Anderkonto-Führung), Abs. 3 Satz 4 (15.000-€-
    Schwelle), Abs. 5 Hinweispflicht und Aktenbindung sind implementiert.
37. ~~**Archivierte DE-Flächen reaktivieren.**~~ ✅ **GELÖST** — Audit:
    alle Ziel-Libs leben bereits im Live-Tree (`fachrechner`,
    `court-directory`, `pkh-beratungshilfe`, `fao-tracking`, `xjustiz`,
    `bea-import`, `efiling-architecture`, `rvg`, `datev-export`); nur die
    Routen/Seiten waren archiviert. Reaktiviert: `api/fachrechner`,
    `api/court-directory`, `api/pkh-beratungshilfe`, `api/fao-tracking`,
    `api/legal/rvg`, `api/datev/import` (+Lib `datev-import.ts` nach
    `src/lib/` geholt), `api/bea/{export,import,receipt,send,send/retry}`
    (11 Routen) und die Dashboard-Seiten `dashboard/{bea,fao-tracking,
datev-export,datev-direct}`. Sidebar-Einträge wiederhergestellt
    (`nav.bea`, `nav.datev_*`, `nav.fao_tracking`) — `DE_ONLY_HREFS` ist
    jetzt jurisdiction-gesteuert: nur `user.jurisdiction === "DE"` sieht
    die DE-Flächen; die Seiten tragen zusätzlich `JurisdictionGate`.
    Bewusst archiviert bleibt `api/datev-direct` (WP-6.34: ehrlicher
    Platzhalter bis Partner-Entscheidung).
38. **DE-Corpus fertigstellen.** `DE_LAW_SOURCES_*` (jurisdiction.ts)
    und source-router-Routing sind im Working Tree in Arbeit.
    ✅ **Vollständigkeits-Audit geliefert:** `corpus-completeness-audit.ts`
    (auditCoverage: deklariert vs. DB-Bestand, Audit-Status
    empty_available/unexpected_data/partially_embedded/gap) +
    `GET /api/admin/corpus-coverage-audit?jurisdiction=` (live-Query
    über alle law-\*-Sources) + „Abdeckungs-Audit"-Sektion in
    `corpus-bestand.tsx`.
    ✅ **Soll-Ist je Gesetz geliefert (22.09.):** `src/lib/
de-statute-coverage.ts` — `fetchGiiToc` lädt das amtliche
    Inhaltsverzeichnis `gesetze-im-internet.de/gii-toc.xml`
    (~6.100 Bundesgesetze), `pageSlugToGiiSlug` mappt law-de-Pages
    via `frontmatter.source_url`/`slug` auf den gii-Slug,
    `auditDeStatutes` liefert Abdeckung + alphabetisch sortierte
    Missing-Liste (Cap 300). Die Coverage-Route hängt
    `de_statutes` an (best-effort: Upstream-Ausfall →
    `unavailable`-Flag, Matrix-Antwort bleibt), `corpus-bestand.tsx`
    zeigt Coverage-Badge + einklappbare Fehlliste. 9 Tests grün.
    Ergänzt (23.09.): **Ziel-Set vs. Gesamtkatalog** — `src/lib/
    de-law-targets.ts` ist Single Source für die 49 konfigurierten
    Kern-Gesetze (Ingest + Audit); der Report trennt „Pflicht-Set
    vollständig?" (Fehlende als Defekt, roter Badge) vom amtlichen
    Gesamtkatalog. `fetchGiiTocCached` cached das TOC 24 h
    (Memory + tmpdir-Datei) — kein Upstream-Hit pro Request.

### WP-7 Harvey-/Legora-Parität+ (P1/P2 — NEU, 22.09. Revision 2)

Verifiziert gegen help.harvey.ai Release Notes (Sept 2026) und
legora.com. Alles darunter ist **nicht** im bisherigen Blueprint.

39. ✅ **Review-Table Agent-Actions** — geliefert: Zeilen-Multi-Select,
    Select-All, Auto-Gruppierung, Bulk-Retry, XLSX-Export in
    `TabularReviewGrid.tsx` + `dashboard/tabular-review`.
40. ✅ **Client-runnable Workflows im Portal** — geliefert:
    `portal_workflows`-Freigabe pro Akte (Overview-Tab), Portal-Route
    `api/portal/workflows` (GET Liste / POST Start, Prompt bleibt
    serverseitig), Self-Service-Sektion in der Portal-Seite mit
    Fortschrittsanzeige.
41. ✅ **Monitors-as-a-Service** — geliefert: Monitor→Alert→Review→
    `api/monitoring/publish-alert` → `client_alerts` im Portal.
42. ✅ **Agent-Tasks** — geliefert: `assignee_type: "agent"`,
    `api/cron/agent-tasks`, Copilot `create_task`, UI-Badge.
43. ✅ **Magic Builder** — geliefert: Copilot-Tool
    `create_automation_rule` (bestätigungspflichtig).
44. ✅ **Office-Deliverables** — geliefert: `src/lib/xlsx-export.ts` +
    `api/work-products/[id]/export` (DOCX bestand via docx-template).
45. ✅ **Agentic Vault Organization** — geliefert:
    `src/lib/vault-organization.ts` (DACH-Taxonomie, deterministisch),
    Copilot-Tool `organize_documents`, „Auto-einordnen"-Button im
    Dokumenten-Tab.
46. ✅ **Externe AI-Präsenz** — geliefert: `api/openapi.json`
    (OpenAPI 3.1, Bearer-API-Key) + `/.well-known/ai-plugin.json`
    (ChatGPT-Actions-Manifest); MCP-Tokens aus WP-5.29.

### WP-8 P2-Backlog — aus dem Audit fallengelassen (NEU, getrackt damit nichts verloren geht)

47. ✅ **e-Rechnung-Versand** — geliefert: `src/lib/e-invoice/transport.ts`
    (PEPPOL + e-Rechnung.gv.at, ENV-gated, ehrlich `not_configured`),
    `api/e-invoice/send`, Versand-Buttons in der Rechnungs-UI.
48. ✅ **Datenexport mit Originaldateien** — geliefert:
    `api/cases/export` (ZIP: akte.json + dokumente/\* + Manifest),
    „Akte exportieren" im Akten-Menü.
49. ✅ **Litigation Analytics** — bereits produktiv:
    `src/lib/litigation-analytics.ts` + `api/legal/litigation` +
    `dashboard/litigation` (KPIs, Gericht-/Richter-Stats, CSV-Export).
50. ✅ **Defensible Review-Nachweis** — geliefert: QC-Felder auf
    `ReviewSetDocument` (qcSampled/qcDecision/qcBy/qcAt), seeded
    Sampling `sampleForQC` (mulberry32, reproduzierbar),
    `computeCodingConsistency` (Agreement-Rate + Cohen-κ +
    Konfliktliste), `exportProductionProtocol` (CSV mit Bates,
    Reviewer, Zeitstempel, QC-Spalten + Meta-Block).
    `PATCH review-sets/[slug]` akzeptiert `qcSample {rate, seed}`
    (Seed wird persistiert → nachvollziehbar); `GET ?export=protocol`
    liefert CSV-Download; GET liefert `codingConsistency` mit.
    Dashboard: QC-Panel (Sampled/Reviewed/Agreement/κ/Konflikte),
    „QC-Stichprobe ziehen"-Button, QC-Decision-Select pro gesampletem
    Dokument, „Protokoll exportieren". Tests 26/26.
51. ✅ **WhatsApp Mandant bidirektional** — geliefert: Consent-Store
    (opt-in/opt-out pro Scope, DSGVO-Proof) war angelegt; jetzt verdrahtet:
    STOPP/START-Keywords im Webhook, Outbound-Gate prüft Consent.
52. **Self-Hosted-Angebot.** Donna wirbt damit; die Engine kann es —
    Produkt-/Betriebsmodell definieren (kein Code-Item, aber
    Vertriebsrelevant).
53. **Sonstiges P2 — teilweise geliefert:**
    - ✅ RKSV: `src/lib/legal/rksv-adapter.ts` (Signatur-DEP-Vertrag,
      fail-closed ohne Signatureinheit) + `api/legal/rksv` (sign mit
      DEP-Verkettung via chain_value, status, DEP-Export; ENV:
      RKSV_ENDPOINT/RKSV_API_KEY/RKSV_CASH_REGISTER_ID)
    - ✅ Deckungsanfrage: `src/lib/legal/insurance-adapter.ts`
      (HttpInsuranceProvider auf LegalInsuranceProvider-Vertrag) —
      verdrahtet: `api/legal-insurance` versucht zuerst die
      Provider-API (ENV RSV*PROVIDER*\*), E-Mail-Fallback bleibt;
      UI zeigt API-Coverage-Result (Referenz/Summe/Selbstbehalt)
    - ✅ e-Rechnung-Status-Poll: `pollEInvoiceStatus` +
      `GET api/e-invoice/send?channel&reference`; Referenz wird am
      Rechnungs-Frontmatter persistiert, „Zustellstatus prüfen" im
      Rechnungs-Menü
    - ✅ API-Doku: `scripts/generate-api-docs.ts` → `docs/API.md`
      (502 Endpunkte, Methoden/Auth/Action/Rate pro Route, --check-Modus)
    - ✅ Kalender 2-Wege: bereits geliefert (WP-4.19)
    - ✅ Offline: `offline-store.ts` + isOnline bereits produktiv
    - ✅ Personalmodul: `/dashboard/personal` (Personalstamm +
      Urlaubskonto, abgeleitet aus Absence-Records) + `api/staff`
    - ✅ WebDAV/CalDAV-Server: `scripts/dav-server.ts` — read-only
      DAV-Bridge (PROPFIND/REPORT/GET; Next.js kann DAV-Methoden
      nicht dispatchen), Auth via Feed-Token `<userId>.<secret>`
      (Basic-Password; derselbe in Settings widerrufbare Link wie
      der Kalender-Feed). Mounts: `/fristen/` (CalDAV, ICS via
      Feed) + `/dokumente/` (WebDAV, `dav-xml.ts` Multistatus).
      Backend: `api/calendar/[token]/dav/documents` +
      `lib/feed-auth.ts` (fail-closed 404, Rate-Limit 60/min,
      Source-Isolation via `engineHeadersForUserId`).
    - ✅ OneDrive/SharePoint-UI: `DmsBrowserDialog` (Suche, Ordner-
      Drilldown, Import via `api/dms/import`, ehrliches
      `not_configured`) — verdrahtet im Vault und als
      Einstiegs-Karte auf der Connectors-Seite
    - ✅ SMS: `src/lib/sms/` (Twilio-Adapter env-gated, eigener
      Consent-Kanal `subsumio_sms_consent`, Consent+Quiet-Hours-Gate
      ohne 24h-Fenster), `api/sms/send` + `api/sms/consent`
      (Opt-in/Opt-out mit DSGVO-Proof), Audit `sms.*`
    - ✅ Video-Termin: `video_link`-Frontmatter via
      `api/legal/appointments/video-link` (JITSI_DOMAIN, Raum =
      HMAC des Slugs — keine Mandantendaten), Checkbox +
      Copy-Button im Termin-Dialog
    - ✅ NPS/Mandanten-Feedback: `api/portal/feedback` (Score 0–10,
      7-Tage-Update statt Duplikat, brain-isoliert als
      `client_feedback`-Page) + `PortalFeedback`-Widget im Portal
    - ✅ Mobile Offline-Sync: `useMutationQueue` (Retry-Cap 5,
      File-Upload-Queue, Reconnect-Flush via online-Event) verdrahtet
      in `MobileSyncBanner` (Mobile-Layout), Sidebar und
      `matter-detail-context`; Tests vorhanden
    - ✅ SMS-UI: `SmsSendDialog` im Kontakt-Menü (`/dashboard/contacts`,
      nur bei vorhandener Telefonnummer), Restlängen-Badge
    - ✅ Mobile-Note-Offline: `mobile/note` queued via `enqueueMutation`
      (auch bei Netzwerkfehler trotz navigator.onLine), queued-Badge

### QC-/Review-Härtung (Batch 2)

- ✅ **Stratifiziertes Sampling:** `sampleForQC` akzeptiert `strata`
  (Rate pro Entscheidung — withhold/privileged/redact auf 1.0);
  UI-Checkbox „Stratifiziert" im Review-Set-Dialog
- ✅ **QC-Konflikt-Resolution:** `finalDecision`/`finalBy`/`finalAt`/
  `finalNotes` am Dokument; `computeCodingConsistency` liefert
  `resolvedConflicts`/`openConflicts`; Endentscheidung-Select nur an
  Konflikt-Docs; Protokoll enthält Endentscheidungs-Spalten
- ✅ **Protokoll-Hash:** `exportProductionProtocolSigned` — SHA-256-
  Integritäts-Footer über dem CSV-Body (`# sha256:…`), manipulationssicher
  nachweisbar; Route `GET ?export=protocol` liefert signierte Variante
- ✅ **AT-only Sidebar-Filter:** `AT_ONLY_HREFS` (judgements-sync,
  verfahrensdoku) symmetrisch zu `DE_ONLY_HREFS`; fao-tracking nach
  DE_ONLY verschoben (FAO = deutsche Fachanwaltsordnung)

## NICHT codierbar — Entscheidung/User-Aufgabe (Welle C)

- **webERV-Versand:** Partnervertrag nötig (MANZ webERV-Service,
  stp.one/WEBSuite, ÖGIZIN). ✅ **Adapter-Interface geliefert:**
  `src/lib/legal/filing-transport.ts` (FilingTransportAdapter pro
  Channel beA/ERV/eFiling, HttpFilingTransportAdapter +
  fail-closed NotConfigured); `bea/send` nutzt den Adapter, neue
  Route `GET /api/bea/status` liefert Transport-Gesundheit für
  das Status-Banner auf der beA-Seite.
- **Registerabfragen** (GB/FB/ZMR/GISA/Ediktsdatei): Abfragedienst-
  Vertrag (MEDIX/MANZ/stp.one). ✅ **Adapter-Interface geliefert:**
  `src/lib/legal/register-adapter.ts` (AT: Firmenbuch/Grundbuch,
  DE: Handelsregister/Unternehmensregister/Insolvenz/
  Vollstreckungsportal — ein Interface beide Märkte).
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

WP-1 ✅ geliefert → WP-2.6 ✅ (Engine + UI: `TemplateUseDialog`,
`SerienbriefDialog`) → WP-2.7–11 (DMS-Tiefe) → WP-5.23/25/26
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
