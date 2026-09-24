# Subsumio — Umsetzungsstatus (Management-/Vertriebs-Sicht)

Stand 2026-09-23. Detaillierte technische Quelle:
`docs/blueprints/MARKT-PARITAET-2026-09-22.md`.
Der Verifikations-Block unten wird per `bun run status` regeneriert.

## Kurzfassung

**Alles technisch Codierbare aus dem Markt-Paritäts-Blueprint ist
implementiert und verifiziert** (512 API-Routen, alle Checks grün,
produktiver Build). Verbleibende Lücken sind ausschließlich
**Partner-, Vertrags- und Zertifizierungsentscheidungen** — der Code dafür
(Adapter-Interfaces, UIs, fail-closed `not_configured`-Verhalten) ist
bereits gebaut und geht live, sobald der Vertrag steht.

## Fertig & produktiv nutzbar

| Bereich                       | Umfang                                                                                                                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Akten & Rechnung**          | Aktenzeichen-Schemata, Zeit/Pauschalen/Erfolgshonorar, RATG/AHK/GGG- und RVG/GKG-Positionen im Rechnungsdialog, e-Rechnung (XRechnung/ZUGFeRD + PEPPOL-Versand-Adapter), Akten-Export (ZIP)                                                 |
| **Vorlagen & Dokumente**      | DOCX-Template-Engine + Serienbrief-UI, Briefpapier-Overlay, Versionen mit Word-Diff, Check-in/Check-out, Ordner-Baum (DnD, Persistenz), Auto-Einordnung (`organize_documents`-Tool), DMS-Browser (SharePoint/OneDrive/iManage/NetDocuments) |
| **Mandanten & Kommunikation** | Mandantenportal (Dokumente, Fristen, Workflows, NPS-Feedback), WhatsApp (bidirektional, STOPP/START-Consent), SMS mit dokumentierter Einwilligung, WebDAV/CalDAV-Bridge für Desktop-Clients                                                 |
| **KI & Recherche**            | Copilot mit Grounding/Citations (22 geprüfte Flächen), Review-Sets mit QC (Stichprobe, Cohen-κ, Konflikt-Resolution, signiertes Protokoll), Magic Builder (NL→Automation), OpenAPI 3.1 + ai-plugin.json für externe AI-Clients              |
| **Kanzleialltag**             | Kalender, Fristenbuch, Personal (Urlaubskonto), Controlling, Litigation-Analytics, Mobile App mit Offline-Sync                                                                                                                              |
| **DE-Vorbereitung**           | DE-Fristen (§§ 187–193 BGB), DE-Only/AT-Only-Sidebar je Jurisdiction                                                                                                                                                                        |

## Im Austria-first-Pilot stillgelegt (Code vorhanden, nicht erreichbar)

Die Middleware leitet diese Seiten auf das Dashboard um (308) und beantwortet
ihre APIs mit 410; die Navigation blendet sie aus. Eine Liste steuert beides:
`src/lib/retired-routes.ts`. Reaktivierung = Präfix dort entfernen und den
Ablauf fachlich abnehmen.

| Bereich                        | Stand                                                                     |
| ------------------------------ | ------------------------------------------------------------------------- |
| **beA-Import / beA-Versand**   | Seiten `/dashboard/bea`, APIs `/api/bea/*` stillgelegt                    |
| **DATEV-CSV-Export / -Direct** | Seiten `/dashboard/datev-*`, APIs `/api/datev*` stillgelegt               |
| **RVG-/Fachrechner (DE)**      | APIs `/api/legal/rvg`, `/api/fachrechner` stillgelegt; Karte ausgeblendet |
| **FAO-Fortbildungsnachweis**   | Seite `/dashboard/fao-tracking`, API `/api/fao-tracking` stillgelegt      |

## Wartet auf Entscheidung / Vertrag (Code steht bereit)

| Item                           | Blocker                                                                  | Code-Seite                                                     |
| ------------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------- |
| **beA-Versand (nativ)**        | Eigene Zertifizierung vs. Middleware-Partner (webERV/stp.one)            | `filing-transport.ts` Adapter ✅ (Routen im Pilot stillgelegt) |
| **DATEV-Direktanbindung**      | DATEV-Partnerschaftsantrag                                               | `datev-direct.ts` Interface ✅ (Routen im Pilot stillgelegt)   |
| **Register-Abfragen live**     | Vertrag MEDIX/MANZ/stp.one                                               | `register-adapter.ts` (AT+DE ein Interface) ✅                 |
| **Verlags-Fachliteratur (DE)** | Lizenzgespräche C.H.Beck/Nomos/MANZ — **längster Vorlauf, früh starten** | `LITERATUR_CORPUS.md` Pipeline-Seite ✅                        |
| **QES/PDF-AS**                 | PDF-AS-Server-Deployment                                                 | Code vorhanden                                                 |
| **ISO 27001/42001, BSI C5**    | Prozess/Zertifizierung, kein Code                                        | Security-Nachweise teils vorhanden                             |

## Empfohlene nächste Schritte (Business)

1. **Verlags-Lizenzgespräche DE starten** — der strukturelle Moat
   (Noxtua: >130 Mio. Dokumente) braucht die längste Vorlaufzeit.
2. **beA-Strategie entscheiden** — Partner-Middleware ist in ~1 Sprint
   anschließbar; eigene Zertifizierung dauert Monate.
3. **DATEV-Partnerschaft beantragen** — Schnittstelle ist fertig.
4. **ISO-27001-Prozess anstoßen** — läuft parallel zum Code.

## Verifikation

Generiert von `bun run status` am 2026-09-23 (Commit `87c751796c`).

- **API-Routen:** 515 (gezählt aus `src/app/api/**/route.ts`)
- **Verify:** `bun run verify` — TypeScript, Route-Actions, Grounding-
  Invariant, Design-Tokens, Canonical-Links, Nested-Interactive
- **Tests:** `bun run test:unit` (vitest, inkl. DAV-Bridge-Smoke-Test)

Detail-Nachweis: `docs/blueprints/MARKT-PARITAET-2026-09-22.md`,
Deploy-Crons: `docs/deploy/CRON_SCHEDULE.md`.
