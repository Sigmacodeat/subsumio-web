# Ingestion-Pipeline-Audit (AT-Fokus) — PDF-Auswahl → Klassifizierung → semantische Datenbank

> **Datum:** 2026-07-04
> **Scope:** Gesamte Dokumenten-Pipeline für österreichische Dokumente: Upload im Dashboard, Sicherheits-Checks, Text-Extraktion/OCR, Jurisdiktions- und Dokumenttyp-Erkennung, GZ/ON-Extraktion, 7-Layer-Pipeline, Übernahme in die semantische DB, Sichtbarkeit im Dashboard.
> **Methodik:** Code-Trace der vollständigen Kette (Web-Routen + Engine), jede Aussage mit Dateibezug verifiziert. Kein Live-Test gegen Prod (siehe H2).

---

## 1. Executive Summary

**Gesamturteil: 84/100 — das AT-Fundament ist außergewöhnlich tief, aber die stärksten Bausteine sind nicht miteinander verdrahtet.**

Es existiert bereits: ein deterministischer **GZ-Validator** mit Gattungszeichen-Registry, OCR-Confusable-Erkennung und Konsistenzprüfung über ON-Einträge ([gz-validate.ts](server/src/core/legal/gz-validate.ts)), eine **Frist-Engine** mit §§ 124–126 ZPO, § 222 ZPO verhandlungsfreier Zeit, § 89a GOG Zustellfiktion und AT-Feiertagen ([frist-engine.ts](server/src/core/legal/frist-engine.ts)), ein **ERV-Rückverkehr-Connector** mit Zustellfiktions-Berechnung ([erv-import.ts](server/src/core/ingestion/connectors/erv-import.ts)), ein **ON-Scanner als Layer 1** der 7-Layer-Pipeline mit Quote-Grounding und Retry, ein **$0-Heuristik-Klassifizierer** mit AT-Typen (Anordnungsbogen, Strafantrag, Nichtigkeitsbeschwerde), und ein **7.356-Dateien-AT-Normkorpus** im Repo.

**Der Kernbefund:** Der GZ-Validator — das präziseste Stück AT-Logik im ganzen System — wird **nur vom ERV-Connector aufgerufen, nicht von der Pipeline**. Ein per OCR verfälschtes Aktenzeichen aus einem hochgeladenen PDF durchläuft alle 7 Layer ungeprüft und landet in Fristen, Drafts und der semantischen DB. Dazu kommt: Die Jurisdiktionserkennung hat einen systematischen Fehler (StPO zählt nur für AT), der Human-in-the-Loop-Checkpoint ist im Dashboard nicht erreichbar, und der AT-Normkorpus ist in der Produktions-Engine mutmaßlich unvollständig ingestiert.

| Stufe                     | Score | Kernbefund                                                                                  |
| ------------------------- | ----- | ------------------------------------------------------------------------------------------- |
| Upload-Sicherheit (Web)   | 95    | MIME-Allowlist → Magic-Bytes → ClamAV → SHA-256-Dedup, fail-closed — vorbildlich            |
| Text-Extraktion / OCR     | 90    | Text-Layer-Erkennung, Sparse-Page-Detection, OCR-Fallback mit Unverified-Banner             |
| Jurisdiktionserkennung    | 68    | Heuristik vorhanden, aber StPO-Fehler, kein Confidence-Wert, kein UI-Override               |
| GZ/ON-Erkennung           | 72    | Layer-1-Scanner + Quote-Grounding gut; **deterministische GZ-Validierung nicht verdrahtet** |
| Klassifizierung           | 82    | Layer 0 heuristisch/$0, AT-Typen vorhanden; läuft nur im Pipeline-Kontext                   |
| Semantische Übernahme     | 80    | doc_type/jurisdiction in Frontmatter, Embedding-Backfill; AT-Korpus-Stand ungesichert       |
| Dashboard-Lückenlosigkeit | 70    | Status in Vault/Upload/Strategy-Tab sichtbar; **HITL-Review nirgends erreichbar**           |
| Ausfallsicherheit         | 92    | Persistente Outbox (Engine-Pages), Drain-Cron, Retry-Backoff, Idempotenz-Slugs              |

---

## 2. Die Pipeline, wie sie heute wirklich läuft (verifizierter Trace)

```
DASHBOARD                          WEB-API                         ENGINE
─────────                          ───────                         ──────
Upload-Seite ────────────────────▶ /api/upload ──────────────────▶ /api/upload (web-api.ts)
Vault / Akten-Dok-Tab              │ 1. Content-Length-Gate          │ 1. extractDocumentText:
Intake / Portal                    │ 2. case_slug-Pflicht (§43e)     │    PDF-Textlayer, Sparse-
Connectors (ERV/beA/ADVOKAT)       │ 3. scanUpload:                  │    Detection (<chars/Seite),
  │                                │    MIME → sanitize →            │    OCR-Fallback (pdf2pic+
  │  große Dateien:                │    Magic-Bytes → ClamAV         │    Vision) + Unverified-Banner
  └─▶ /api/upload/presign ───────▶ │ 4. SHA-256-Dedup                │ 2. Split >4MB → part_slugs
      /api/upload/confirm          │ 5. Proxy → Engine               │ 3. detectJurisdiction()
                                   │ 6. Case-Reconciliation          │    (Frontmatter > Heuristik > "at")
                                   │ 7. Outbox: analyze +            │ 4. Frontmatter + Embed
                                   │    contradictions               │    (Backfill-Minion bei noEmbed)
                                   ▼                                 │ 5. AUTO-TRIGGER legal-pipeline
                       /api/cron/post-upload-drain (2 min)           ▼
                       └─▶ /api/legal/analyze (Schnellanalyse,   7-LAYER-PIPELINE (Minion-Job)
                           Deadline/Party-Writeback)             Layer 0: doc-classifier ($0) → doc_type
                                                                 Layer 1: ON-Scanner (Haiku) → on_index
SICHTBARKEIT                                                     │  Quote-Grounding + Retry ✓
────────────                                                     │  validiereGZ ✗ (NICHT verdrahtet!)
Upload-Seite: extraction_status ✓                                Layer 2: Entities → pause_for_review?
Vault: OCR-Filter/Status ✓                                       │  (im Dashboard NICHT schaltbar ✗)
Akte → Strategie-Tab: PipelinePanel ✓                            Layer 3–5m: Forensik/Recht/Fristen/…
Altlasten: Batch-Pipeline-Trigger ✓                              Layer 6: Drafter (jurisdiction-aware)
Review-Queue: needs_human_review ✗                               Layer 7: Ensemble-Critic
```

Ausfallsicherheit ist gut gelöst: Die Post-Upload-Tasks liegen als **Engine-Pages** (idempotente Slugs) in einer Outbox ([post-upload-outbox.ts](src/lib/post-upload-outbox.ts)), der Drain-Cron übernimmt mit Retry-Backoff, Container-Restarts überleben. Der Presign-Pfad für große Dateien speist dieselbe Outbox ([confirm/route.ts](src/app/api/upload/confirm/route.ts)).

---

## 3. Befunde

### P0 — Vertrauenskette GZ/ON und AT-Wissen

**H1 — Der GZ-Validator ist nicht in die Pipeline verdrahtet (der wichtigste Einzelbefund).**
`validiereGZ()` und `pruefeGZKonsistenz()` ([gz-validate.ts](server/src/core/legal/gz-validate.ts)) prüfen Struktur, Gattungszeichen-Registry (C/Cg/Cga/Msch/Ob/St/Hv/…), OCR-Confusables (O↔0, l↔1, S↔5, B↔8), Prüfzeichen-Form und Konsistenz über alle ON-Einträge eines Akts. Aufgerufen wird das ausschließlich vom ERV-Connector. `validateOnEntries()` im Pipeline-Handler ([legal-pipeline.ts:6828](server/src/core/minions/handlers/legal-pipeline.ts)) prüft nur Quote-Grounding (Zitat ≥8 Zeichen im Originaltext), Mappen-Buchstaben und Beilagen-Kennungen — **keine strukturelle GZ-Prüfung, keine OCR-Confusable-Erkennung, keine Leitzahl-Konsistenz**. Folge: Ein gescanntes PDF mit „10 C 125/95l" statt „125/95t" propagiert bis in Fristenkalender, Schriftsatz-Entwürfe und die semantische DB. Genau dieses Szenario ist im Modul-Header von gz-validate.ts als Designziel beschrieben — die letzte Meile fehlt.

**H2 — AT-Normkorpus in Produktion mutmaßlich unvollständig (Grounding-Fundament).**
Der Live-Audit vom 2026-06-30 fand ABGB-Paragraphen in der Prod-Engine mit `word_count: 8` (nur Überschrift, kein Normtext) — systematisch für ABGB, während MRG und DE-BGB Volltext haben. Das korrekte Korpus liegt im Repo (`law-corpus-split/at/`, 7.356 Dateien inkl. ABGB §§ 1–1503), Import-Skripte existieren ([import-statutes-split.ts](server/scripts/import-statutes-split.ts)). Solange das nicht neu ingestiert ist, matched Layer 4 (Law-Matcher) österreichische Ansprüche gegen leere Paragraphen — Citations zeigen auf Überschriften, Gewährleistungsfristen (§ 933 ABGB!) sind nicht belegbar. „Nach dem Gesetz eingerichtet" ist damit für AT NICHT erfüllt, obwohl der Code es kann. _(Stand 30.06. — vor dem Fix gegen Prod verifizieren.)_

### P1 — Erkennung & Kontrolle

**H3 — Jurisdiktionserkennung hat einen systematischen StPO-Fehler.**
`detectJurisdiction()` ([web-api.ts:770](server/src/commands/web-api.ts)) zählt `StPO` als **AT-Indikator** — die StPO ist aber auch die deutsche Strafprozessordnung und fehlt im DE-Score komplett. Ein deutsches Strafverfahrens-PDF (StPO + StGB) kann als AT klassifiziert werden → die gesamte Pipeline (Law-Matcher, Fristen, Drafts) läuft mit österreichischem Recht. Weitere Schwächen: `ON\s?\d` ohne `/g`-Flag (zählt max. 1, inkonsistent zur restlichen Gewichtung), Score-Gleichstand fällt kommentarlos auf „at", kein Confidence-Wert wird persistiert, `BV`/`OR` (CH) sind hochgradig mehrdeutig.

**H4 — Kein Jurisdiktions-/Typ-Override im Upload-Flow, Erkennung unsichtbar.**
Die Upload-Seite ([upload/page.tsx](src/app/dashboard/upload/page.tsx)) bietet kein Jurisdiktions-Feld; die Erkennung läuft engine-seitig und ihr Ergebnis (jurisdiction, doc_type, GZ) wird dem Nutzer **nirgends zur Bestätigung angezeigt**. Für „lückenlos im Dashboard" fehlt der Moment, in dem die Kanzlei sieht: „Erkannt: Österreich · Klage · GZ 10 C 125/24t — korrekt?"

**H5 — Human-in-the-Loop-Checkpoint existiert, ist aber unerreichbar.**
Die Pipeline unterstützt `pause_for_review` (Stopp nach Layer 2, Status `awaiting_review`, Resume ab Layer 3 mit `manual_overrides`) — im gesamten Web-Code gibt es **null Referenzen** darauf. `needs_human_review`/`awaiting_review` tauchen weder in der Review-Queue noch sonst im Dashboard auf. Der Anwalt kann den wichtigsten Kontrollpunkt (Mandant/Gegner korrekt? GZ korrekt?) weder aktivieren noch abarbeiten.

**H6 — Klassifizierung läuft nur im Pipeline-Kontext.**
Layer 0 stampft `doc_type` nur, wenn die Pipeline läuft. Dokumente aus Pfaden, die die Pipeline nicht triggern (ältere Bestände vor dem Auto-Trigger, Portal-Uploads, E-Mail-Import — verifizieren), bleiben `legal_document`. Der Klassifizierer selbst ist solide konservativ; AT-Typen vorhanden. Detail: Tippfehler `"témain"` (statt `témoin`) in den FR-Keywords ([doc-classifier.ts](server/src/core/legal/doc-classifier.ts)).

### P2 — Feinschliff

**H7 — `OcrWarningBanner` ist toter Code** ([ocr-warning-banner.tsx](src/components/dashboard/ocr-warning-banner.tsx)): definiert, nirgends importiert. Extraction-Status wird stattdessen (gut) in Upload/Vault/Dokumente-Tab gezeigt — Banner löschen oder als globalen „N Dokumente warten auf OCR"-Hinweis einbauen.

**H8 — Quote-Grounding-Schwelle lässt kurze GZ durch.** `validateOnEntries` prüft Zitate erst ab 8 Zeichen — „4 Ob 12" (7 Zeichen) entginge der Haystack-Prüfung. Mit H1 (strukturelle Validierung) faktisch abgedeckt, Schwelle trotzdem dokumentieren.

**H9 — Prüfzeichen-Hook leer (bekannt, ok), aber ERV als Ground-Truth ungenutzt.** Wenn derselbe Akt ERV-Rückverkehr hat, ist dessen (validierte) GZ die Referenz — ein Cross-Check Pipeline-GZ ↔ ERV-GZ wäre der stärkste Konsistenzanker überhaupt und beide Datenquellen existieren bereits.

**H10 — ClamAV-Ausfall fail-closed ohne Ops-Sicht.** Upload wird korrekt abgelehnt („Virenscanner nicht erreichbar"), aber das Monitoring-Dashboard zeigt den Scanner-Status nicht — im Kanzleialltag wirkt das wie „Upload kaputt".

---

## 4. Härtungs-Blueprint

### Phase A — GZ/ON-Vertrauenskette schließen (P0, ~2 Tage)

- [ ] **A1** `pruefeGZKonsistenz()` in Layer 1 verdrahten: nach `extractOnEntries()` alle `on_nummer`/GZ-Werte durch den Validator; Befunde (`fehler`/`warnung`/`hinweis`) in die `on_index`-Page schreiben; `schwere: fehler` → Retry mit Befund-Feedback (Mechanismus existiert), nach 2. Fehlschlag → `needs_human_review` — [legal-pipeline.ts:6828](server/src/core/minions/handlers/legal-pipeline.ts)
- [ ] **A2** Leitzahl in die Akten-Frontmatter: konsistenz-geprüfte Leitzahl als `aktenzeichen_validated: true|false` + `verfahrenstyp` (aus Gattungszeichen) auf die Case-Page — Verfahrenstyp steuert bereits Spezialisten-Prompts
- [ ] **A3** ERV-Cross-Check (H9): existiert zur Akte eine ERV-Page, deren validierte GZ gegen die Pipeline-Leitzahl prüfen; Abweichung = `fehler`
- [ ] **A4** Golden-Set erweitern: OCR-Confusable-Fälle (O/0, l/1, Groß-Prüfzeichen), Fremdakt-GZ, ON-Unterordnungen („ON 1.4") in [eval-framework.ts](server/src/core/legal/eval-framework.ts); Gate in CI
- **Akzeptanz:** Ein Testdokument mit absichtlich OCR-verfälschter GZ erzeugt einen sichtbaren Befund statt einer falschen Frist.

### Phase B — AT-Wissensbasis sichern (P0, ~1 Tag + Ops)

- [ ] **B1** Prod-Verifikation: `word_count` je § für ABGB/MRG/ZPO-AT/StGB-AT stichprobenartig abfragen (Engine-API); Befund dokumentieren
- [ ] **B2** Re-Ingest `law-corpus-split/at/` via [import-statutes-split.ts](server/scripts/import-statutes-split.ts) (engine-seitig, DATABASE_URL)
- [ ] **B3** Vollständigkeits-Gate: Doctor-/Cron-Check „§-Seiten mit word_count < 20" pro Gesetzbuch; Alarm ins Monitoring — verhindert stilles Wiederauftreten
- **Akzeptanz:** `/api/legal/statute?ref=§ 933 ABGB` liefert Volltext inkl. Fristen; Layer-4-Grounding zitiert Normtext statt Überschrift.

### Phase C — Jurisdiktionserkennung härten (P1, ~1 Tag)

- [ ] **C1** StPO aus dem AT-Score entfernen oder beidseitig werten; DE-Score um StPO/OWiG/GKV ergänzen; `ON\s?\d`-Zählung mit `/g` konsistent machen — [web-api.ts:770](server/src/commands/web-api.ts)
- [ ] **C2** AT-Signale schärfen: GZ-Muster selbst als starker AT-Indikator (`parseGZ` matcht → +5), „Republik Österreich", „OGH", „RIS-Justiz", PLZ-Muster
- [ ] **C3** Score + Confidence in Frontmatter persistieren (`jurisdiction_confidence`); bei Tie/niedriger Confidence → `jurisdiction_unverified: true`
- [ ] **C4** Unit-Tests: je 5 echte Musterdokumente (AT Klage, DE Strafbefehl, CH Verfügung, EU-VO, gemischt)
- **Akzeptanz:** Deutscher StPO-Schriftsatz wird als DE erkannt; unsichere Fälle sind als solche markiert.

### Phase D — Dashboard-Lückenlosigkeit (P1, ~2–3 Tage)

- [ ] **D1** Upload-Dialog: optionales Feld „Rechtsordnung" (Auto/AT/DE/CH/EU) + „Dokumenttyp", als Frontmatter durchgereicht (Frontmatter schlägt Heuristik — Pfad existiert)
- [ ] **D2** Erkennungs-Bestätigung: nach Abschluss von Layer 0/1 im Dokumente-Tab + Upload-Ergebnis anzeigen: erkannte Jurisdiktion, doc_type, GZ mit Validierungs-Badge (✓ gültig / ⚠ Befunde) — Daten liegen alle in Frontmatter/on_index
- [ ] **D3** `pause_for_review` schaltbar machen: Toggle in Akten-Einstellungen oder beim Batch-Trigger (Altlasten-Seite hat den Trigger bereits); Kanzlei-Default in Settings
- [ ] **D4** Review-Queue-Integration: `awaiting_review`/`needs_human_review`-Pipelines als Einträge in `/dashboard/review-queue` mit Resume-Aktion (Layer-3-Resume-API existiert)
- [ ] **D5** H7/H10: OcrWarningBanner entfernen oder als aggregierten Hinweis einbauen; ClamAV-Reachability ins Monitoring
- **Akzeptanz:** Kompletter Ablauf ohne Terminal: Upload → Erkennung sehen → ggf. korrigieren → Review-Stopp abarbeiten → Ergebnis in Akte.

### Phase E — Klassifizierungs-Vollständigkeit (P2, ~1 Tag)

- [ ] **E1** Backfill-Job: alle Bestandsseiten `type: document` ohne `doc_type` durch Layer 0 nachklassifizieren (Heuristik = $0, gefahrlos)
- [ ] **E2** Nicht-Upload-Pfade verifizieren (E-Mail-Import, Portal, WhatsApp-Dokumente) — triggern sie die Pipeline? Falls nein: Outbox-Task ergänzen
- [ ] **E3** `témain`-Typo fixen; AT-Typen um `erv_erledigung`, `ladung`, `zahlungsbefehl` (Mahnverfahren § 244 ZPO) erweitern
- **Akzeptanz:** `SELECT doc_type, count(*)` über alle Dokumente zeigt < 5 % Fallback auf `legal_document`.

**Aufwand gesamt: ~7–8 Personentage** (Phase B ist überwiegend Ops gegen die Hetzner-Box). Reihenfolge: A und B parallel (unabhängig), dann C, D, E.

---

## 5. Was ausdrücklich NICHT umgebaut wird

- **Upload-Sicherheitskette** (MIME → Magic-Bytes → ClamAV → SHA-256-Dedup, fail-closed) — Referenzqualität.
- **OCR-Pfad** (Sparse-Detection, Vision-Fallback, Unverified-Banner, ehrlicher Placeholder statt Garbage) — genau richtig.
- **Frist-Engine & ERV-Connector** — die AT-Rechtslogik (§ 89a GOG, § 222 ZPO, § 33 AVG, ARG-Feiertage) ist korrekt und getestet; sie bekommt durch Phase A nur bessere Eingangsdaten.
- **Outbox-/Retry-Architektur** — durable, idempotent, cron-gedraint; nicht anfassen.
- **7-Layer-Struktur** — Map-Reduce, Budget-Cap, Retry-mit-Feedback sind solide; die Härtung fügt Validierung ein, kein Redesign.
