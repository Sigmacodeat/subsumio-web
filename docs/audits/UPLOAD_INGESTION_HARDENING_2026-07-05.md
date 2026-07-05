# Upload-/Ingestion-Engine — Härtungs-Audit (Agenturlevel, „1 Jahr / 100 Kunden"-Perspektive)

> **Datum:** 2026-07-05
> **Scope:** Vollständiger Code-Trace der Dokumenten-Upload- und Ingestion-Kette — Eingang
> (`/api/upload`, `/presign`, `/confirm`), Security-Scan (MIME/Magic-Bytes/ClamAV), Dedup,
> Validierung, Async-Extraktion, OCR, Splitting, Outbox, Drain-Cron, Analysis-Retry-Cron,
> Jurisdiktionserkennung, Case-Reconciliation.
> **Methodik:** Zeilengenauer Trace jeder Ebene; jeder Befund mit Datei:Zeile + konkretem
> Alltagsfehler-Szenario aus dem Dauerbetrieb + Fix-Empfehlung. Keine Vermutungen — jeder
> P0/P1 wurde im Code verifiziert.

---

## 1. Gesamturteil

**Die Architektur ist überdurchschnittlich robust gebaut** — persistente Outbox, terminal-vs-transient-
Fehlerklassifikation, Idempotenz-Slugs, best-effort-Isolation, ehrliche Placeholder statt Mojibake,
ClamAV-INSTREAM sauber implementiert. Das ist kein Anfänger-Code.

**Aber:** Es gibt **drei stille Blackholes**, die im Dauerbetrieb garantiert zu unbemerkt nicht-
analysierten Dokumenten führen — genau die Klasse Fehler, die man erst nach Monaten und beim
falschen Mandanten entdeckt. Dazu kommen zwei Workflow-Breaker (Dedup-Hardblock, Umlaut-
Zerstörung), die eine DACH-Kanzlei am ersten Tag treffen, und eine Jurisdiktions-Fehlklassifikation,
die DE/CH-Kunden das falsche Recht unterschiebt.

| Ebene                         | Robustheit | Kernbefund                                                            |
| ----------------------------- | ---------- | --------------------------------------------------------------------- |
| Eingangs-Validierung/Security | 90/100     | MIME→Magic→ClamAV→SHA-256 fail-closed; ClamAV-Größenlimit ungetestet  |
| Dedup                         | 55/100     | Brain-weiter Hard-Block 409 verhindert Mehrfach-Ablage (Workflow-Bug) |
| Async-Extraktion/OCR          | 92/100     | Terminal/transient sauber; ehrliche Placeholder                       |
| Outbox + Drain                | 68/100     | throw-mid-loop, missing-secret→„done", DLQ-Kopplung an Recipients     |
| Analysis-Retry (DLQ)          | 30/100     | **Relative fetch-URL → Retry-Cron faktisch tot**                      |
| Confirm-Pfad (große Dateien)  | 45/100     | **Client-Disconnect → Dokument nie analysiert, nie geflaggt**         |
| Jurisdiktionserkennung        | 60/100     | DE-Aktenzeichen matcht „AT-only"-GZ-Muster; Zero-Signal→hart „at"     |
| Case-Reconciliation           | 70/100     | Last-writer-wins-Race droppt documents[]-Einträge                     |

---

## 2. Härtungs-Liste nach Priorität

### 🔴 P0 — Stille Datenlücken (führen garantiert zu nicht-analysierten Akten)

- [ ] **P0-1 · Der Analysis-Retry-Cron ist faktisch tot (relative fetch-URL).**
      `src/app/api/cron/analysis-retry/route.ts:150` ruft `fetch("/api/legal/analyze", …)` mit einer
      **relativen URL**. Im Node/Next-Server-Runtime wirft globales `fetch` bei relativer URL
      (`Failed to parse URL`) — es gibt keinen globalen Base. Der Drain-Cron macht es korrekt mit
      `${origin}/api/legal/analyze` (`post-upload-drain/route.ts:113`); dieser Cron nicht.
      **Alltagsfehler:** Jedes Dokument, dessen Analyse einmal fehlschlägt (Engine-Hiccup, Timeout),
      landet im DLQ. Der Retry wirft beim URL-Parsing → wird als Fehlversuch gezählt → nach 3
      Scheinversuchen `permanently_failed`. **Kein einziges fehlgeschlagenes Dokument erholt sich
      jemals.** Nach 1 Jahr: ein wachsender Friedhof „permanently_failed" analysierter-nie Akten.
      **Fix:** Absolute URL wie im Drain-Cron (`${origin}/api/legal/analyze`) verwenden. Test ergänzen,
      der die tatsächliche URL-Auflösung prüft (aktuell **kein Test** auf diesem Cron).

- [ ] **P0-2 · Große Dateien (Presign/Confirm) werden bei Client-Disconnect nie analysiert und nie geflaggt.**
      Der SSE-Confirm-Pfad (`src/app/api/upload/confirm/route.ts:44-96`) feuert die Post-Upload-Tasks
      erst beim `done`-Event. Bricht der Client vorher ab (Tab zu, Mobilfunk weg, Timeout — im
      Kanzleialltag mit Scan-Uploads häufig), fällt `cancel()` → `sideEffectsFired` bleibt false →
      **keine Outbox-Task wird erzeugt**. Confirm setzt zudem **nie** `analysis_status` (verifiziert).
      Der Analysis-Retry-Cron filtert aber nur `analysis_status === "failed"`
      (`analysis-retry/route.ts:44`) — ein Dokument ganz ohne Status wird nie erfasst. Ergebnis: das
      Dokument ist importiert und durchsuchbar, aber **niemals analysiert und nirgends als Lücke sichtbar**.
      **Fix:** (a) Confirm stampt sofort nach Engine-OK `analysis_status: "pending"` auf das Dokument,
      bevor der Stream beginnt; (b) ein Reconciliation-Sweeper-Cron findet Dokumente mit
      `analysis_status ∈ {pending, ∅}` älter als N Minuten und re-enqueued sie in die Outbox.

- [ ] **P0-3 · Drain-Cron: `throw` mitten in der Schleife bricht den ganzen Lauf ab + Doppel-Analyse.**
      `src/app/api/cron/post-upload-drain/route.ts:151` wirft `task_mark_done_failed_…`, wenn das
      „done"-Markieren fehlschlägt — mitten in der `for`-Schleife über alle pending Tasks. Alle
      restlichen Tasks dieses Laufs werden abgebrochen. Schlimmer: Die Analyse **lief bereits
      erfolgreich**, nur das Markieren scheiterte → nächster Lauf führt dieselbe Analyse +
      Contradiction-Probe erneut aus (doppelte Deadline-/Party-Writebacks). Alle anderen Patch-
      Fehler im selben Cron werden korrekt mit `console.error` + `continue` behandelt — nur dieser
      Pfad wirft.
      **Zusätzlich (P0-3b):** Fehlt `SUBSUMIO_INTERNAL_SECRET`, fallen `analyze` und `contradiction`
      in den finalen `else`-Zweig (`:131-135`) → `success=true, errorMsg="skipped_missing_context"` →
      als **„done" markiert, ohne je gelaufen zu sein**. Eine Fehlkonfiguration macht so die gesamte
      Analyse still unwirksam, ohne Sichtbarkeit.
      **Fix:** `throw` durch `console.error` + `continue` ersetzen (wie die Nachbarzweige). Analyse
      idempotent nach `doc_slug` machen. Fehlendes Internal-Secret als eigenen Fehlerzustand
      (`status: "blocked"`, nicht „done") markieren, damit `queue-alert` es aufgreift.

### 🟠 P1 — Workflow-Breaker & Fehlklassifikation (treffen die Kanzlei sofort)

- [ ] **P1-1 · Brain-weiter Content-Hash-Dedup blockiert die Mehrfach-Ablage desselben Dokuments.**
      `src/lib/duplicate-store.ts` mappt `sha256 → {ein slug}` brain-weit; `upload-pipeline.ts:181`
      gibt bei Treffer hart **409 „Datei bereits vorhanden"** zurück.
      **Alltagsfehler:** Dasselbe PDF gehört in einer Kanzlei legitim in **mehrere Akten** —
      Standardformulare, ein geteiltes Sachverständigengutachten, ein Rahmenvertrag, dieselbe
      Gerichtsentscheidung in zwei Mandaten. Der Hard-Block verhindert die Ablage in der zweiten Akte
      komplett. Das ist kein Edge Case, sondern täglicher Kanzleibetrieb.
      **Fix:** Dedup **pro Akte** scopen (Hash + case_slug), oder statt Hard-Block ein „Dieses Dokument
      existiert bereits in Akte X — hier verknüpfen statt neu hochladen?"-Flow anbieten
      (Link-existing-to-case). Der brain-weite Hash bleibt als Speicher-Deduplizierung nützlich, darf
      aber die fachliche Zuordnung nicht blockieren.

- [ ] **P1-2 · `sanitizeFilename` zerstört Umlaute und Nicht-ASCII.**
      `src/lib/upload-validation.ts:79` ersetzt alles außer `[a-zA-Z0-9._-]` durch `_`. „Müller*
      Klageschrift.pdf" → „M_ller_Klageschrift.pdf", „Schöffengericht" → „Sch_ffengericht".
      **Alltagsfehler:** DACH-Dateinamen tragen fast immer Umlaute (Mandantennamen, Aktenbezüge). Wenn
      der Titel auf den Dateinamen zurückfällt, verliert das Dokument seinen lesbaren Titel — bei jedem
      zweiten Upload einer deutschen Kanzlei.
      **Fix:** Unicode-bewusste Regex `/[^\p{L}\p{N}.*-]/gu` — entfernt weiterhin Path-Traversal,
      Steuerzeichen und Sonderzeichen, bewahrt aber ä/ö/ü/ß und akzentuierte Buchstaben.

- [ ] **P1-3 · Jurisdiktionserkennung klassifiziert deutsche Akten als österreichisch.**
      `server/src/commands/web-api.ts:795` behandelt das GZ-Muster `\d{1,3}\s+[A-Za-z]{1,4}\s+\d{1,5}/\d{2}`
      als **AT-exklusiv mit ×5-Gewicht**. Aber deutsche Aktenzeichen haben dieselbe Struktur —
      „8 O 123/24" (LG-Zivilsache), „312 O 45/23" — matchen und pushen atScore um +5. Bei Gleichstand
      und Zero-Signal defaultet `:854` **hart auf „at"**.
      **Alltagsfehler:** Eine deutsche Kanzlei lädt einen Schriftsatz mit AZ „8 O 123/24" hoch → wird als
      AT klassifiziert → die gesamte Pipeline (Law-Matcher, Fristen nach ZPO-AT/§ 89a GOG, Draft-Stil)
      läuft mit österreichischem Recht. Für einen reinen DE- oder CH-Mandanten systematisch falsch.
      **Fix:** GZ-Muster nicht AT-exklusiv gewichten (deutsche/österreichische AZ strukturell trennen —
      z. B. Gattungszeichen-Registry gegen die AT-Liste prüfen, wie es `gz-validate.ts` bereits kann).
      Zero-Signal-Default auf die **im Tenant konfigurierte Heimat-Jurisdiktion** setzen, nicht global „at".

- [ ] **P1-4 · `validateCaseSlug` verwechselt Engine-Ausfall mit „Akte existiert nicht".**
      `src/app/api/upload/route.ts:18-33` fängt jeden Fehler (Timeout, 5xx, Netz) ab und gibt `false`
      zurück → die Route antwortet **404 „Die angegebene Akte existiert nicht."**
      **Alltagsfehler:** Ein kurzer Engine-Hiccup während des Uploads sagt dem Anwalt, seine (real
      existierende) Akte gäbe es nicht → Verwirrung, Support-Ticket, evtl. Neuanlage einer Dubletten-Akte.
      **Fix:** HTTP-5xx/Timeout vom echten 404 unterscheiden — bei transientem Fehler `503 „Bitte erneut
    versuchen"` statt `404 case_not_found`.

### 🟡 P2 — Robustheit, Skalierung, Konsistenz

- [ ] **P2-1 · Case-Reconciliation: Last-writer-wins-Race droppt `documents[]`-Einträge.**
      `upload/route.ts:331` + `post-upload-drain/route.ts:223` lesen `case.documents`, hängen an,
      schreiben zurück — ohne If-Match/optimistic locking (im Code als bekannt dokumentiert). Bei
      **gleichzeitigen Uploads in dieselbe Akte** (Scannen eines Stapels, mehrere Mitarbeiter) gewinnt
      der letzte Writer → zwischenzeitliche Einträge verschwinden aus der Akten-Dokumentliste. Der
      `case_slug`-Stempel bleibt zwar (Dokument auffindbar), aber die Akten-Übersicht zeigt es nicht.
      **Fix:** Engine-seitige atomare Array-Append-Operation, oder Retry-mit-Refetch-Schleife bei
      Konflikt. Da beide Aufrufstellen identisch sind, in einen gemeinsamen Helper ziehen.

- [ ] **P2-2 · ClamAV-Größenlimit wird als „Scanner nicht erreichbar" fehlinterpretiert.**
      `src/lib/virus-scan.ts:150-162`: Überschreitet die Datei clamds `StreamMaxLength` (Default 25 MB),
      antwortet clamd mit `INSTREAM size limit exceeded` und schließt — die Antwort enthält weder „OK"
      noch „INFECTED" → `resolve({clamav_unreachable})` → Upload abgelehnt mit „Virenscanner nicht
      erreichbar". Bei `MAX_FILE_SIZE`=500 MB und Default-clamd trifft das **jeden Scan > 25 MB**.
      **Alltagsfehler:** Ein 40-MB-Scan-PDF wird abgelehnt, der Operator glaubt, ClamAV sei down und
      startet Container neu — obwohl nur `StreamMaxLength` zu klein ist.
      **Fix:** `size limit exceeded` in der Response explizit erkennen und als eigenen, aussagekräftigen
      Fehler behandeln; `StreamMaxLength` in der clamd-Config an `MAX_FILE_SIZE` angleichen und
      dokumentieren.

- [ ] **P2-3 · Volles In-Memory-Buffering pro Sync-Upload → OOM-Risiko unter Last.**
      `upload-pipeline.ts:88` liest die ganze Datei via `arrayBuffer()`, `computeSHA256` kopiert in einen
      Buffer, dann wird eine neue `File` + `FormData` gebaut und proxied — Spitzenlast ≈ 3× Dateigröße
      RAM pro Upload. Es gibt **keinen serverseitigen Concurrency-Guard**. Mehrere parallele 500-MB-
      Uploads → OOM auf dem Web-Container (der Client-Stagger-Pool bremst nur pro Browser, nicht global).
      **Fix:** Sync-Route auf eine niedrige Größe kappen (z. B. 25–50 MB) und größere Dateien zwingend
      über Presign (streamt direkt zur Engine, kein Web-Buffer) leiten. Der Async-Extract-Pfad ab
      `SUBSUMIO_ASYNC_EXTRACT_MIN_BYTES` existiert bereits — die synchrone Größenobergrenze daran koppeln.

- [ ] **P2-4 · Sequenzielles, geschlucktes Per-Part-Stamping orphaned Dokument-Teile.**
      `web-api.ts:937-1026` stampt `case_slug`, Tags, `embedding_status` und Jurisdiction in **vier
      sequenziellen Schleifen** über alle Parts, jeweils best-effort mit leerem `catch {}`. Bei einem
      50-Teile-Dokument sind das 200 sequenzielle Engine-Writes; ein transienter Blip lässt einzelne
      Parts **still ohne `case_slug`** zurück → matter-context findet sie nicht → Teil des Dokuments
      unsichtbar in der Akte, ohne jede Fehlermeldung.
      **Fix:** Batch-Patch statt Einzel-Writes; Fehlschläge sammeln und in einen Retry/Sweeper geben,
      nicht schlucken.

- [ ] **P2-5 · `embedding_status: "ready"` wird gestampt, ohne Embeddings zu verifizieren.**
      `web-api.ts:973-980` setzt bei `noEmbed=false` pauschal „ready". Schlug der Embed-Schritt in
      `splitAndImportLargeDocument` teilweise fehl, ist der Status eine Lüge → semantische Suche liefert
      stillschweigend unvollständige Treffer.
      **Fix:** „ready" erst stampen, wenn der Embed-Schritt bestätigt zurückkommt; sonst „pending" +
      Backfill-Enqueue (der Pfad existiert bereits für `noEmbed`).

- [ ] **P2-6 · TOCTOU-Race in der Dedup-Prüfung.**
      `upload/route.ts:186` zeichnet den Hash **nach** dem Upload best-effort auf. Zwei identische
      Uploads gleichzeitig (Doppelklick, zwei Mitarbeiter) passieren beide `checkDuplicate` (noch nichts
      aufgezeichnet) → beide Dokumente entstehen. Der engine-seitige `storedDuplicate` mildert das,
      aber der Web-Layer hat das Fenster.
      **Fix:** Mit P1-1 zusammen lösen (Dedup pro Akte + atomares Record-or-Reject in der Engine).

- [ ] **P2-7 · Cron-Skalierung: sequenzielle Per-Brain-Enumeration.**
      `post-upload-drain/route.ts:39-49` und `analysis-retry/route.ts:33` iterieren **sequenziell** über
      alle Brains, je mit 15–30 s Timeout und clientseitiger Statusfilterung von 200–500 Docs. Bei 100
      Tenants und ein paar langsamen Engines kann der Drain seine `maxDuration` (300 s) überschreiten und
      nicht fertig werden — Tasks bleiben liegen. Zudem koppelt beides die Ausführung an
      `getRecipientsByBrain()` (Notification-Config), was fachfremd ist.
      **Fix:** Brains parallel (mit `Promise.allSettled` + Nebenläufigkeits-Cap) abfragen; serverseitig
      nach `status` filtern statt 500 Docs zu ziehen; Brain-Enumeration von der Recipients-Logik
      entkoppeln.

- [ ] **P2-8 · Malformed `.json`-Upload wird als transient endlos wiederholt.**
      `web-api.ts:552` macht `JSON.parse(data.toString("utf8"))` ohne try/catch. Eine kaputte `.json` wirft
      → im Handler als `extraction_error` (transient) klassifiziert → bis `max_attempts` wiederholt,
      obwohl das Ergebnis deterministisch bleibt. Zusätzlich sprengt `JSON.parse` auf einer 20-MB-JSON
      den Speicher.
      **Fix:** Parse in try/catch, bei Syntaxfehler `UnsupportedUploadError` (terminal) werfen; Größe der
      JSON vor dem Parse begrenzen.

- [ ] **P2-9 · Größenlimit-Doku driftet.**
      `upload/route.ts:9-12` spricht von „1 GB", `upload-validation.ts:21` defaultet auf 500 MB,
      `next.config.ts` erlaubt „1gb". Effektiv gilt 500 MB, sofern `MAX_UPLOAD_BYTES` nicht gesetzt ist.
      **Fix:** Eine Quelle der Wahrheit; Kommentar an den tatsächlichen Default angleichen.

---

## 3. Positiv-Befunde (schon robust — nicht anfassen)

- **Async-Extract-Handler** (`extract-document.ts`): terminal-vs-transient-Klassifikation, idempotentes
  Re-Read der Bytes aus dem File-Store, garantierter Terminal-Status. Vorbildlich.
- **OCR-Pfad**: ehrliche Placeholder statt Mojibake, `extraction_unverified`-Banner, `looksBinary`-Backstop.
- **Outbox-Idempotenz** nach `(doc_slug, task_type)` mit deterministischem Slug.
- **Security-Kette**: MIME-Allowlist → Magic-Bytes → Executable-Detection (mit korrekter DOCX/XLSX-ZIP-
  Ausnahme) → ClamAV-INSTREAM (settled-Guard, Timeout). Fail-closed.
- **Backoff** in beiden Crons (1→4→16 min bzw. 1→4→16 h) mit sauberem Exhausted/permanently_failed-Zustand
  und `queue-alert`-Schwellwert.

---

## 4. Empfohlene Reihenfolge

1. **P0-1** (relative URL) — 1-Zeilen-Fix, aber reanimiert die komplette Dead-Letter-Queue. Sofort.
2. **P0-2 + P0-3** — Sweeper-Cron einführen und die zwei Blackhole-Pfade schließen. Ein Sweeper deckt beides ab.
3. **P1-1 + P1-2** — die zwei Tagesbetrieb-Breaker (Mehrfachablage, Umlaute). Klein, hohe Sichtbarkeit.
4. **P1-3** — Jurisdiktions-Fehlklassifikation, bevor DE/CH-Kunden onboarden.
5. **P2** — in Ruhe abarbeiten; P2-1 (Reconciliation-Race) und P2-3 (OOM) zuerst, da sie unter Last beißen.
