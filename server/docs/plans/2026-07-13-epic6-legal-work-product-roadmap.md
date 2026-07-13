# Epic 6 — Legal Work Product OS

**Stand:** 2026-07-13  
**Ziel:** Aus der vorhandenen Legal-Reasoning-Basis drei anwaltlich nutzbare, überprüfbare Work Products machen.

## Architekturentscheidung

Die beste Reihenfolge bleibt Evidence-first:

1. Claim–Evidence-Vertrag
2. Work-Product-API und Approval Gates
3. Review-UI
4. Export
5. echte DB-/Provider-Integration
6. Live-Benchmark und Release Gate

Der Grund ist technisch: UI, DOCX, Receipts und Verifier müssen dieselben Claim-IDs und Evidence-Links verwenden. Werden sie vorher separat gebaut, entstehen erneut widersprüchliche Parallelzustände.

## E6.1 Claim–Evidence Contract — erster Slice umgesetzt

Umgesetzt:

- Knoten für Claim/Conclusion sowie Fact, Document Span, Rule und Decision.
- Kanten `supports`, `contradicts`, `defines`, `applies`, `distinguishes`, `overrules`.
- Deterministische, risikogewichtete Evidence Coverage.
- Disputed-/Stale-/Unsupported-Status und fail-closed Publishability.
- Claim-spezifischer „Warum?“-Pfad.
- Adapter aus backend-verifizierter Grounding Map und Canonical Legal Issue.
- Backend-Auflösung eindeutiger, exakter Aktenzitate auf Dokument-Slug und Offsets;
  fehlende oder mehrdeutige Treffer bleiben unverified.
- Receipt-Check und Snapshot-Hash-Artefakte.
- Pipeline schreibt nach Layer 4 `claim-evidence/<case_slug>`.
- Tenant-gebundene GET-API für Graphübersicht und einzelne Claim-Erklärung.

Noch offen in E6.1:

- Judikaturbehandlung aus Precedent Matcher in denselben Graph integrieren.
- Normalisierte/OCR-bedingt abweichende Aktenzitate zusätzlich sicher auflösen;
  exakte und eindeutige Treffer sind bereits angebunden.
- DependencyGraphStore beim Speichern jedes Work Products befüllen.
- Claim-Evidence-Receipt bei finaler Memo-/Fristen-/Schriftsatzfreigabe persistieren.
- Contract-Tests für Pipeline → Page → API → Receipt.

## E6.2 Work-Product Domain und API

### E6.2.1 Gemeinsamer WorkProduct-Vertrag

Felder: `id`, `type`, `case_slug`, `brain_id`, `jurisdiction`, `as_of_date`, `status`, `version`, `content`, `claim_evidence_graph_id`, `receipt_id`, `approval_gates`, `created_by`, `updated_at`.

Statusmaschine:

`draft → generated → needs_review → approved → exported`

Zusätzliche Endzustände: `blocked`, `stale`, `superseded`.

Abnahme:

- Keine Freigabe bei `publishable=false`.
- Jede Änderung an Content oder Graph invalidiert Receipt und Approval.
- Tenant-, Matter- und Rollenprüfung bei jedem Read/Write.

### E6.2.2 Drei Produkte

- Memo: Rechtsfrage, kurze Antwort, Subsumtion, Gegenansicht, offene Fakten, Quellen.
- Fristenreport: Ereignis, Zustellung, Norm, Kalender, Hemmung, Unsicherheit, Anwalt-Bestätigung.
- Schriftsatz: bestätigte Fakten, Anträge, Vorbringen, Beweisanbote, Rechtsausführung, Gegenargumente.

Abnahme:

- Alle drei Produkte referenzieren Claim-IDs statt freie Quellenlisten.
- Approval Gate ist serverseitig, nicht nur UI.
- Jede Version besitzt ein Receipt.

## E6.3 Review-UI

- Zweispaltige Ansicht: Work Product links, Claim-/Evidence-Inspector rechts.
- Claim auswählen → exakte Passage, Quelle, Fassung, Verifikation und Gegenbeleg.
- Filter: unsupported, disputed, stale, high-risk.
- Aktionen: Beleg bestätigen, Beleg ablehnen, Claim umformulieren, als offene Frage markieren.
- Approval-Dialog zeigt Coverage und alle verbleibenden Blocker.

Abnahme:

- „Warum?“ benötigt keinen neuen LLM-Aufruf.
- UI kann Status nicht selbst auf VERIFIED setzen.
- Jeder Review-Schritt wird auditiert.

## E6.4 DOCX-Export

- Serverseitiger Export nur aus `approved` WorkProduct-Version.
- Quellen als klickbare Fußnoten/Endnoten.
- Receipt-ID, Stichtag und Verifikationsstatus im Dokument.
- Blockierung bei Unsupported/Disputed/Stale High-Risk Claims.
- Roundtrip-Test: DOCX rendern, Text/Links/Receipt wieder auslesen und vergleichen.

## E6.5 Integrationshärtung

- Migrationen 004/005/006 in isolierter PostgreSQL-DB ausführen.
- WorkProduct-, ClaimEvidence-, Receipt- und Dependency-Stores round-trip testen.
- Paralleländerungen mit Optimistic Locking testen.
- Tenant-/Matter-Isolation als negative E2E-Tests.
- Queue-Abbruch/Resume darf keine fremde WorkProduct-Version überschreiben.

## E6.6 Live-Evaluation

- Gateway-Adapter in LAB-DACH-Harness injizieren.
- Agentmodell und Judge-Modelle getrennt routen.
- Reale Tokens, Cache, Retries, Latenz und Kosten in Receipts.
- Mock-, Dev-Live- und Release-Live-Runs strikt getrennt kennzeichnen.
- Holdout nur über externen, versiegelten Release-Runner.

## Unmittelbare nächste Tickets

1. E6.1.2 Precedent-/Document-Span-Adapter.
2. E6.1.3 Dependency-Store-Wiring und Graph-Persistenzmigration.
3. E6.2.1 WorkProduct-Vertrag, Store und Statusmaschine.
4. E6.2.2 Memo-API als erster vollständiger vertikaler Produktpfad.
5. E6.3.1 Claim-Evidence-Inspector für Memo.
6. E6.4.1 Memo-DOCX mit Receipt und Quellenlinks.
