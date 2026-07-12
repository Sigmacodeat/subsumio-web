# AT Legal Brain Quality Program — Blueprint

> **Ziel**: 100% nachvollziehbare Quellenabdeckung, 100% überprüfbare Zitate, nahezu vollständige Erkennung relevanter Normen, kontrolliertes Stoppen bei Unsicherheit.

## Ist-Zustand (11.07.2026)

| Metrik | Wert | Ziel |
|--------|------|------|
| AT Retrieval Hit@5 | **60.0%** | ≥ 95% |
| AT Retrieval Hit@1 | 36.7% | ≥ 90% |
| AT Retrieval MRR | 0.465 | — |
| AT Fragen im Fixture | 30 | 1.000+ |
| AT Gesetze im Corpus | 86 Dateien | Vollständiges RIS-Inventar |
| AT Judikatur | 413 OGH | OGH+VfGH+VwGH+BVwG+BFG+EuGH |
| Eval Framework | **Platzhalter** (`eval-result-placeholder`) | Echte Pipeline |
| Citation Guardrail | Paragraph-Vorkommen | Aussagebasierte Verifikation |
| Temporale Fassungen | Nicht vorhanden | valid_from/valid_until + Stichtag |
| Fail-closed Gate | Nicht aktiv | Blockiert bei fehlender Evidenz |

### Fehleranalyse der 30 Fragen (12 Misses @ Hit@5)

| ID | Erwartet | Bekommen (Top-3) | Fehlerklasse |
|----|----------|-------------------|--------------|
| at-004 | ABGB § 861 | § 886, § 869, § 936 | Query-Schwäche: "Willensübereinstimmung" nicht erkannt |
| at-006 | ABGB § 883 | § 434, § 1052, § 1053 | Query-Schwäche: "Formvorschriften Liegenschaft" nicht erkannt |
| at-012 | ZPO § 66 | KSchG § 14, ZPO § 433, AufenthG § 4 | Cross-law contamination: KSchG statt ZPO |
| at-014 | ZPO § 464 | MedienG § 15, ZPO § 461, AVG § 63 | Query-Schwäche: "Berufungsfrist" nicht präzise genug |
| at-015 | ZPO § 41 | ZPO § 43, § 40, § 48 | Close miss: benachbarter Paragraph |
| at-017 | UGB § 189 | UStG § 11, UGB § 8, UStG § 18 | Cross-law contamination: UStG statt UGB |
| at-019 | IO § 66 | IO § 183, § 71, § 74 | Query-Schwäche: "Eröffnung" nicht spezifisch genug |
| at-020 | IO § 140 | IO § 156, § 167, § 152 | Query-Schwäche: "Sanierungsplan" nicht erkannt |
| at-023 | AktG § 1 | UGB § 241, UGB § 4-2, AktG § 250 | Cross-law contamination: UGB statt AktG |
| at-024 | AktG § 70 | AktG § 95, GmbHG § 30j, AktG § 108 | Close miss: falscher AktG-Paragraph |
| at-026 | AußStrG § 46 | MRG § 37, AußStrG § 14, § 12 | Cross-law contamination: MRG statt AußStrG |
| at-028 | EStG § 23 | EStG § 29-2, BAO § 188, EStG § 106-2 | Close miss: falscher EStG-Paragraph |

**Fehlerklassen:**
- **Query-Schwäche** (6/12): Natürlichsprachliche Frage → semantische Lücke zum Gesetzestext
- **Cross-law contamination** (4/12): Falsches Gesetz wegen ähnlicher Begriffe
- **Close miss** (2/12): Richtiges Gesetz, falscher Paragraph (benachbart)

## Architektur-Zielbild

```
Dokument/Sachverhalt
    ↓
[1] Rechtsgebiet + Gerichtsbarkeit + Stichtag erkennen
    ↓
[2] Rechtsfragen + Anspruchsgrundlagen extrahieren
    ↓
[3] Normen + Fassungen + Judikatur suchen (mehrstufig)
    ↓
[4] Ergebnisse reranken + Coverage-Check
    ↓
[5] Tatbestandsmerkmale extrahieren
    ↓
[6] Subsumption je Tatbestandsmerkmal
    ↓
[7] Gegenargumente + Ausnahmen prüfen
    ↓
[8] Zitate + Aussagen verifizieren (Aussage-basiert)
    ↓
[9] Qualitäts-Gate (Fail-closed)
    ↓  bestanden → Begründete Antwort
    ↓  nicht bestanden → Nachrecherche oder Human Review
```

## P0 — Sofort (1-2 Wochen)

### P0.1: Echtes Eval-Framework
- Platzhalter in `eval-framework.ts` ersetzen durch echte Pipeline-Ausführung
- Jeder Lauf speichert: Git-Commit, Corpus-Version, Prompt-Version, Retrieval-Konfig, Embedding-Modell, Reranker, Reasoning-Modell, Tokenverbrauch, Latenz, Einzelergebnisse, Fehlertypen
- Keine Änderung ohne Vergleich gegen letzte freigegebene Baseline

### P0.2: Retrieval-Fehleranalyse + Hit@5 ≥ 90%
- 12 Misses klassifizieren: Query-Schwäche, Cross-law, Close miss, Slug-Normalisierung
- Juristische Query-Decomposition implementieren
- Mehrstufiges Retrieval: exact § → BM25 → vector → alias → graph → judikatur → rerank → coverage
- Jurisdiktionsisolation als harter Filter vor dem Ranking
- AT-spezifische Synonym-Erweiterung im `legal-query-expand.ts`

### P0.3: AT-Goldstandard v1
- 200 Retrieval-Fragen (15 Rechtsgebiete × ~13 Fragen)
- 50 End-to-End-Fälle mit Sachverhalt, Normen, Tatbestandsmerkmalen, Musterbegründung
- 20 "nicht beantwortbar"-Fälle
- 10 historische Rechtsfragen
- 10 adversariale Fälle
- JSONL-Format mit Metadaten

### P0.4: RIS-Quellenregister
- Für jedes AT-Gesetz: RIS-Gesetzesnummer, CELEX-ID, offizielle Bezeichnung, Abkürzung, Aliasse, Jurisdiktion, Stammfassung, aktuelle Fassung, Kundmachungsorgan, Inkrafttreten, Außerkrafttreten, Inhalts-Hash, Importstatus
- Identitätsformat: `at:bundesrecht:<gesetzesnummer>:<kurzbezeichnung>`
- Soll-Ist-Abgleich gegen RIS-Inventar

### P0.5: Vollständiger AT-Sync
- `sync-statutes-at.ts` von 6 auf alle ~86 Gesetze erweitern
- Täglich: RIS-Änderungen abrufen, Hash vergleichen, aktualisierte Paragraphen re-importieren
- Strukturelle Integritätsprüfung: Paragraphenfolge, Duplikate, Nummernsprünge, fehlende Absätze

### P0.6: Temporale Fassungen
- Datenmodell: `valid_from`, `valid_until`, `version_id`, `supersedes_version_id`, `source_url`, `content_hash`
- Retrieval: Stichtag-Filter — Anfrage aus 2022 darf nicht Fassung von 2026 anwenden
- Migration: Bestehende Paragraphen als "current" markieren

### P0.7: Aussagebasierte Zitatverifikation
- Nicht nur: "§ 1489 kommt im Kontext vor?"
- Sondern: "Aussage X → genaue Quelle → genaue Textspanne → Normfassung → unterstützt/widerspricht/nicht belegt"
- Fail-closed bei: Norm nicht im Retrieval-Kontext, veraltete Fassung, Entscheidung nicht gefunden, Rechtsbehauptung ohne Quelle

### P0.8: Judikatur-Erweiterung
- VfGH, VwGH, BVwG, BFG, EuGH, EGMR importieren
- Entscheidungsmodell: Gericht, Datum, GZ, Entscheidungsart, Rechtsgebiet, Normen, Rechtssätze, Volltext, Verfahrensgang, Vor-/Folgeentscheidungen
- Rechtsprechungsgraph: Entscheidung → wendet Norm an, bestätigt/weicht ab, zitiert Rechtssatz

### P0.9: Fail-closed Quality Gate
- Blockiert bei: ungrounded citation, veraltete Fassung, fehlende Gegenargumente, Jurisdiktion unklar
- Ergebnis: "Die vorhandenen Quellen reichen für eine belastbare Beurteilung nicht aus."
- Revisionssichere Protokollierung jeder Antwort

## P1 — Danach (3-6 Wochen)

10. Goldstandard auf 1.000+ Fragen erweitern
11. Embedding/Chunking/Reranker A/B-Tests
12. Strukturierte Tatbestands-Subsumption
13. Normen-/Judikaturgraph produktiv
14. Modellvergleich mit eingefrorenem Kontext
15. Shadow Mode mit echten Kanzleifällen

## P2 — Reifephase

16. Landesrecht vollständig
17. Historische Fassungen rückwirkend
18. Kommentare/Literatur anbinden
19. Kontinuierliches anwaltliches Feedback
20. Qualitätswerte je Rechtsgebiet veröffentlichen

## Release-Gates (erste Zielwerte)

| Metrik | Mindestwert |
|--------|---:|
| Norm Recall@5 | ≥ 95% |
| Norm Recall@10 | ≥ 98% |
| richtige Hauptnorm auf Rang 1 | ≥ 90% |
| Citation Precision | ≥ 99,5% |
| erfundene Fundstellen | 0 |
| richtige Jurisdiktion | ≥ 99,9% |
| richtige zeitliche Fassung | ≥ 99% |
| Erkennung obligatorischer Anspruchsgrundlagen | ≥ 95% |
| korrekte Tatbestandsmerkmale | ≥ 95% |
| schwere juristische Fehler | < 0,5% |
| kontrollierte Enthaltung bei fehlender Evidenz | ≥ 99% |

## Definition of Done

- Jede definierte offizielle Quelle inventarisiert
- Keine Quelle ohne Version, Herkunft oder Hash
- Alle Inhalte vollständig geparst und eingebettet
- Jede Rechtsfrage berücksichtigt Stichtag und Jurisdiktion
- Relevante Haupt- und Gegennormen zuverlässig gefunden
- Jede rechtliche Aussage auf exakten Fundstellen
- Erfundene Fundstellen technisch blockiert
- Unsicherheit führt zur Enthaltung
- Ergebnisse über Goldstandard reproduzierbar gemessen
- Keine Verschlechterung unbemerkt in Produktion
