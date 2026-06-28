# Harvey-Parität — Roadmap

> Ehrliche Bestandsaufnahme + priorisierte Liste. Wer diese Liste abarbeitet,
> erreicht echte Agentur-/Harvey-Niveau-Ingestion. Stand: 2026-06-28.
>
> **Leitprinzip:** Vorhandenes nutzen, nichts doppelt bauen. Die Engine hat
> bereits eine reife Job-Queue (`server/src/core/minions/queue.ts` mit
> Backpressure, Leases, Budget-Meter, Progress) und eine definierte
> Extraktions-State-Machine (`src/lib/extraction-status.ts`). Die Lücke ist die
> _Verdrahtung_, nicht die Infrastruktur.

## Was bereits steht (nicht erneut bauen)

- Format-breite Extraktion: PDF/Office/iWork/EML/MSG/PST/ZIP/Bilder/Audio, OCR,
  Tabellen-Provenienz, passwortgeschützte Dateien, Redline/Kommentare.
- Sicherheits-Pipeline: Magic-Byte + ClamAV + Duplikat + Tenant + Token-vor-Buffer.
- Gehärtete Dependencies (siehe `server/SECURITY-DEPENDENCIES.md`).
- Persistente Post-Upload-Outbox (analyze/reconcile/contradiction überlebt Restarts).
- Supervisor-Deep-Research verdrahtet (`/dashboard/research`).
- Reife Job-Queue + Extraktions-State-Machine (definiert, aber im Upload-Pfad
  noch nicht genutzt).

---

## Phase 0 — Aktuellen Stand shippen (sofort)

Der jetzige Code ist weder committed noch deployed. Er ist bereits wertvoll und
darf nicht auf die großen Phasen warten.

- [ ] `/ship` ausführen (VERSION-Bump, CHANGELOG, document-release, Review).
- [ ] Hetzner-Deploy verifizieren (Container baut — lokal lief Docker nie).
- [ ] Smoke-Test des vollen Upload-Pfads gegen Live (Direct-Upload → Outbox →
      Drain-Cron → analyze/contradiction).
- **Akzeptanz:** Live-Upload erzeugt sichtbar einen Outbox-Task, der Drain-Cron
  arbeitet ihn ab, Analyse erscheint am Dokument.

---

## Phase 1 — Asynchrone Extraktions-Pipeline (DIE Kernlücke) — CODE FERTIG, Deploy-Smoke-Test offen

War: `buildMarkdownFromUpload` + `splitAndImportLargeDocument` wurden **synchron
inline** im Upload-Request `await`-et. Eine große Akte blockierte den Request.

Umgesetzt (Schwellwert-Hybrid):

- [x] Gemeinsamer Orchestrator `runExtractionAndImport()` in `web-api.ts` — eine
      Quelle für extract → markdown → split/import → stamp case_slug → tag →
      legal-pipeline. Beide Upload-Routen (Direct-Upload + `/api/upload`) nutzen ihn.
- [x] Schwellwert `SUBSUMIO_ASYNC_EXTRACT_MIN_BYTES` (default 15 MB, `0` = alles
      async): kleine Dateien synchron (sofortige UX), große async.
- [x] Async-Pfad: Bytes persistieren → Stub-Page `extraction_status: "processing"`
      → `extract-document`-Job auf die **vorhandene** `MinionQueue` → sofort
      antworten (`async: true`).
- [x] Neuer Handler `handlers/extract-document.ts`: liest Bytes via
      `readStoredFile`, ruft denselben Orchestrator, stampt terminalen Status.
      Passwort/Unsupported = terminal (kein Retry); sonst = transient (Queue-Retry
      via `max_attempts`). In `registerBuiltinHandlers` registriert, in
      `protected-names` + `handler-timeouts` (60 min) eingetragen.
- [x] Unit-Tests (`test/extract-document-handler.test.ts`, 7 Fälle) +
      Typecheck grün + 116 Tests der Regressions-Slice grün.
- [ ] **Deploy-Smoke-Test (gehört zu Phase 0):** 500-MB-PDF antwortet <2 s mit
      `processing`; Worker extrahiert fertig; Status-Übergang in DB sichtbar;
      Worker-Kill mid-extraction → Job re-leased & abgeschlossen. **Lokal nicht
      testbar (kein Docker) — Gate vor produktivem Vertrauen.**

Folge-Notizen: Passwort-geschützte _große_ Dateien zeigen den Prompt nicht mehr
sofort (Fehler entsteht im Worker) → `extraction_error_code: password_required`
für Phase 3. Post-Upload-Tasks (analyze/contradiction) laufen über die Outbox mit
Retry-Backoff, was die Ordering gegenüber der async-Extraktion natürlich löst.

## Phase 2 — Streaming-Upload (kein RAM-Buffering) — GEPLANT (Deploy-Gate)

Verifiziert: `express.raw` puffert den Body **vor** dem Handler → es gibt keinen
sicheren Teil-Fix; Phase 2 ist ein sicherheitskritischer Ingress-Komplettumbau
(busboy + Temp-File + Stream-Scan), dessen Abnahme (10×500 MB ohne OOM, EICAR
nicht durchgelassen) nur unter echter Last testbar ist.

**Umsetzungsfertiger Plan: [PHASE2-STREAMING-INGRESS-PLAN.md](PHASE2-STREAMING-INGRESS-PLAN.md)**
— betroffene Dateien, Signaturen, Temp-File-Lifecycle, Env-Flag-Rollout
(`SUBSUMIO_STREAMING_UPLOAD`), Unit-Test-Set (vorab) + Last/EICAR-Gate (Deploy).

- [ ] Umsetzung erst mit Deploy-Zugang (Last- + Sicherheitstest sind das Gate).
- **Akzeptanz:** 10 parallele 500-MB-Uploads bringen den Container nicht über ein
  festes Speicher-Budget; RSS bleibt flach; EICAR im Stream wird abgelehnt.

## Phase 3 — Status durchgängig sichtbar (UX)

State-Machine existiert; sie muss bis ins Cockpit poll-/push-bar sein.

- [ ] Dokument-Status (`processing / ready_to_query / failed`) als Badge in der
      Akten-/Cockpit-Ansicht.
- [ ] Polling oder SSE auf den Status; bei `failed` Fehlertext + Retry-Knopf.
- [ ] „ready_to_query" gated die Chat-/Analyse-Aktionen (kein Query auf halb
      extrahierte Doks).
- **Akzeptanz:** Nutzer sieht pro Dokument Live-Status vom Upload bis „abfragbar";
  ein fehlgeschlagenes Dokument ist klar erkennbar und neu anstoßbar.

## Phase 4 — Ingestion-Qualitäts-Benchmark (Beweis)

Ohne Zahlen ist „Harvey-Qualität" eine Behauptung.

- [ ] Test-Korpus: reale Scanqualitäten (sauber/schief/verrauscht), gemischte
      Sprachen, große Akten (100–500 MB), passwortgeschützt, verschachtelte
      ZIP/PST.
- [ ] Metriken: Extraktions-Erfolgsrate, OCR-Fallback-Rate, Zeichen-/Seiten-
      Treue, Zitat-Koordinaten-Genauigkeit (page/char_offset), Latenz p50/p95.
- [ ] Reproduzierbarer Lauf (`bun test` / Eval-Harness) mit committed Baseline.
- **Akzeptanz:** Ein Kommando produziert eine Zahlentabelle; Regressionen fallen
  im Diff auf.

## Phase 5 — Observability der Pipeline

- [ ] Metriken: Queue-Tiefe, Extraktions-Latenz p50/p95, Failure-Rate, OCR-Rate,
      Dead-Letter-Anzahl.
- [ ] Dead-Letter sichtbar + manuell neu-anstoßbar (analog `analysis-retry`).
- [ ] Alarm/Log bei wachsender Queue oder steigender Failure-Rate.
- **Akzeptanz:** Bei einem Extraktions-Stau ist Ursache in <5 min aus den
  Metriken ablesbar.

---

## Reihenfolge & Abhängigkeiten

```
Phase 0 (shippen)  ──►  Phase 1 (async)  ──►  Phase 2 (streaming)
                              │
                              ├──►  Phase 3 (UX-Status)
                              └──►  Phase 5 (observability)
Phase 4 (benchmark) läuft parallel ab Phase 1 (misst die neue Pipeline).
```

Phase 1 + 2 sind die echte Architektur-Parität zu Harveys Vault. 3/4/5 machen es
agentur-belastbar. Phase 0 zuerst, weil fertiger Wert nicht im Branch liegen bleibt.

## Definition of „Harvey-Niveau" (Abnahmekriterium der Gesamtliste)

1. Upload jeder Größe/jedes Formats kehrt sofort zurück; Verarbeitung asynchron.
2. Speicher bleibt unter festem Budget, egal wie groß/viele Dateien.
3. Jedes Dokument hat einen nachvollziehbaren Status bis „abfragbar".
4. Extraktionsqualität ist mit Zahlen belegt, nicht behauptet.
5. Stau/Fehler sind beobachtbar und selbstheilend (Retry/Dead-Letter).
6. Alles deployed und gegen Live smoke-getestet.
