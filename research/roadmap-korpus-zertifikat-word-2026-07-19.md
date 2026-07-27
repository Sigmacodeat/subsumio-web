# Roadmap: DE-Recherche-Lücke schließen + Vertrauen + Word-Workflow

**Stand:** 19.07.2026 · **Basis:** Live-Abfrage der Produktiv-DB (Hetzner, `sigmabrain`, 67 GB) + Wettbewerbs-Gap-Analyse vom 18.07.2026

---

## 0. Verifizierter DB-Ist-Stand (statt Annahme „49 Dateien")

| Kategorie                                    | Pages                                                                                                                      | Chunks         | Embedded                 | Bewertung                          |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------ | ---------------------------------- |
| judikatur/de                                 | **71.489** (alle 7 Bundesgerichte: BGH 25.580, BFH 11.619, BVerwG 10.285, BAG 7.218, BSG 6.386, BVerfG 5.703, BPatG 4.696) | 513.854        | **100 %**                | ✅ auf Augenhöhe mit Lulius (80k+) |
| **statutes/de**                              | 9.094 Seiten = **nur 29 Gesetze**                                                                                          | 10.908         | **100 %**                | 🔴 **die echte Lücke**             |
| statutes/at                                  | 20.430 (~1.021 Bundesgesetze AT)                                                                                           | 27.481         | 100 %                    | ✅                                 |
| landesrecht/at                               | 15.215                                                                                                                     | 15.521         | 100 %                    | ✅                                 |
| **landesrecht/de**                           | **0**                                                                                                                      | —              | —                        | 🔴 fehlt komplett                  |
| statutes/ch / judikatur/ch                   | 3.953 / 4.338                                                                                                              | 4.119 / 26.093 | 100 %                    | ✅                                 |
| eu (regulations/directives/caselaw/statutes) | 65.125                                                                                                                     | 307.643        | 100 %                    | ✅ stärker als alle Wettbewerber   |
| **Gesamt**                                   | **378.265**                                                                                                                | **2.074.716**  | **100 % — kein Backlog** | Pipeline frei für neuen Import     |

**Die 29 vorhandenen DE-Gesetze** (paragraphenweise zerlegt, Muster `legal/statutes/de/<abk>/p-<n>`):
BGB (2.510 §§), ZPO (1.076), StPO (674), HGB (665), StGB (546), FamFG (524), AO (496), InsO (409), BauGB (288), UrhG (249), EStG (229), ZVG (226), VwGO (212), GG (203), BetrVG (148), GewO (145), GmbHG (114), BDSG (86), UStG (84), RVG (79), KStG (47), UWG (29), StBerG (10), BewG (9), GewStG (8), GrEStG (8), ErbStG (7), LStDV (7), StBVV (6)

**Antwort auf die Frage „sind die schon drin?":** Teilweise — 29 Kerngesetze sind drin und vollständig embedded, aber **~4.570 Bundesgesetze fehlen** (Benchmark Lulius: 4.600+), dazu das gesamte DE-Landesrecht. Die gute Nachricht: Split-Pipeline, Slug-Schema und Embedding-Strecke sind für genau dieses Muster gebaut und erprobt — es ist ein Daten-Import, kein Engineering-Neubau.

---

## 1. Roadmap (priorisiert, mit Aufwand & Wettbewerbs-Impact)

### P0a — Quick Win: Default-Chat-Modell auf EU-only umstellen (1 Tag)

- **Was:** Default `openrouter:deepseek/deepseek-chat` → Anthropic (EU-Region), wie im Hetzner-Runbook ohnehin vorgesehen; Embeddings bleiben OpenAI-3-small via OpenRouter oder direkt OpenAI.
- **Warum:** Alle Wettbewerber werben mit „EU-only"; ein China-Modell als Default ist ein DSGVO-/Marketing-Risiko im Vertrieb.
- **Impact:** Vertrauen/Vertrieb · **Aufwand:** Config + Eval-Lauf (BrainBench-Gate), 1 Tag.

### P0b — DE-Bundesrecht vollständig: 29 → 4.600+ Gesetze (1–2 Wochen)

- **Quelle:** gesetze-im-internet.de (BfJ, amtlich, kostenlos, XML; täglich aktuell — dieselbe Quelle wie Meine Rechtshilfe), alternativ github.com/bundestag/gesetze-Mirrors.
- **Wie:** bestehende Paragraph-Split-Pipeline (`import-at-corpus.ts`/`import-statutes.ts`-Muster) mit Ziel-Schema `legal/statutes/de/<abk>/p-<n>` — identisch zum bewährten 29-Gesetze-Import. `corpus-worker`-Container-Pattern lt. SERVER_INVENTORY §5.
- **Volumen/Kosten:** ~4.600 Gesetze ≈ 300–500k Paragraph-Pages; Embedding-Kosten text-embedding-3-small ≈ **10–25 USD**; Laufzeit bei beobachtetem Durchsatz (513k DE-Judikatur-Chunks in ~1 Tag): **1–2 Tage Embedding**. DB-Wachstum +8–12 GB (von 67 GB; Disk 75 GB → vorher Disk erweitern oder Hetzner Volume, s. Sizing im Runbook!).
- **Priorität innerhalb des Imports** (nach Anwalts-Nachfrage): SGB I–XII (Sozialrecht fehlt komplett!), StVG/StVO/FEG/PflVG (Verkehrsrecht), KSchG/ArbZG/AGG/BUrlG (Arbeitsrecht), AktG/KWG/VAG/WpHG (Gesellschafts-/Bankrecht), VwVfG/OWiG, PatG/MarkenG/DesignG, ProdHaftG, AMG/MDR, EnWG, TKG, VOB/B, StVG-Übriges, dann Long Tail.
- **Impact:** 🔴→✅ Lücke #1 geschlossen; Parität mit Lulius („4.600+ Bundesgesetze") und Meine Rechtshilfe („6.000 Gesetze"), kombiniert mit eurer überlegenen Judikatur+EU-Abdeckung → stärkste freie Primärrechts-Basis im Feld.

### P1 — DE-Landesrecht (2–4 Wochen, parallelisierbar)

- 16 Bundesländer, heterogene Quellen (Landesbauordnungen, SchulG, PolizeiG, Kommunalrecht). AT-Pendant (15.215 Pages) beweist die Pipeline.
- **Impact:** Differenzierung gegenüber Lulius (dort „Landesrecht nicht vollständig"); wichtig für Baurecht-/Verwaltungsrechts-Kanzleien.

### P1 — Zertifizierungspfad ISO 27001 (+ später SOC 2) (6–9 Monate)

- **Basis:** `docs/security/` hat bereits SOC2-Policies, Risk Register, Incident Response, Pen-Test-Prep → ISMS-Substanz vorhanden, nicht formalisiert.
- **Weg:** 1) ISMS-Scope + Statement of Applicability (2–4 Wo) 2) Gap-Assessment extern (1 Wo) 3) Remediation (4–8 Wo) 4) Stage-1/Stage-2-Audit (TÜV/DSZ o. ä.) 5) Zertifikat. **Kosten:** 15–40k € + interne Zeit.
- **Zwischenschritt (Monat 1–2):** externes Pentest mit Bescheinigung + veröffentlichtes Trust Center (wie Libra) → sofort verwertbares Vertriebs-Asset.
- **Impact:** Enterprise-/GK-Deals gegen Noxtua (ISO 42001, BSI C5, TISAX) und Libra (ISO 27001) überhaupt erst pitchfähig.

### P2 — Word-Add-in vom Stub zum MVP (4–8 Wochen)

- **Ist:** `word-addin/` = manifest + 2 Src-Dateien. **Benchmark:** Noxtua draftet direkt in Word mit Änderungsverfolgung; Libra/Harvey/Legora/Prime haben produktive Add-ins.
- **MVP-Scope:** SSO-Login (WorkOS), Chat-Pane mit Korpus-Zitaten, „In Dokument einfügen", Redline-Vorschläge als Word-Tracked-Changes, Fundstellen-Links.
- **Impact:** Der tägliche Anwalts-Workflow läuft in Word — ohne Add-in bleibt Subsumio „zweites Tool".

### P2 — Telefon-KI-Antwort & Kommentarliteratur-Strategie (Entscheidung nötig)

- **Telefon:** JUPUS-USP (einzige im Markt). Optionen: Partner (SIP/KI-Telefonie-Anbieter) statt Eigenbau; WhatsApp-Sekretariat bleibt euer Gegen-USP.
- **Kommentarliteratur:** keine freie Quelle → entweder Verlagslizenz (Nomos/Otto Schmidt/De Gruyter, 5-stellig+/Jahr) oder offene Lehrbuch-/Kommentar-Layer (Open-Access) oder bewusst stehen lassen und „Primärrecht + Judikatur + Kanzlei-Betrieb" positionieren. Gegen Lulius herrscht hier ohnehin Parität (auch keine Kommentare); die Lücke gilt nur ggü. Noxtua/Libra/Prime.

---

## 2. Reihenfolge-Empfehlung (nächste 30 Tage)

| Woche      | Aktion                                                                      | Ergebnis                                         |
| ---------- | --------------------------------------------------------------------------- | ------------------------------------------------ |
| 1          | P0a Modell-Default + Disk-Erweiterung + P0b Import-Start (Top-50-Gesetze)   | EU-only-Marketing, SGB/StVG/KSchG drin           |
| 2          | P0b Rest-Import 4.600 Gesetze + Embedding                                   | „4.600+ Bundesgesetze" auf der Pricing-Page wahr |
| 3–4        | P1 Landesrecht Sprint 1 (BY, NRW, BW, BE) + Trust-Center/Pentest in Auftrag | Landesrecht-Differenzierung + Sicherheits-Asset  |
| ab Woche 5 | ISO-27001-Gap-Assessment + Word-Add-in MVP-Sprint 1                         | Zertifikatspfad + Workflow-Nähe                  |

**Messgrößen:** `# distinct statutes/de Gesetze` (Ziel ≥4.600), Embedding-Coverage 100 %, BrainBench-Gate grün nach Modellwechsel, Pentest-Report, Word-Add-in Beta bei 3 Pilotkanzleien.
