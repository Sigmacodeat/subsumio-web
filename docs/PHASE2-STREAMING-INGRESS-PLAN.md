# Phase 2 — Streaming-Upload-Ingress (Implementierungsplan)

> Status: **geplant, NICHT implementiert.** Umsetzung erst mit Deploy-Zugang,
> weil das Abnahmekriterium (10× parallel 500 MB ohne OOM) nur unter echter Last
> testbar ist und der Eingriff sicherheitskritisch ist (Virenscan auf Stream).
>
> Dieser Plan ist umsetzungsfertig: konkrete Dateien, Signaturen, Reihenfolge,
> Test-Gate, Rollback. Stand der Recherche: 2026-06-28.

## Problem (verifiziert)

`express.raw({ type: () => true, limit: maxUploadBytes() })` puffert den
**kompletten** Request-Body in `req.body: Buffer`, **bevor** der Route-Handler
läuft (`server/src/commands/web-api.ts`, beide Upload-Routen: Direct-Upload ~1598
und `/api/upload` ~3341). Bei N parallelen 500-MB-Uploads liegen N×500 MB im RAM.
Ein Limiter _nach_ dem Parsen hilft nicht — der Buffer existiert da schon. Die
einzige echte Lösung ist, den Body als Stream zu verarbeiten und die Datei direkt
auf eine Temp-Datei / in den Storage zu schreiben, ohne sie je vollständig im
Speicher zu halten.

## Aktuelle Buffer-Abhängigkeiten (alle müssen Stream/Path-fähig werden)

| Stelle                            | Datei                                                                                        | Heute                                     | Nachher                                                    |
| --------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------- |
| Multipart-Parse                   | `web-api.ts` `parseMultipart()`                                                              | arbeitet auf `Buffer`                     | busboy-Stream → Temp-Datei                                 |
| Security-Scan                     | `core/upload-security.ts` `inspectUploadBytes(filename, data: Buffer)`                       | Magic-Byte + ClamAV INSTREAM auf `Buffer` | erste 8 KB für Magic-Byte; ClamAV INSTREAM vom File-Stream |
| Persist                           | `web-api.ts` `persistUploadBytes` → `core/file-store.ts` `persistFileBuffer({data: Buffer})` | Buffer → Storage                          | Temp-File-Stream → Storage                                 |
| Dedup-Hash                        | `web-api.ts` `storedDuplicate` / `versionUploadSlug` (`createHash(...).update(data)`)        | Hash über `Buffer`                        | Stream-Hash über Temp-Datei                                |
| Extraktion (sync, kleine Dateien) | `runExtractionAndImport` → `buildMarkdownFromUpload(data: Buffer)`                           | Buffer                                    | Temp-Datei → `readFile` (klein, < Threshold, unkritisch)   |
| Extraktion (async, große Dateien) | `handlers/extract-document.ts` → `readStoredFile`                                            | liest Buffer aus Storage                  | unverändert (Worker, eine Datei isoliert)                  |

**Wichtig:** Der Worker (Phase 1) lädt beim Lesen via `readStoredFile` weiterhin
eine Datei komplett in RAM — das ist akzeptabel, weil isoliert (eine Datei pro
Job, nicht N gleichzeitig im HTTP-Server). Phase 2 löst das **Ingress**-Problem.

## Dependency

`busboy` (battle-tested, pure JS, läuft in Bun). In `server/package.json` zu
`dependencies` + `@types/busboy` zu `devDependencies`. Keine native Build-Stufe.
Begründung der Wahl: kein Hand-Roll eines Multipart-Parsers auf dem
sicherheitskritischen Pfad.

## Zielarchitektur

Neues Core-Modul `server/src/core/streaming-upload.ts`:

```ts
// Parst einen multipart/form-data Request als Stream. Schreibt das EINE
// File-Part nach einer Temp-Datei unter SUBSUMIO_HOME/tmp/uploads/<uuid>;
// puffert nur Felder (klein) im Speicher. Erzwingt das Byte-Limit WÄHREND
// des Streamens (abort + 413, sobald überschritten — kein Vollpuffer nötig).
export async function parseMultipartToTempFile(
  req: IncomingMessage,
  opts: { maxBytes: number; tmpDir: string }
): Promise<{
  fields: Record<string, string>;
  file?: { filename: string; mimeType: string; tmpPath: string; size: number };
  cleanup: () => Promise<void>; // löscht die Temp-Datei (immer im finally aufrufen)
}>;
```

Stream-fähige Security + Hash:

```ts
// core/upload-security.ts — neue Variante, die vom Pfad liest:
export async function inspectUploadFile(
  filename: string,
  tmpPath: string,
  size: number
): Promise<UploadSecurityResult>;
//   - liest die ersten 8 KB für Magic-Byte/Executable (fs.read, kein Vollpuffer)
//   - ClamAV: INSTREAM speist createReadStream(tmpPath) in 64-KB-Chunks
//     (scanClamAv so refaktorieren, dass es eine Quelle Buffer|Readable nimmt)

// core/file-store.ts — Stream-Hash + Stream-Persist:
export async function sha256OfFile(tmpPath: string): Promise<string>;
export async function persistFileFromPath(opts: {
  tmpPath: string;
  filename: string;
  pageSlug: string;
  mimeType?: string;
  sourceId: string;
  storageConfig: unknown;
}): Promise<PersistFileResult>; // createReadStream → storage.upload(stream)
```

## Ingress-Flow nach Umbau (beide Routen)

1. **Kein** `express.raw` mehr für die Upload-Routen — den rohen `req`-Stream an
   `parseMultipartToTempFile` geben. Byte-Limit wird beim Streamen erzwungen.
2. `inspectUploadFile(filename, tmpPath, size)` — Magic-Byte (erste 8 KB) +
   ClamAV (Stream). Bei `!ok` → Temp-Datei löschen, passender 4xx/503.
3. Dedup: `sha256OfFile(tmpPath)` → `storedDuplicate`/`versionUploadSlug`
   (auf Hash umstellen, nicht auf Buffer).
4. `persistFileFromPath(...)` → Storage (Stream).
5. **Threshold-Routing (Phase 1 bleibt):**
   - `size >= asyncExtractMinBytes()` → Stub-Page `processing` + `extract-document`
     Job (Worker liest via `readStoredFile`). Temp-Datei nach Persist löschen.
   - sonst (klein) → `runExtractionAndImport` mit `data = await readFile(tmpPath)`
     (klein, unkritisch), dann Temp-Datei löschen.
6. **`finally`: `cleanup()`** — Temp-Datei in JEDEM Pfad löschen (Erfolg, Fehler,
   413, 415, 422). Plus ein Sweeper-Cron für verwaiste Temp-Dateien (Crash-Fall).

## Betroffene Dateien (Checkliste)

- [ ] `server/package.json` — `busboy` + `@types/busboy`, dann `bun install`.
- [ ] `server/src/core/streaming-upload.ts` — NEU (Parser + Temp-File + Limit).
- [ ] `server/src/core/upload-security.ts` — `inspectUploadFile`; `scanClamAv`
      Quelle `Buffer | Readable`.
- [ ] `server/src/core/file-store.ts` — `sha256OfFile`, `persistFileFromPath`.
- [ ] `server/src/commands/web-api.ts` — beide Routen: `express.raw` → Stream-Parse;
      `inspectUploadBytes` → `inspectUploadFile`; `persistUploadBytes` →
      `persistFileFromPath`; `try/finally cleanup()`. beA-XML-Pfad mitziehen
      (liest heute `file.data.toString("utf8")` — XML ist klein, `readFile` ok).
- [ ] `server/src/commands/web-api.ts` — Temp-Dir-Konstante
      (`SUBSUMIO_HOME/tmp/uploads`), beim Boot anlegen.
- [ ] Sweeper-Cron für verwaiste Temp-Dateien (> 1 h alt) — analog vorhandener
      Cron-Struktur.
- [ ] `server/deploy/hetzner/docker-compose.yml` — `engine-data`-Volume deckt
      `SUBSUMIO_HOME` schon ab; sicherstellen, dass `tmp/uploads` darauf liegt
      (genug Platz für N×500 MB Temp).

## Test-Gate (Abnahme)

Unit-testbar **vorab** (lokal, ohne Deploy):

- [ ] `parseMultipartToTempFile`: korrektes Feld/File-Splitting, Limit-Abbruch
      bei Überschreitung, Temp-Datei-Inhalt == Eingabe.
- [ ] `sha256OfFile` == `createHash` über denselben Buffer (Parität).
- [ ] `scanClamAv(Readable)` == `scanClamAv(Buffer)` für dieselben Bytes
      (gegen einen Fake-INSTREAM-Socket), inkl. EICAR-Testdatei → `FOUND`.
- [ ] `cleanup()` löscht die Temp-Datei in Erfolg- UND Fehlerpfad.

Nur mit **Deploy/Last** verifizierbar (das eigentliche Gate):

- [ ] 10× parallel 500 MB → Container-RSS bleibt unter festem Budget
      (kein OOM); `docker stats` als Beleg.
- [ ] EICAR im Stream → wird abgelehnt (Security-Scan-Integrität bestätigt —
      KEIN stiller Bypass).
- [ ] Funktionsparität: dieselben Dateien wie heute extrahieren identisch
      (Direct-Upload + `/api/upload`, klein + groß, passwortgeschützt, ZIP/PST).

## Rollout / Rollback

- Hinter Env-Flag `SUBSUMIO_STREAMING_UPLOAD=1` ausliefern; default aus →
  alter `express.raw`-Pfad bleibt erreichbar. So ist Rollback ein Env-Toggle,
  kein Redeploy.
- Erst nach grünem Last- + EICAR-Test das Flag default-an schalten.

## Reihenfolge der Umsetzung (wenn Deploy-Zugang da ist)

1. busboy + `streaming-upload.ts` + Unit-Tests (Parser/Limit/cleanup).
2. `sha256OfFile` + `persistFileFromPath` + `scanClamAv(Readable)` + Unit-Tests
   (Hash-Parität, EICAR).
3. `inspectUploadFile`.
4. Routen umbauen, hinter `SUBSUMIO_STREAMING_UPLOAD`-Flag.
5. Deploy → EICAR-Test → 10×500-MB-Lasttest → Funktionsparität.
6. Flag default-an, alten Pfad nach einer stabilen Phase entfernen.
