# Harvey-Parität — Roadmap

> Ehrliche Bestandsaufnahme + priorisierte Liste. Wer diese Liste abarbeitet,
> erreicht echte Agentur-/Harvey-Niveau-Ingestion. Stand: 2026-06-28.
>
> **Produktionsstand:** Commit `ac135335fd`, live auf Hetzner am 2026-06-28.
> Normaler und Direct-Upload wurden live durch Scanner → Originalablage →
> Extraktion → semantische Bereitschaft getestet; EICAR wurde mit HTTP 422
> abgewiesen und die Test-Tenants anschließend vollständig gelöscht.
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

## Phase 0 — Aktuellen Stand shippen — ERLEDIGT

- [x] Code committed und auf `main` gepusht.
- [x] Hetzner-Images für Engine und Web gebaut; DB, Engine, Web, Caddy, Cron und
      ClamAV gesund.
- [x] Normaler und Direct-Upload live getestet; Original persistiert,
      `extraction_status=ready`, `embedding_status=ready`, Outbox persistent.
- [x] EICAR live blockiert; ClamAV-Limits an das 500-MB-Produktlimit angepasst.
- [x] PostgreSQL- und Engine-Dateivolumen-Backup vor dem Deploy erstellt.
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

Passwortgeschützte Dateien werden bewusst synchron und request-scoped
verarbeitet, damit das Kennwort niemals in der persistenten Job-Queue landet.
Post-Upload-Tasks (analyze/contradiction) laufen über die Outbox mit
Retry-Backoff und warten auf Extraktions- und Embedding-Bereitschaft.

## Phase 2 — Streaming-Upload (kein RAM-Buffering) — GEPLANT (Deploy-Gate)

Verifiziert: `express.raw` puffert den Body **vor** dem Handler → es gibt keinen
sicheren Teil-Fix; Phase 2 ist ein sicherheitskritischer Ingress-Komplettumbau
(busboy + Temp-File + Stream-Scan), dessen Abnahme (10×500 MB ohne OOM, EICAR
nicht durchgelassen) nur unter echter Last testbar ist.

**Umsetzungsfertiger Plan: [PHASE2-STREAMING-INGRESS-PLAN.md](PHASE2-STREAMING-INGRESS-PLAN.md)**
— betroffene Dateien, Signaturen, Temp-File-Lifecycle, Env-Flag-Rollout
(`SUBSUMIO_STREAMING_UPLOAD`), Unit-Test-Set (vorab) + Last/EICAR-Gate (Deploy).

- [ ] Umsetzung hinter Rollout-Flag; Last- + Sicherheitstest auf einem Hetzner-
      Staging-Klon sind das Gate (nicht direkt auf der Produktions-VM).
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

## Phase 6 — Beweissichere Ablage und Disaster Recovery (P0)

- [ ] Originale clientseitig oder per Storage-KMS mit tenantbezogenen Schlüsseln
      verschlüsseln; Key-Rotation und Wiederherstellung testen. Eine vorhandene
      App-Encryption-Variable ist kein Beweis für verschlüsselte Binärdateien.
- [ ] Versionierte, immutable Object-Storage-Retention/Object-Lock-Policy plus
      definierte Lösch-/Legal-Hold-Regeln einführen.
- [ ] Automatisches verschlüsseltes Offsite-Backup für PostgreSQL **und**
      Originalobjekte; Restore-Drill mindestens quartalsweise. Das Deploy-Backup
      auf derselben VM ist nur ein Rollback-Punkt, kein Disaster-Recovery.
- [ ] Hash-/Chain-of-custody-Ledger für Upload, Scan, Transformation, OCR und
      Export; periodischer Integritäts-Sweep.
- **Akzeptanz:** Verlust der ganzen Hetzner-VM wird in einer isolierten Umgebung
  innerhalb dokumentierter RPO/RTO vollständig wiederhergestellt.

## Phase 7 — ADVOKAT als echtes SaaS-DMS-Connector-Modell (P0)

- [x] Read-only Export/SMB-Bridge, ZIP-Schutz, Scan, Originalpersistenz,
      Extraktion und Embedding sind implementiert.
- [ ] Connector-Instanzen tenantbezogen modellieren. Der heutige Daemon ist
      installationsweit und kann deshalb in einer Multi-Tenant-Produktivumgebung
      nicht sicher über das Dashboard aktiviert werden.
- [ ] Pro Kanzlei Credential-/Mount-Referenz, Cursor, Delta-Sync, Löschungen,
      Umbenennungen, Retry/DLQ und nachvollziehbaren Sync-Status speichern.
- [ ] ADVOKAT-Partnervertrag/API oder signierten lokalen Windows-Agenten bauen;
      SMB/Export-Watching allein ist keine vollwertige bidirektionale Integration.
- **Akzeptanz:** Zwei Testkanzleien synchronisieren parallel ohne Cross-Tenant-
  Sichtbarkeit; Rename/Delete/Retry und Reconnect sind E2E belegt.

## Phase 8 — Extraktions- und Zitiergenauigkeit (P1)

- [ ] PST-Nachrichten als einzelne Dokumente mit stabilen IDs und Attachment-
      Beziehungen importieren, nicht nur als zusammengeführten Text.
- [ ] Seiten-/Absatz-/Tabellen-/Slide-Provenienz als strukturierte Chunk-Metadaten
      speichern. Separator-Zählen reicht für belastbare Gerichtszitate nicht.
- [ ] OCR-Resultate um Bounding Boxes, Confidence und Seitenrotation ergänzen;
      fehlgeschlagene Einzel-Seiten gezielt erneut verarbeiten.
- [ ] Review-Layer für `partial`/niedrige OCR-Confidence und passwortgeschützte
      Dokumente mit Retry-UI.
- [ ] ZIP-Manifeste und Parent/Child-Beziehungen dauerhaft speichern; partielle
      Fehler pro Archivdatei sichtbar machen.
- **Akzeptanz:** Zitat trifft im Benchmark Seite und Passage; jede abgeleitete
  Aussage ist zum Originalobjekt und Transformationsschritt rückverfolgbar.

## Phase 9 — Betriebsreife und externe Abhängigkeiten (P1)

- [ ] Upstash Redis produktiv konfigurieren oder Rate-Limiting bewusst auf einen
      hochverfügbaren eigenen Store umstellen; aktuell meldet Web die Variablen
      als fehlend.
- [ ] LLM-Credit-/Provider-Failover und Circuit Breaker: aktuell scheitern ältere
      Subagent-Jobs bei erschöpftem Anthropic-Guthaben.
- [ ] Tool-Verträge für Supervisor-Jobs versionieren; vorhandene Jobs referenzieren
      teils ein nicht registriertes Research-Tool.
- [ ] Container-Ressourcen begrenzen, Build/Runtime trennen und Swap/Monitoring
      als Infrastructure-as-Code verwalten.
- [ ] Presigned-Upload erst nach persistenter Session-/Nonce-Ablage und Lasttest
      aktivieren; bis dahin bleibt er zurecht fail-closed deaktiviert.

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
