# Subsumio — Umsetzungsstatus (Management-/Vertriebs-Sicht)

Stand 2026-09-23. Detaillierte technische Quelle:
`docs/blueprints/MARKT-PARITAET-2026-09-22.md`.

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
| **Akten & Rechnung**          | Aktenzeichen-Schemata, Zeit/Pauschalen/Erfolgshonorar, RVG/GKG-Rechner AT+DE, e-Rechnung (XRechnung/ZUGFeRD + PEPPOL-Versand-Adapter), Akten-Export (ZIP)                                                                                   |
| **Vorlagen & Dokumente**      | DOCX-Template-Engine + Serienbrief-UI, Briefpapier-Overlay, Versionen mit Word-Diff, Check-in/Check-out, Ordner-Baum (DnD, Persistenz), Auto-Einordnung (`organize_documents`-Tool), DMS-Browser (SharePoint/OneDrive/iManage/NetDocuments) |
| **Mandanten & Kommunikation** | Mandantenportal (Dokumente, Fristen, Workflows, NPS-Feedback), WhatsApp (bidirektional, STOPP/START-Consent), SMS mit dokumentierter Einwilligung, WebDAV/CalDAV-Bridge für Desktop-Clients                                                 |
| **KI & Recherche**            | Copilot mit Grounding/Citations (22 geprüfte Flächen), Review-Sets mit QC (Stichprobe, Cohen-κ, Konflikt-Resolution, signiertes Protokoll), Magic Builder (NL→Automation), OpenAPI 3.1 + ai-plugin.json für externe AI-Clients              |
| **Kanzleialltag**             | Kalender, Fristenbuch, Personal (Urlaubskonto), Controlling, Litigation-Analytics, Mobile App mit Offline-Sync                                                                                                                              |
| **DE-Launch**                 | DE-Fristen (§§ 187–193 BGB), beA-Import mit eEB-Fristauslösung (§ 174 ZPO i.V.m. § 4 ERVG), DATEV-CSV-Export, DE-Only/AT-Only-Sidebar je Jurisdiction                                                                                       |

## Wartet auf Entscheidung / Vertrag (Code steht bereit)

| Item                           | Blocker                                                                  | Code-Seite                                                   |
| ------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------ |
| **beA-Versand (nativ)**        | Eigene Zertifizierung vs. Middleware-Partner (webERV/stp.one)            | `filing-transport.ts` Adapter + `bea/send` + `bea/status` ✅ |
| **DATEV-Direktanbindung**      | DATEV-Partnerschaftsantrag                                               | `datev-direct.ts` Interface ✅ (CSV-Export produktiv)        |
| **Register-Abfragen live**     | Vertrag MEDIX/MANZ/stp.one                                               | `register-adapter.ts` (AT+DE ein Interface) ✅               |
| **Verlags-Fachliteratur (DE)** | Lizenzgespräche C.H.Beck/Nomos/MANZ — **längster Vorlauf, früh starten** | `LITERATUR_CORPUS.md` Pipeline-Seite ✅                      |
| **QES/PDF-AS**                 | PDF-AS-Server-Deployment                                                 | Code vorhanden                                               |
| **ISO 27001/42001, BSI C5**    | Prozess/Zertifizierung, kein Code                                        | Security-Nachweise teils vorhanden                           |

## Empfohlene nächste Schritte (Business)

1. **Verlags-Lizenzgespräche DE starten** — der strukturelle Moat
   (Noxtua: >130 Mio. Dokumente) braucht die längste Vorlaufzeit.
2. **beA-Strategie entscheiden** — Partner-Middleware ist in ~1 Sprint
   anschließbar; eigene Zertifizierung dauert Monate.
3. **DATEV-Partnerschaft beantragen** — Schnittstelle ist fertig.
4. **ISO-27001-Prozess anstoßen** — läuft parallel zum Code.

## Verifikation

Letzter vollständiger Lauf (22./23.09.): `bun run verify` grün —
TypeScript 0 Fehler, 512 API-Routen validiert, 22 AI-Flächen grounded,
Design-Tokens/Links/Nested-Interactive sauber, Build erfolgreich.
