# Upload-Engine → „perfekt wie Dropbox/Harvey": Handoff für den nächsten Agenten

> **✅ STATUS-UPDATE 2026-07-06 (Abend): H1–H5 sind inzwischen ALLE umgesetzt und verifiziert.**
> Dieses Dokument ist damit weitgehend historisch — die unten beschriebenen Aufgaben wurden bereits
> erledigt. Es bleibt als Referenz erhalten (Vorgehen/Fallstricke). Aktueller Ist-Zustand:
>
> | ID  | Was                                                                    | Status                                                                                                                                      |
> | --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
> | H1  | Streaming-Client-Hash >256 MB (`hash-wasm`)                            | ✅ umgesetzt (`src/lib/file-hash.ts` `computeFileSha256Streaming`, in `api.ts` verdrahtet, getestet)                                        |
> | H2  | Verwaiste Multipart-Uploads aufräumen                                  | ✅ Cron `upload-multipart-cleanup` → Engine `/api/upload/multipart-cleanup` (`ListMultipartUploadsCommand` + abort), in crontab (stündlich) |
> | H3  | WORM / Integritäts-Re-Verifikation (GoBD)                              | ✅ Cron `integrity-recheck` → Engine `/api/admin/integrity-recheck` (streamendes Re-Hashing, Mismatch-Alert), in crontab (täglich)          |
> | H4  | Einheitliche Per-Datei-Lifecycle-UI                                    | ✅ `src/components/dashboard/upload-lifecycle.tsx` (Dropbox-Stepper), in Upload-Seite verdrahtet, getestet                                  |
> | H5  | Robustheits-Details (Guard token-basiert + Reaper, session-store-Test) | ✅ umgesetzt                                                                                                                                |
>
> **Echte offene Rest-Punkte:** keine kritischen. Optional/kosmetisch siehe „Verbleibende Mikro-Politur" am Ende.
>
> ---
>
> **Datum:** 2026-07-06
> **Kontext:** Die Upload-/Ingestion-Kette wurde über mehrere Sessions gehärtet. Alle P0/P1/P2
> aus [UPLOAD_INGESTION_HARDENING_2026-07-05.md](UPLOAD_INGESTION_HARDENING_2026-07-05.md) sind
> erledigt, plus die End-to-End-Integritätsprüfung (#1) und transparenter Retry (#2, siehe unten).
> Dieses Dokument listet **präzise, was noch fehlt**, damit ein anderer Agent es eigenständig
> umsetzen kann. Jede Aufgabe: Ziel, betroffene Dateien mit Zeilen-Ankern, Vorgehen, Fallstricke,
> Tests, Definition-of-Done.

## Was BEREITS erledigt ist (nicht nochmal machen)

- **Content-Integrität (client → storage → verify):** Client rechnet SHA-256
  ([src/lib/file-hash.ts](../../src/lib/file-hash.ts)), gibt sie als `expected_sha256` im
  Presign-Body mit ([src/lib/api.ts](../../src/lib/api.ts) ~Zeile 2226), Engine verifiziert sie
  streamend gegen die gespeicherten Bytes im Confirm-Handler
  ([server/src/commands/web-api.ts](../../server/src/commands/web-api.ts), Block `END-TO-END CONTENT
INTEGRITY` nach dem `uploaded_size_mismatch`-Check). Mismatch → `uploaded_hash_mismatch` (422),
  Datei gelöscht, Client fällt auf Sync-Pfad zurück. Grenze: Dateien > 256 MB senden keinen
  Client-Hash (Memory) → nur Größencheck. **Genau diese >256-MB-Lücke ist Aufgabe H1 unten.**
- **Transparenter Retry (#2):** `RETRYABLE_STATUS` in [api.ts](../../src/lib/api.ts) enthält jetzt
  429 (+502/504/503), honoriert `Retry-After`, `MAX_RETRIES=4`. Der P2-3-Concurrency-Guard-429
  wird also automatisch abgewartet statt als Fehler angezeigt.
- **OOM-Guards:** Engine ([upload-guard.ts](../../server/src/core/upload-guard.ts)) + Web
  ([upload-concurrency.ts](../../src/lib/upload-concurrency.ts)).
- **Reconcile-Race, ClamAV-Limit, Jurisdiktion, Dedup-pro-Akte, Umlaute, Sweeper-Cron, DLQ-Fix** —
  alle erledigt (siehe Vorgänger-Report).

---

## Was NOCH fehlt — priorisiert

### 🔴 H1 — Streaming-Client-Hash für Dateien > 256 MB (schließt die letzte Integritätslücke)

**Problem:** [file-hash.ts](../../src/lib/file-hash.ts) `computeFileSha256` lädt die Datei als
ein `ArrayBuffer` (`file.arrayBuffer()`) und gibt für Dateien > `DEFAULT_HASH_MAX_BYTES` (256 MB)
`null` zurück (Memory-Schutz). Große Multipart-Uploads (>256 MB) bekommen dadurch **keinen**
Content-Hash → nur der Größencheck greift. Für lückenlose „Dropbox-Garantie" fehlt Streaming-Hashing.

**Ziel:** SHA-256 inkrementell über die 8-MB-Chunks berechnen, die die Multipart-Schleife ohnehin
liest — ohne die ganze Datei in den RAM zu laden.

**Vorgehen:**

1. `bun add hash-wasm` (winzig, WASM, auditierter Streaming-SHA-256). WebCrypto hat **keine**
   inkrementelle API — nicht selbst crypto hand-rollen.
2. In [file-hash.ts](../../src/lib/file-hash.ts) eine `computeFileSha256Streaming(file)` ergänzen:
   `createSHA256()` von hash-wasm, dann `file.stream()` (ReadableStream) oder `file.slice()` in
   8-MB-Schritten lesen und `hasher.update(chunk)` füttern, am Ende `hasher.digest("hex")`.
3. In [api.ts](../../src/lib/api.ts) den Aufruf `computeFileSha256(file)` (~Zeile 2223) ersetzen:
   für den Multipart-Zweig den Streaming-Hash **während** des Part-Uploads mitberechnen (die
   Schleife liest `file.slice(start, end)` bereits — denselben Chunk in den Hasher geben), damit die
   Datei nur einmal gelesen wird.
4. Serverseitig ist **nichts** zu ändern — der Confirm-Verify greift bereits, sobald ein
   `expected_sha256` da ist.

**Fallstricke:** Reihenfolge der Chunks muss strikt sequenziell in den Hasher (SHA-256 ist
ordnungsabhängig). Beim Resume (IndexedDB-Session) muss der Hash über die **ganze** Datei neu
gerechnet werden, nicht nur über die neuen Parts. hash-wasm ist async-init (`await createSHA256()`).

**Tests:** file-hash.test.ts erweitern — bekannter Vektor, aber über Streaming-Pfad; Gleichheit
Streaming-Hash == WebCrypto-Hash für dieselbe Datei.

**Done:** Datei > 256 MB erzeugt einen `expected_sha256`; ein absichtlich verfälschtes Part führt
zu `uploaded_hash_mismatch` im Confirm.

---

### 🟠 H2 — Verwaiste Multipart-Uploads aufräumen (Kosten-/Storage-Leak)

**Problem:** Bricht der Nutzer einen großen Upload ab (Tab zu bei 500 MB), bleiben die S3/R2-Parts
**für immer** liegen — kostet Storage und wird nie gelöscht. Es gibt keinen Cleanup und keine
Lifecycle-Regel. (Die `orphan`-Treffer im Code sind Brain-Page-Orphans via `find_orphans`, NICHT
S3-Multipart.) Der Client ruft zwar bei Complete-Fehler `abort-multipart` auf
([api.ts](../../src/lib/api.ts) ~2437), aber nicht bei Tab-Close/Absturz.

**Ziel:** Unfertige Multipart-Uploads, die älter als N Stunden sind, abbrechen.

**Vorgehen (zwei Optionen, idealerweise beide):**

1. **S3-Lifecycle-Regel** `AbortIncompleteMultipartUpload` (z. B. nach 1 Tag) im Bucket — die
   sauberste Lösung. Deployment/Terraform-seitig; im Storage-Setup dokumentieren
   ([server/src/core/storage/s3.ts](../../server/src/core/storage/s3.ts)).
2. **Cleanup-Cron** als Backstop für Backends ohne Lifecycle (lokaler Storage / R2):
   - Neue Route `src/app/api/cron/upload-multipart-cleanup/route.ts` (Muster: bestehende Crons,
     `createCronHandler`, `getRecipientsByBrain`/Brain-Enum via `mapWithConcurrency`).
   - Engine-Endpoint, der `storage.listMultipartUploads()` (neu, in
     [storage.ts](../../server/src/core/storage.ts) + s3.ts/local.ts implementieren) aufruft und
     Uploads älter als TTL via `storage.abortMultipartUpload()` (existiert bereits, `abort-multipart`)
     abbricht.
   - In [crontab](../../server/deploy/hetzner/crontab) registrieren (z. B. stündlich).

**Fallstricke:** S3 `ListMultipartUploads` ist paginiert. Die `pendingUploads`-Map im Engine-Prozess
ist in-memory und überlebt Restarts nicht — Cleanup muss den Storage direkt fragen, nicht die Map.

**Tests:** Unit-Test für die TTL-Filterlogik (welche Uploads sind „stale").

**Done:** Ein abgebrochener Multipart-Upload ist nach TTL aus dem Bucket verschwunden.

---

### 🟠 H3 — WORM / Unveränderbarkeit + periodische Hash-Re-Verifikation (GoBD-Revisionssicherheit)

**Problem:** Für GoBD/Legal muss das hochgeladene Original **unveränderbar** (write-once) sein, der
Content-Hash im Audit-Log verankert, und es sollte **periodisch re-verifiziert** werden (gespeicherte
Bytes neu hashen, mit gemerktem Hash vergleichen) — um stille Storage-Korruption/Manipulation zu
erkennen. Aktuell wird der SHA-256 nur in der Dedup-System-Page abgelegt
([src/lib/duplicate-store.ts](../../src/lib/duplicate-store.ts)); es gibt keine WORM-Garantie und
keine periodische Re-Verifikation.

**Ziel:** Tamper-evidente, revisionssichere Ablage des Originals.

**Vorgehen:**

1. **Hash im Audit-Log verankern:** Beim erfolgreichen Upload den verifizierten `sha256` +
   `storage_path` + `uploaded_by` + Zeitstempel als Audit-Event schreiben
   ([src/lib/audit.ts](../../src/lib/audit.ts)). Das ist die manipulationssichere Referenz.
2. **WORM auf Storage-Ebene:** S3 Object Lock (Compliance-Mode) bzw. für lokalen Storage
   Read-Only-Flag nach dem Scan-→Clean-Zonenübergang
   ([server/src/core/file-store.ts](../../server/src/core/file-store.ts), `moveFileZone`). Prüfen,
   ob der „clean"-Zonen-Pfad nachträglich überschreibbar ist — falls ja, absichern.
3. **Re-Verifikations-Cron:** Neue Route `src/app/api/cron/integrity-recheck/route.ts`, die
   stichprobenartig (oder rollierend) gespeicherte Dokumente neu hasht (streamend) und gegen den
   im Audit-Log verankerten Hash prüft. Mismatch → Alert (via `queue-alert`-Muster) + Flag am
   Dokument (`integrity_status: "corrupted"`). In [crontab](../../server/deploy/hetzner/crontab)
   registrieren (z. B. täglich, gedrosselt).

**Fallstricke:** Re-Hashing aller Dokumente ist teuer — rollierend/stichprobenartig fahren, nicht
alles auf einmal. S3 Object Lock muss beim Bucket-Erstellen aktiviert sein (nicht nachrüstbar).

**Tests:** Re-Verifikations-Logik (Hash match/mismatch), Audit-Event-Schema.

**Done:** Jedes Original hat einen im Audit-Log verankerten Hash; der Recheck-Cron erkennt eine
absichtlich veränderte Datei und alarmiert.

---

### 🟡 H4 — Einheitliche Per-Datei-Upload-Lifecycle-UI (Dropbox-Feel)

**Problem:** Der Status verteilt sich über getrennte Frontmatter-Felder (`extraction_status`,
`embedding_status`, `analysis_status`). Es gibt kein einzelnes Echtzeit-Surface, das dem Nutzer pro
Datei „Upload % → verifiziert → verarbeitet → analysiert → fertig" zeigt.

**Ziel:** Eine klare, reaktive Statuszeile pro hochgeladenem Dokument.

**Vorgehen:** In der Upload-/Vault-UI die drei Status-Felder zu einer Lifecycle-Anzeige
zusammenführen; die SSE-Phasen aus dem Confirm (`downloading` → `verifying` → `scanning` →
`extracting` → `done`, bereits vorhanden in [api.ts](../../src/lib/api.ts) `parseSseConfirm`) live
anzeigen; danach `analysis_status` via Polling/Realtime nachziehen. Kein Backend-Change nötig — die
Daten existieren alle.

**Done:** Der Nutzer sieht pro Datei eine durchgehende Fortschritts-Lifecycle ohne Rätselraten.

---

### 🟡 H5 — Kleinere Robustheits-Details (aus dem P2-Audit, optional)

- **upload-session-store.ts ohne Test:** Der IndexedDB-Resumable-Store
  ([src/lib/upload-session-store.ts](../../src/lib/upload-session-store.ts)) ist ungetestet
  (schwer deterministisch — fake-indexeddb als Dev-Dep erwägen).
- **upload-guard slot-leak:** [upload-guard.ts](../../server/src/core/upload-guard.ts) `releaseUpload`
  matcht per Größe; kein Reaper falls `res`-Events nie feuern. Auf Token-basiert umstellen (wie der
  Web-Guard [upload-concurrency.ts](../../src/lib/upload-concurrency.ts) es schon macht) + `startedAt`
  für einen Reaper nutzen.
- **Confirm-SSE `verifying`-Phase in der UI:** Progress-Map in api.ts kennt `verifying` bereits;
  sicherstellen, dass die UI-Labels sie anzeigen.

---

## Reihenfolge-Empfehlung für den nächsten Agenten

1. **H1** (Streaming-Hash) — schließt die letzte echte Integritätslücke; klein & abgegrenzt.
2. **H2** (Multipart-Cleanup) — stoppt einen laufenden Kosten-Leak; mittel.
3. **H3** (WORM + Re-Verify) — der Legal-Differenzierer; größer, aber das eigentliche „revisionssicher".
4. **H4/H5** — Politur.

Alle Gates müssen nach jeder Aufgabe grün bleiben: `bun run typecheck` (root + `server/`),
`npx eslint src`, `npx vitest run`, `cd server && bun test`, `npx tsx scripts/check-route-actions.ts`.

---

## Verbleibende Mikro-Politur (nicht blockierend, rein kosmetisch)

Nach der H1–H5-Umsetzung nur noch Nice-to-have — nichts, das eine Kanzlei je bemerkt:

- **Übersprungene „Prüfsumme"-Stufe zeigt ein Häkchen:** Der Lifecycle-Stepper
  ([upload-lifecycle.tsx](../../src/components/dashboard/upload-lifecycle.tsx)) leitet die aktive
  Stufe aus der aktuellen SSE-Phase ab. Falls die Verifikation ausnahmsweise übersprungen wird (kein
  `expected_sha256` — praktisch nur in unsicheren Kontexten, da der Streaming-Hash jetzt alle Größen
  abdeckt), springt die Phase von `downloading` direkt auf `scanning`, und „Prüfsumme" erscheint als
  erledigt statt als übersprungen. Betrifft ~0 % realer Uploads. Fix nur bei Bedarf: pro Stufe einen
  „fired"-Zustand mittracken statt nur den Index.
- **Sync-Fallback-Pfad ohne Sub-Phasen:** Der seltene Sync-Fallback (nur wenn Presign/Storage
  unerreichbar) liefert keine `downloading/verifying/scanning/extracting`-Telemetrie, sondern nur
  `server_processing`. Der Stepper bleibt dann optisch auf „Upload" (Spinner), bis „Fertig". Ehrlich,
  aber weniger granular als der Presign-Pfad. Kein Fix nötig — der Presign-Pfad ist der Normalfall.
- **Stepper-Labels auf sehr schmalen Zeilen:** In `overflow-x-auto` gekapselt; auf sehr schmalem
  Mobile scrollt die Stufenleiste horizontal. Optional: auf Mobile nur die Punkte (ohne Labels) zeigen.
