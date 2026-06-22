# Agency-Level Audit — Kanzlei-Workflow Backend

**Datum:** 2026-06-22
**Scope:** Gesamter Backend-Datenfluss des Kanzleiworkflows — Akte (CRUD), Datenbank↔Dashboard-Anbindung, Dokumenten-Pipeline (Upload→OCR→Extraktion→Ingestion→Matter-Context→Löschung), Kontakte/Conflict-Checks, Fristen, Brain-Integration, Compliance.
**Methodik:** Code-Level-Review der API-Routen (`src/app/api`), der Geschäftslogik (`src/lib`), der Engine (`server/src`) und des Case-Detail-Frontends.

---

## Executive Summary

Die Architektur ist insgesamt solide: sauberer Engine-Proxy mit Audit-Logging, optimistic locking, robuste Dokument-Extraktion (PDF-Textlayer + OCR-Fallback, DOCX, EML, beA-XML, Audio), Anti-Halluzinations-Grounding bei der KI-Analyse und ein gestaffelter Fristen-Reminder.

**Es gibt jedoch drei P0-Befunde, die den Anwaltsalltag und die Datenintegrität direkt gefährden:**

1. **Doppelter Schreibzugriff auf das `documents`-Array** (Client + Server) → Race Condition, verlorene Dokument-Einträge bei Multi-Upload.
2. **KI-Analyse ist eine Sackgasse** (`meta.auto_analysis`) — extrahierte **Fristen werden NICHT in den Fristenkalender übernommen** → keine Reminder → Haftungsrisiko (versäumte Frist).
3. **OCR ist standardmäßig deaktiviert** → gescannte Dokumente/Fotos werden nicht durchsuchbar, Superbrain kann ihren Inhalt nicht beantworten.

---

## Befunde nach Schweregrad

### P0 — Datenintegrität & Haftung (sofort)

#### P0-1 — Doppel-Writer auf `documents`-Array (Race Condition)

**Ort:** `src/app/api/upload/route.ts` (`reconcileCaseDocuments`, Z. 167-198) **und** `src/app/dashboard/cases/[...slug]/page.tsx` (`handleMultiUpload` → `saveCaseUpdate({documents})`).

Beim Upload schreiben **zwei unabhängige Akteure** das `documents`-Array derselben Akte:

- Der **Client** liest `caseData.documents` aus dem State, hängt den Eintrag an und PATCHt mit `If-Match`.
- Der **Server** GETtet die Akte, hängt denselben Eintrag an und PATCHt **ohne** `If-Match` (fire-and-forget, `void`).

Bei Multi-File-Upload interleaven beide → Last-Write-Wins auf dem `documents`-Key → einzelne Dokument-Einträge können verloren gehen. Die Slug-Deduplizierung mildert nur exakte Doubletten, nicht den Lost-Update.

**Empfehlung:** Genau **ein** Writer. Server-`reconcileCaseDocuments` ist die Single Source of Truth (deckt auch Copilot/Intake-Uploads ab). Der Client soll bei Upload das Array **nicht** mehr selbst schreiben, sondern nach erfolgreichem Upload die Akte / den Matter-Context neu laden. Zusätzlich `reconcileCaseDocuments` mit optimistic retry (GET→PATCH mit `If-Match`, bei 409 erneut).

#### P0-2 — KI-Analyse-Ergebnisse erreichen den Fristenkalender nie

**Ort:** `src/app/api/legal/analyze/route.ts` (Z. 224-244) schreibt nach `meta.auto_analysis`; **kein Leser** im gesamten `src` (`grep auto_analysis` → nur Schreibstelle).

Die Analyse extrahiert `deadlines`, `parties`, `document_type`, `action_items` und `risks` — diese landen in `meta.auto_analysis` und werden **nirgends** weiterverarbeitet. Der Fristen-Cron (`src/app/api/cron/deadline-reminders/route.ts`) liest ausschließlich `fm.deadlines`. **Folge:** Lädt der Anwalt ein Urteil mit Berufungsfrist hoch, erkennt die KI die Frist korrekt — sie wird aber nie zur getrackten Frist, **kein Reminder, versäumte Frist.**

**Empfehlung:** Nach der Analyse die extrahierten Fristen als **Vorschläge** in die Akte überführen (Bestätigungs-Workflow „KI hat 2 Fristen erkannt — übernehmen?"), Parteien als Kontakt-Vorschläge, `document_type` ins Dokument-Frontmatter stampen. Bis dahin: explizit kommunizieren, dass KI-Fristen manuell übernommen werden müssen.

#### P0-3 — OCR standardmäßig deaktiviert

**Ort:** `server/src/core/import-file.ts` (`maybeOcr`, Z. 1500-1539) — Gate `GBRAIN_EMBEDDING_IMAGE_OCR === 'true'` (Default AUS) + benötigt verfügbares `expansion`-Modell.

Gescannte PDFs ohne Textlayer und Foto-/Bild-Uploads (sehr häufig in Kanzleien: eingescannte Schriftsätze, Urteile, Vollmachten) werden ohne OCR als Platzhalter gespeichert → **nicht durchsuchbar, nicht chattbar**. Der PDF-OCR-Fallback (`extract-document.ts` `tryOcrFallback`) hängt an derselben Gateway-Verfügbarkeit.

**Empfehlung:** In Produktion `GBRAIN_EMBEDDING_IMAGE_OCR=true` + Expansion-Model-Key setzen. `gbrain doctor`-Check + Dashboard-Warnbanner „OCR inaktiv — gescannte Dokumente nicht durchsuchbar".

---

### P1 — Workflow-Lücken (kurzfristig)

#### P1-1 — Akten-Löschung ohne Cascade → verwaiste Daten

**Ort:** `src/app/api/pages/[...slug]/route.ts` (`DELETE`, Z. 135-168) — löscht nur die Akten-Seite.

Zugehörige Dokumente (`case_slug` → gelöschte Akte), eigenständige Fristen-Seiten, Portal-Tokens und `document_request`-Seiten bleiben verwaist. Der Matter-Context-Query (`fetchCaseDocumentsBySlug`) würde für eine gelöschte Akte weiterhin Dokumente finden.

**Empfehlung:** Akte „archivieren" (Soft-Delete) statt Hard-Delete (GoBD-Aufbewahrung spricht ohnehin gegen echtes Löschen), oder beim Löschen alle `case_slug`-gestempelten Seiten tombstonen + Portal-Tokens widerrufen.

#### P1-2 — `document_type` nie im Dokument-Frontmatter

**Ort:** Upload-Flow setzt keinen `document_type`; KI-Analyse schreibt ihn nur nach `meta`. `matter-context.ts` (`fetchCaseDocumentsBySlug`, Z. 699) liest `fm.document_type`.

**Folge:** Der Dokumenttyp-Filter und die Badges im Documents-Tab bleiben leer. Behebung gekoppelt an P0-2 (document_type beim Analyse-Writeback ins Frontmatter stampen).

#### P1-3 — Fristen-Reminder ohne SMTP-Fallback

**Ort:** `src/app/api/cron/deadline-reminders/route.ts` (Z. 60-62) — ohne SMTP-Config → 400, keine Erinnerung, kein Alarm.

**Empfehlung:** In-App-Notification als Fallback (`/api/notifications`) + Readiness-/Health-Check, der fehlende SMTP-Config sichtbar macht. Eine stille Fristenüberwachung, die nichts sendet, ist gefährlicher als gar keine.

#### P1-4 — Server-seitiger Conflict-Check fehlt beim Zuweisen in der Detailseite

**Ort:** `src/app/api/pages/route.ts` (Z. 91-128) führt `/api/legal/conflict-check` nur bei **Case-Erstellung** aus. Beim nachträglichen Zuweisen von Mandant/Gegner in der Detailseite läuft nur der **client-seitige** `checkInternalConflict` (heute ergänzt).

**Empfehlung:** Beim PATCH einer `legal_case`-Seite mit geänderten `client_name`/`opponent_name` denselben Engine-Conflict-Check serverseitig auslösen und das Ergebnis zurückgeben.

---

### P2 — Robustheit & UX (mittelfristig)

#### P2-1 — Schreibzugriffe von Cron/Reconcile ohne optimistic locking

`reconcileCaseDocuments` und `updatePageDeadlines` (Cron) nutzen `merge:true` ohne `If-Match` — bei hoher Nebenläufigkeit Clobber-Risiko auf einzelnen Keys.

#### P2-2 — Offline-Upload speichert keine Datei-Bytes

`handleMultiUpload` zeigt nur einen Offline-Indikator; die Datei wird nicht in IndexedDB gequeued. Ein echter Offline-Upload-Queue (ArrayBuffer → Replay bei Reconnect) fehlt.

#### P2-3 — Doppelte Versions-Logik Client/Server

Client setzt `frontmatter.version+1` **und** sendet `If-Match`; der Server rechnet die Version aus `If-Match` neu. Funktioniert (Server ist autoritativ), aber die redundante Client-Inkrementierung ist verwirrend und fehleranfällig — entfernen.

---

## Was bereits gut ist (kein Handlungsbedarf)

- **Engine-Proxy + Audit:** Saubere `createHandler`-Abstraktion mit Rate-Tiers, Quota, Audit-Logging und Multi-Tenant-Isolation (`x-subsumio-source`, IDOR-Schutz bei `brain_id`).
- **Dokument-Extraktion:** PDF-Textlayer mit OCR-Fallback bei Sparse-Text, DOCX/EML/XLSX/CSV, Audio-Transkription, beA-XML-Parser, Unverified-Banner für OCR/Transkription (rechtlich wichtig).
- **Anti-Halluzination:** `groundCitations` prüft zitierte §§ gegen das echte Korpus; Prompt-Injection-Sanitizing bei der Analyse.
- **Fristen-Eskalation:** Gestaffelte Reminder (7/3/1/0 Tage) mit Tracking und Stage-Dedup.
- **Optimistic Locking:** `If-Match`-basierter 409-Conflict im PATCH-Pfad + 30s-Live-Poller im Frontend.
- **§ 43e BRAO / GoBD:** Legal-Uploads erzwingen Akten-Zuordnung; `case_slug`-Stamping macht jedes Dokument rückverfolgbar.

---

## Priorisierte Verbesserungs-Todoliste

### Release A — Datenintegrität (P0, diese Woche)

- [ ] **A1** `documents`-Array: Single-Writer durchsetzen. Client-`saveCaseUpdate({documents})` beim Upload entfernen; nach Upload Matter-Context/Akte neu laden. `reconcileCaseDocuments` mit `If-Match`-Retry härten.
- [ ] **A2** KI-Fristen-Übernahme: Nach `analyze` erkannte Fristen als Vorschlag in die Akte schreiben (Bestätigungs-UI), damit sie vom Reminder-Cron erfasst werden.
- [ ] **A3** `document_type` aus `analyze` ins Dokument-Frontmatter stampen (statt nur `meta`).
- [ ] **A4** OCR in Produktion aktivieren (`GBRAIN_EMBEDDING_IMAGE_OCR=true` + Expansion-Key) + Doctor/Banner-Warnung bei Inaktivität.

### Release B — Workflow-Robustheit (P1, nächste 2 Wochen)

- [ ] **B1** Akten-Löschung: Soft-Delete/Archiv + Tombstone aller `case_slug`-Dokumente + Portal-Token-Widerruf.
- [ ] **B2** Fristen-Reminder In-App-Fallback + SMTP-Health-Check in Readiness-Endpoint.
- [ ] **B3** Server-seitiger Conflict-Check beim PATCH von `legal_case` mit geänderten Parteien.
- [ ] **B4** KI-extrahierte Parteien als Kontakt-Vorschläge (mit Conflict-Check) in den Intake-Flow.

### Release C — Polish (P2, Backlog)

- [ ] **C1** `If-Match` für Reconcile- und Cron-Schreibzugriffe.
- [ ] **C2** Echter Offline-Upload-Queue (Datei-Bytes in IndexedDB, Replay bei Reconnect).
- [ ] **C3** Redundante Client-Versions-Inkrementierung entfernen (Server bleibt autoritativ).
- [ ] **C4** E2E-Tests: Multi-File-Upload-Race, KI-Fristen→Reminder, Akten-Löschung-Cascade.

---

## Verifikations-Kriterien (Definition of Done)

- Multi-File-Upload (5 Dateien gleichzeitig): alle 5 erscheinen zuverlässig in `documents` **und** im Matter-Context, keine verlorenen Einträge.
- Upload eines Urteils mit Berufungsfrist: KI-erkannte Frist erscheint als Vorschlag, nach Bestätigung im Fristenkalender + löst Reminder aus.
- Gescanntes PDF/Foto: Inhalt ist im Superbrain-Chat beantwortbar (OCR aktiv).
- Akte löschen: keine verwaisten Dokumente/Tokens; Matter-Context der gelöschten Akte ist leer.
- E2E-Suite grün; CI-Gate (`lint`, `typecheck`, `test`) bestanden.
