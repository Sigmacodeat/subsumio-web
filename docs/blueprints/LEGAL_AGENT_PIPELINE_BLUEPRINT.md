# BLUEPRINT: Legal Agent Pipeline — Automatische Fallaufarbeitung

> **Status:** PRODUKTIONSREIF — Blueprint V2 (implementiert)  
> **Datum:** 2026-06-25 (V2)  
> **Autor:** Principal Engineering  
> **Ziel:** Bei Upload eines Gerichtsakts (PDF) produziert das System automatisch  
> die gleiche Qualität an Aufarbeitung wie die manuelle "Toni Gericht" Mappe.  
> **Implementierung:** `server/src/core/minions/handlers/legal-pipeline.ts` + 4 neue Specialists

---

## 1. ZIEL DES SYSTEMS (aus User-Sicht)

### Was der Anwalt sieht

Nach dem Upload eines Gerichtsakts (z.B. 179MB PDF, 2021 Seiten, ON 1–56)
erhält der Anwalt innerhalb von **~15 Minuten** automatisch:

1. **ON-Zuordnungstabelle** — Jede Ordnungsnummer mit Datum, Typ, Seiten,
   Personen, Verfahren, Anwälten (wie `ON_ZUORDNUNG_V2.txt`)
2. **Personen- & Rollen-Extraktion** — Wer ist Mandant, Gegner, Zeuge,
   Anwalt, Richter, Behörde — mit ON-Bezügen
3. **Forensischer Bericht** — Unterlassene Ermittlungen, Verfahrensdauer,
   Asymmetrien, Einstellungen (wie `FORENSISCHER_BERICHT_HRUSTEMOVIC.txt`)
4. **Schadenstabelle** — Strukturierte Schadenspositionen pro Topf
   (Amtshaftung, DSGVO, Privatbeteiligung) mit Belegen und Status
   (wie `SCHADENSTABELLE_MASTER.txt`)
5. **Fristenkalender** — Alle harten Fristen mit Ampel-System und
   Verantwortungsmatrix (wie `FRISTENKALENDER_BIS_AUGUST_2026.txt`)
6. **Versand-Checkliste** — Konkrete Handlungsanweisungen nach Stufen
   sortiert (wie `VERSAND_CHECKLISTE.txt`)
7. **Schriftsatz-Entwürfe** — AHG-Antrag, Strafantrag, Einspruch,
   Klageentwurf — als erste Drafts (wie `ANTRAG_PAKET_A/B/C/D/E/F`)
8. **Kritische Analyse** — Forensische Bewertung mit EISEN/STARK/MITTEL/SCHWACH
   (wie `KRITISCHE_AMTSHAFTUNGSANALYSE.txt`)

### Was der Anwalt tun muss (manuelle Eingabe)

- **Mandant zuordnen:** "Martin Eckerstorfer ist mein Mandant"  
  (System erkennt Personen, aber nicht automatisch wer der Mandant ist)
- **Gegner zuordnen:** "Adis Hrustemovic ist der Gegner"  
  (System schlägt vor basierend auf Rollen-Signalen)
- **Ermittlungsrichtung:** "Fokus auf Amtshaftung" oder "Fokus auf
  Privatbeteiligung" (System macht beides, aber gewichtet nach Anweisung)
- **Verfahrensart:** Strafsache / Zivilsache / Verwaltungsverfahren

---

## 2. KERN-USERFLOWS

### Flow A: Upload → Automatische Aufarbeitung (Beginner)

```
Anwalt lädt PDF hoch
  → System extrahiert alle Seiten (mergePages: false + ###***###)
  → System splittet in Sub-Pages (splitAndImportLargeDocument)
  → System chunkt + embedded alle Teile
  → TRIGGER: Post-Upload Agent Pipeline startet automatisch
    → Layer 1: ON-Scanner (strukturiert den Akt)
    → Layer 2: Personen/Rollen-Extraktion
    → Layer 3: Forensischer Bericht
    → Layer 4: Schadenstabelle + Fristen
    → Layer 5: Schriftsatz-Entwürfe
    → Layer 6: Qualitäts-Audit (Legal Critic)
  → Anwalt bekommt Dashboard-Benachrichtigung: "Aufarbeitung fertig"
  → Anwalt sieht alle Dokumente im Dashboard
  → Anwalt korrigiert Mandant/Gegner-Zuordnung
  → System re-runn Layer 3-5 mit korrigierten Rollen
```

### Flow B: Interaktive Analyse (Normal)

```
Anwalt öffnet Akte im Dashboard
  → Sieht ON-Zuordnungstabelle (klickbar)
  → Klickt auf ON 40.2.6 → springt zur Seite
  → Sieht forensischen Bericht mit Verlinkung zu ON-Nummern
  → Sieht Schadenstabelle mit Bearbeitungsfunktion
  → Klickt "Schriftsatz generieren" → wählt Template
  → System generiert Draft aus Aktdaten
  → Anwalt bearbeitet, exportiert als PDF
```

### Flow C: Power-User — Gezielte Anfrage (Think API)

```
Anwalt fragt: "Welche Ermittlungsmaßnahmen wurden unterlassen?"
  → Think API durchsucht alle Parts
  → Zitiert konkrete ON-Nummern und Seiten
  → Identifiziert Gaps (was fehlt)
  → Generiert strukturierte Antwort mit Confidence-Score
```

---

## 3. ARCHITEKTUR — 6-LAYER AGENT PIPELINE

```
┌─────────────────────────────────────────────────────────┐
│                    UPLOAD TRIGGER                        │
│  PDF → extract → split → chunk → embed → STORE          │
│  (bestehend, fertig, funktioniert)                       │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│              LAYER 1: ON-SCANNER                         │
│  Input:  Alle Sub-Pages des Uploads                      │
│  Task:   Extrahiere Inhaltsverzeichnis → ON-Tabelle      │
│  Output: structured_page (type: on_index)               │
│  Tools:  get_page, search, query                         │
│  LLM:    Claude Haiku (fast, structured)                 │
│  Quality: Verbatim-Quote-Check (wie analyze-document)    │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│              LAYER 2: ENTITY-EXTRACTOR                   │
│  Input:  ON-Tabelle + alle Sub-Pages                     │
│  Task:   Personen, Firmen, Behörden, Anwälte extrahieren │
│          Rollen zuordnen (Mandant/Gegner/Zeuge/Richter)  │
│          → mit ON-Bezug + Seitenangabe                   │
│  Output: entity pages (people/*, companies/*, courts/*)  │
│          + facts fence (strukturierte Claims)            │
│  Tools:  get_page, search, put_page, resolve_slugs       │
│  LLM:    Claude Haiku (NER + Rollen-Klassifikation)      │
│  Manual: Anwalt bestätigt/korrigiert Mandant + Gegner    │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│              LAYER 3: FORENSIC ANALYST                   │
│  Input:  ON-Tabelle + Entities + Sub-Pages               │
│  Task:   Unterlassene Ermittlungen                       │
│          Verfahrensdauer / Verfahrensstillstand          │
│          Einstellungen + Begründungen                    │
│          Asymmetrien (wer wurde vernommen, wer nicht)    │
│          Amtshaftungsrelevante Punkte                    │
│  Output: structured_page (type: forensic_report)         │
│  Tools:  query, search, get_page, traverse_graph         │
│  LLM:    Claude Sonnet (tiefe Analyse, lange Kontexte)   │
│  Quality: Legal Critic Layer 6 prüft jede Behauptung     │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│              LAYER 4: DAMAGE + DEADLINE EXTRACTOR        │
│  Input:  Forensic Report + ON-Tabelle + Entities         │
│  Task:   Schadenspositionen strukturieren                │
│          → pro Topf (AHG, DSGVO, Privatbeteiligung)      │
│          → mit Beleg (ON + Seite) und Status              │
│          Fristen extrahieren (verbatim, nie berechnen)   │
│          → Ampel-System (🔴🟠🟢)                         │
│          → Verantwortungsmatrix                           │
│  Output: structured_page (type: damage_table)            │
│          structured_page (type: deadline_calendar)       │
│  Tools:  query, search, get_page                         │
│  LLM:    Claude Sonnet (komplexe Querverweise)           │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│              LAYER 5: LEGAL DRAFTER                      │
│  Input:  Forensic Report + Damage Table + Deadlines      │
│  Task:   Schriftsatz-Entwürfe generieren                 │
│          → AHG-Antrag (§ 8 AHG an Finanzprokuratur)      │
│          → Strafantrag (§ 28 StPO an STA)                │
│          → Einspruch (§ 106 StPO)                        │
│          → DSGVO-Beschwerde (Art 82 DSGVO)               │
│          → Klageentwurf (AHG-Klage LG ZRS)               │
│          → Versand-Checkliste                             │
│  Output: structured_page (type: legal_draft) per Paket   │
│  Tools:  query, search, get_page, put_page               │
│  LLM:    Claude Sonnet (formelle juristische Texte)      │
│  Templates: Bestehende legal-schema-pack Vorlagen        │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│              LAYER 6: LEGAL CRITIC (QUALITY GATE)        │
│  Input:  Alle Outputs aus Layer 1-5                      │
│  Task:   Halluzinations-Check (jede Behauptung hat Quote)│
│          Citation-Accuracy (ON-Nummern existieren)       │
│          Rechtsschluss-Fehler (falsche §§)               │
│          Vollständigkeit (fehlende Fristen/Ansprüche)    │
│          Score 0-100 + publish/revise/reject             │
│  Output: audit_page (type: quality_audit)                │
│  Tools:  query, search, get_page, traverse_graph         │
│  LLM:    Claude Sonnet (kritisch, nicht höflich)         │
│  Loop:   Bei "revise" → Layer 3-5 re-run mit Kritik      │
└─────────────────────────────────────────────────────────┘
```

---

## 4. DATENMODELL & STATE-MANAGEMENT

### Neue Page-Types

```yaml
type: on_index
  frontmatter:
    case_slug: "documents/2026-06-03-gesamtakt-gesamtakt"
    total_on: 56
    total_pages: 2021
    aktenzeichen: ["39 St 116/22v", "63 St 85/25s"]
  content: |
    | ON | Datum | Typ | Seiten | Personen | Verfahren | Anwälte |
    |---|---|---|---|---|---|---|
    | ON 1 | 10.10.2023 | Akteneinsicht | 1 | Mather | --- | Kilches-Legal |
    ...

type: forensic_report
  frontmatter:
    case_slug: "documents/..."
    focus: "unterlassene_ermittlungen"
    status: "draft"  # draft → reviewed → final
    critic_score: 87
  content: |
    ## 1. ZUSAMMENFASSUNG DER KERNBEFUNDE
    A. UNTERLASSENE BESCHULDIGTENVERNEHMUNG
    > "Adis Hrustemovic wurde im gesamten Akt NIEMALS als Beschuldigter vernommen"
    > Beleg: ON 1-56, keine Vernehmung protokolliert
    ...

type: damage_table
  frontmatter:
    case_slug: "documents/..."
    total_pots: 3
    total_amount_conservative: 10500000
    currency: EUR
  content: |
    ## TOPF A – AMTSHAFTUNG GEGEN DEN BUND
    | Position | Betrag | Beleg | Status |
    |---|---|---|---|
    | Retaxierung | > 1.500.000 | ON 40.2.3, S.50985 | EISEN |
    ...

type: deadline_calendar
  frontmatter:
    case_slug: "documents/..."
    critical_count: 2
    warning_count: 3
  content: |
    | Datum | Ampel | Frist | Folge |
    |---|---|---|---|
    | 02.08.2026 | 🔴 | Verjährung DSGVO | Anspruch verloren |
    ...

type: legal_draft
  frontmatter:
    case_slug: "documents/..."
    draft_type: "ahg_antrag"  # ahg_antrag, strafantrag, einspruch, klage, ...
    recipient: "Finanzprokuratur"
    status: "draft"
    attorney_review_required: true
  content: |
    ## § 8 AHG ANTRAG
    ...

type: quality_audit
  frontmatter:
    case_slug: "documents/..."
    audited_layers: [1,2,3,4,5]
    total_score: 87
    recommendation: "revise"  # publish, revise, reject
    issues_found: 3
  content: |
    ## AUDIT REPORT
    - [LAYER 3] HALLUCINATION: "§ 190 StPO" nicht im Akt gefunden
    - [LAYER 4] MISSING_DEADLINE: § 1489 ABGB Frist nicht erfasst
    ...
```

### Entity Pages (bestehend, erweitert)

```yaml
# people/martin-eckerstorfer
type: person
frontmatter:
  role: "client"  # client, opponent, witness, lawyer, judge, authority
  case_slug: "documents/..."
  on_references: ["ON 1.4", "ON 1.27", "ON 7.2"]
  mentioned_on_pages: [2021, 2022, ...]
  aliases: ["Eckerstorfer", "M.E.", "MBA"]
  date_of_birth: "1975-06-27"
  address: "Eßlinger Hauptstraße 188B/Haus 4, A-1220 Wien"

# companies/cutting-edge-do
type: company
frontmatter:
  role: "damaged_party"
  case_slug: "documents/..."
  on_references: ["ON 40.2.6"]
  fn_number: "FN 466872b"
  damage_amount: 944200
```

### Pipeline State (neu)

```yaml
# pipeline/state-documents-2026-06-03-gesamtakt-gesamtakt
type: pipeline_state
frontmatter:
  case_slug: "documents/2026-06-03-gesamtakt-gesamtakt"
  status: "running" # pending, running, completed, failed, revised
  current_layer: 3
  layers:
    layer_1_on_scanner: { status: "completed", duration_ms: 45000, output_slug: "..." }
    layer_2_entity_extractor: { status: "completed", duration_ms: 120000, output_slug: "..." }
    layer_3_forensic_analyst: { status: "running", started_at: "..." }
    layer_4_damage_deadline: { status: "pending" }
    layer_5_legal_drafter: { status: "pending" }
    layer_6_legal_critic: { status: "pending" }
  manual_overrides:
    client: "people/martin-eckerstorfer"
    opponent: "people/adis-hrustemovic"
    focus: "amtshaftung"
  total_duration_ms: 0
  created_at: "2026-06-24T15:47:00Z"
```

---

## 5. ARCHITEKTUR-ENTSCHEIDUNGEN

### 5.1 Warum Layer-Architektur (nicht ein monolithischer Prompt)

| Aspekt                   | Monolith                                          | Layer-Pipeline                                       |
| ------------------------ | ------------------------------------------------- | ---------------------------------------------------- |
| **Kontext-Limit**        | 2021 Seiten = 5.3MB → übersteigt jedes LLM-Window | Jeder Layer arbeitet mit gezielten Chunks            |
| **Fehler-Isolation**     | Ein Halluzination → alles falsch                  | Critic fängt pro Layer                               |
| **Wiederverwendbarkeit** | Nur komplett                                      | Layer einzeln re-runbar                              |
| **Nachvollziehbarkeit**  | Black Box                                         | Jeder Layer hat Output + Quote                       |
| **Kosten**               | 1 riesiger Call                                   | 6 kleine Calls, Haiku für Simple, Sonnet für Complex |
| **Parallelisierbar**     | Nein                                              | Layer 1+2 parallel, 3-5 nach 1+2                     |

### 5.2 LLM-Modell-Zuweisung

| Layer                 | Specialist         | Modell          | Modell-ID                             | Begründung                              |
| --------------------- | ------------------ | --------------- | ------------------------------------- | --------------------------------------- |
| 1 — ON-Scanner        | `on-scanner`       | Claude Haiku    | `anthropic:claude-haiku-4-5-20251001` | Pattern-Extraktion, 5x günstiger        |
| 2 — Entity-Extractor  | `entity-extractor` | Claude Haiku    | `anthropic:claude-haiku-4-5-20251001` | NER + Klassifikation                    |
| 3 — Forensic Analyst  | `forensic-analyst` | Claude Sonnet   | `anthropic:claude-sonnet-4-6`         | Tiefe Analyse, Querverweise             |
| 4 — Damage + Deadline | `damage-extractor` | Claude Sonnet   | `anthropic:claude-sonnet-4-6`         | Komplexe Querverweise, §-Logik          |
| 5 — Legal Drafter     | `legal-drafter`    | Claude Sonnet   | `anthropic:claude-sonnet-4-6`         | Formelle juristische Texte              |
| 6 — Legal Critic      | `legal-critic`     | **Claude Opus** | `anthropic:claude-opus-4-7`           | Critic muss schlauer sein als Generator |

**Warum Opus für Layer 6:** Der Critic muss Fehler finden, die Sonnet gemacht hat. Gleiche Modell-Klasse = gleiche blind spots. Opus als Critic = höchste Hallucination-Detection-Rate. Kosten: ~$0.48/Call.

### 5.3 Anti-Hallucination-Strategie (5 Ebenen)

1. **Verbatim-Quote-Gate (pro Layer):** Jede Behauptung MUSS ein Zitat enthalten,  
   das Zeichen-für-Zeichen im Akt vorkommt (wie `groundQuotes` in llm-util.ts).  
   Haystack = ALLE Sub-Pages kombiniert.

2. **ON-Referenz-Check (Cross-Layer):** Jede ON-Nummer in Layer 3-6 Outputs  
   MUSS in der Layer 1 ON-Tabelle existieren.

3. **Entity-Name-Check (Cross-Layer):** Jede Personen-Referenz in Layer 3-6  
   MUSS in der Layer 2 Entity-Tabelle existieren.

4. **Amount-Check:** Jeder Betrag in Layer 4 MUSS als Ziffer im Quelltext  
   vorkommen (mit Tausender-Trennzeichen-Varianten).

5. **Legal Critic (Layer 6, Opus):** Unabhängiger Agent prüft alle Outputs auf:
   - Halluzinierte §§ (Gegenprüfung mit Public-Law-Brain)
   - Falsche ON-Bezüge (Gegenprüfung mit ON-Tabelle)
   - Fehlende Fristen (Gegenprüfung mit Deadline-Regeln)
   - Übersehene Schadenspositionen (Gegenprüfung mit Sachverhalt)
   - Cross-Layer-Konsistenz

### 5.3.1 Cross-Layer-Validation nach jedem Layer

```
Layer 1 → Validate: Alle ONs haben Quote? Quotes im Quelltext?
Layer 2 → Validate: Namen im Quelltext? ON-Refs in Layer 1?
Layer 3 → Validate: Quotes im Quelltext? ONs in Layer 1? Personen in Layer 2?
Layer 4 → Validate: Beträge im Quelltext? ONs in Layer 1? Daten im Quelltext?
Layer 5 → Validate: §§ verifizierbar? ONs in Layer 1? Beträge aus Layer 4?
Layer 6 → Validate: Audit deckt alle Layer? Score plausibel?
```

Fail → Layer re-run mit Fehler-Feedback (1 Retry).

### 5.4 Mandant/Gegner-Zuordnung

```
Phase 1 (automatisch):
  System schlägt Rollen vor basierend auf Signalen:
  - "Beschuldigter" → wahrscheinlich Gegner
  - "Opfer" / "Geschädigter" → wahrscheinlich Mandant
  - "Rechtsanwalt" → Anwalt (welche Seite?)
  - "Staatsanwaltschaft" → Behörde
  - "Zeuge" → Zeuge

Phase 2 (manuell):
  Anwalt bestätigt/korrigiert im Dashboard:
  - Dropdown pro Person: Mandant / Gegner / Zeuge / Anwalt / Behörde
  - Speichern → triggert Re-Run von Layer 3-5

Phase 3 (automatisch):
  System re-runn Layer 3-5 mit korrigierten Rollen
  → forensischer Bericht aus Mandanten-Perspektive
  → Schadenstabelle für Mandanten
  → Schriftsätze mit korrekter Partei-Stellung
```

### 5.5 Chunking-Strategie für Layer 3-5

Problem: 5.3MB Text → kein LLM kann das auf einmal verarbeiten.

Lösung: **Map-Reduce über Sub-Pages**

```
Map-Phase:
  Für jede Sub-Page (part-001, part-002):
    → LLM analysiert diesen Teil
    → Output: Teil-Ergebnis (z.B. "unterlassene Ermittlungen in Teil 1")

Reduce-Phase:
  Alle Teil-Ergebnisse werden zusammengeführt
    → LLM synthetisiert Gesamtergebnis
    → Output: Forensischer Gesamt-Bericht
```

### 5.6 Trigger-Mechanismus

```typescript
// Post-Upload Hook in web-api.ts (nach erfolgreichem splitAndImportLargeDocument)
if (partSlugs.length > 0 || isLargeDocument) {
  // Starte Agent Pipeline als Background-Job
  await queue.enqueue({
    handler: "legal-pipeline",
    data: {
      case_slug: slug,
      part_slugs: partSlugs,
      source_id: tenantSource,
      trigger: "post_upload",
    },
    priority: "normal",
  });
}
```

---

## 6. EDGE-CASES & FEHLERSZENARIEN

| Szenario                          | Behandlung                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------- |
| PDF hat keine ON-Nummern          | Layer 1 meldet "keine Gerichtsakt-Struktur erkannt", Pipeline stoppt nach Layer 1 |
| PDF ist gescannt (OCR)            | Layer 1 arbeitet mit OCR-Text, warnt "Qualität eingeschränkt"                     |
| Mehrere Mandanten im Akt          | System erkennt alle, Anwalt wählt primären Mandanten                              |
| Aktenzeichen nicht extrahierbar   | Layer 1 fragt Anwalt manuell ab                                                   |
| Frist bereits abgelaufen          | Layer 4 markiert als "VERJÄHRT", Layer 5 generiert keinen Entwurf                 |
| LLM nicht verfügbar               | Pipeline pausiert, resumed wenn LLM wieder verfügbar                              |
| Sehr kleiner Akt (<50 Seiten)     | Pipeline läuft trotzdem, aber Layer 1-2 reichen oft aus                           |
| Nicht-Deutsch-Akt                 | Layer 1 erkennt Sprache, warnt, Pipeline versucht trotzdem                        |
| Duplikat-Upload                   | Pipeline erkennt existierende ON-Tabelle, fragt "neu aufarbeiten?"                |
| Legal Critic lehnt ab (score <50) | Pipeline stoppt, Anwalt wird benachrichtigt mit Kritik-Report                     |

---

## 7. UI / DASHBOARD-Integration

### Neue Dashboard-Tabs pro Akte

1. **Übersicht** — Pipeline-Status, Critic-Score, Schnellzugriff auf alle Outputs
2. **ON-Tabelle** — Klickbare Tabelle, springt zur jeweiligen Akt-Seite
3. **Personen** — Entity-Liste mit Rollen, klickbar zu ON-Bezügen
4. **Forensischer Bericht** — Strukturierter Bericht mit ON-Verlinkungen
5. **Schadenstabelle** — Editierbare Tabelle, Belege verlinkt
6. **Fristen** — Kalender-View mit Ampel-System
7. **Schriftsätze** — Liste der Entwürfe, Editier- + Export-Funktion
8. **Audit** — Critic-Report mit Score und Verbesserungsvorschlägen

### Pipeline-Status-Indicator

```
🟢 Aufarbeitung fertig (Score: 87/100)
   Layer 1 ✅ | Layer 2 ✅ | Layer 3 ✅ | Layer 4 ✅ | Layer 5 ✅ | Layer 6 ✅

🟡 Aufarbeitung läuft... (Layer 3/6)
   Layer 1 ✅ | Layer 2 ✅ | Layer 3 ⏳ | Layer 4 ⏸️ | Layer 5 ⏸️ | Layer 6 ⏸️

🔴 Aufarbeitung fehlgeschlagen
   Layer 1 ✅ | Layer 2 ✅ | Layer 3 ❌ (LLM timeout)
   [Retry] [Manual trigger]
```

---

## 8. ARBEITSPAKETE (TASK BREAKDOWN)

### Paket 1: ON-Scanner (Layer 1) — Foundation

- **Ziel:** Extrahiere Inhaltsverzeichnis → strukturierte ON-Tabelle
- **Abhängigkeiten:** Bestehende Upload-Pipeline (fertig)
- **UI:** Neue Page-Type `on_index`, Dashboard-Tab "ON-Tabelle"
- **State:** Pipeline-State-Page, Status-Tracking
- **Akzeptanz:**
  - Alle ON-Nummern erkannt (Vergleich mit manuellem Gold-Standard)
  - Jede ON hat Datum, Typ, Seiten, Personen
  - Verbatim-Quotes für jede Zeile

### Paket 2: Entity-Extractor (Layer 2) — Personen & Rollen

- **Ziel:** Extrahiere alle Personen/Firmen mit Rollen und ON-Bezügen
- **Abhängigkeiten:** Paket 1 (ON-Tabelle)
- **UI:** Entity-Pages, Dashboard-Tab "Personen", Rollen-Dropdown
- **Akzeptanz:**
  - Alle Personen aus Gold-Standard erkannt
  - Rollen-Vorschläge generiert (Beschuldigter → Gegner, etc.)
  - ON-Bezüge pro Person korrekt

### Paket 3: Forensic Analyst (Layer 3) — Tiefenanalyse

- **Ziel:** Forensischer Bericht mit unterlassenen Ermittlungen etc.
- **Abhängigkeiten:** Paket 1 + 2
- **UI:** Page-Type `forensic_report`, Dashboard-Tab
- **Akzeptanz:**
  - Alle Kernbefunde aus Gold-Standard erkannt
  - Jede Behauptung hat Verbatim-Quote + ON-Bezug
  - Map-Reduce über Sub-Pages funktioniert

### Paket 4: Damage + Deadline Extractor (Layer 4)

- **Ziel:** Schadenstabelle + Fristenkalender
- **Abhängigkeiten:** Paket 1-3
- **UI:** Page-Types `damage_table` + `deadline_calendar`, Dashboard-Tabs
- **Akzeptanz:**
  - Alle Schadenspositionen aus Gold-Standard erkannt
  - Töpfe korrekt zugeordnet (AHG, DSGVO, PA)
  - Fristen verbatim, nicht berechnet
  - Ampel-System korrekt

### Paket 5: Legal Drafter (Layer 5) — Schriftsatz-Generierung

- **Ziel:** Entwürfe für alle relevanten Schriftsätze
- **Abhängigkeiten:** Paket 1-4
- **UI:** Page-Type `legal_draft`, Dashboard-Tab mit Export
- **Akzeptanz:**
  - Alle Pakete aus Gold-Standard generiert (A-F)
  - Formell, gerichtssicher formuliert
  - Platzhalter klar markiert
  - Anwalt kann bearbeiten + als PDF exportieren

### Paket 6: Legal Critic (Layer 6) — Quality Gate

- **Ziel:** Unabhängige Qualitätsprüfung aller Outputs
- **Abhängigkeiten:** Paket 1-5
- **UI:** Page-Type `quality_audit`, Dashboard-Tab "Audit"
- **Akzeptanz:**
  - Halluzinationen erkannt und markiert
  - Score 0-100 berechnet
  - Bei "revise" → automatischer Re-Run
  - Bei "reject" → Anwalt-Benachrichtigung

### Paket 7: Pipeline-Orchestrierung

- **Ziel:** Trigger, State-Management, Error-Handling, Retry
- **Abhängigkeiten:** Paket 1-6
- **UI:** Pipeline-Status-Indicator im Dashboard
- **Akzeptanz:**
  - Auto-Trigger nach Upload
  - Status-Tracking pro Layer
  - Retry bei Fehlern
  - Manuelle Trigger möglich
  - Re-Run einzelner Layer möglich

### Paket 8: Dashboard-Integration

- **Ziel:** Alle Tabs, Editier-Funktionen, Export
- **Abhängigkeiten:** Paket 1-7
- **UI:** Neue Tabs pro Akte
- **Akzeptanz:**
  - Alle Outputs im Dashboard sichtbar
  - Mandant/Gegner-Korrektur möglich
  - Re-Run triggert sich automatisch
  - PDF-Export für Schriftsätze

---

## 9. DEFINITION OF DONE

- [x] 4 neue Specialists in `specialist-defs.ts` mit `model`-Feld
- [x] `legal-pipeline` Minion-Handler implementiert (`handlers/legal-pipeline.ts`)
- [x] Map-Reduce pro Layer funktioniert
- [x] Cross-Layer-Validation aktiv (5 Ebenen)
- [x] 7 neue Page-Types im Schema Pack registriert (v2.2.0)
- [x] 12 AT-spezifische Deadline-Rules ergänzt
- [x] Pipeline-State-Tracking
- [x] Handler registriert in `jobs.ts`
- [x] Protected name in `protected-names.ts`
- [x] 60min Handler-Timeout in `handler-timeouts.ts`
- [x] Post-Upload Auto-Trigger in `web-api.ts` (beide Upload-Routen)
- [x] Retry bei Validation-Fail mit Fehler-Feedback (1 Retry pro Layer)
- [x] Parallele Map-Batches (Promise.allSettled statt sequenziell)
- [x] Layer 5 erhält Layer 3+4 Outputs (forensic_report + damage_table)
- [x] §-Verifikation gegen RIS via perplexity_research (forensic-analyst, damage-extractor, legal-critic)
- [x] Critic erhält Original-Akt Sub-Pages für Quote-Verifikation
- [ ] 179MB PDF Upload → automatisch alle 6 Layer durchlaufen (E2E Test)
- [ ] ON-Tabelle hat alle 56 ON-Nummern mit korrekten Metadaten
- [ ] Alle Personen aus Gold-Standard erkannt mit Rollen
- [ ] Forensischer Bericht deckt alle Kernbefunde ab
- [ ] Schadenstabelle hat alle 3 Töpfe mit korrekten Beträgen
- [ ] Fristenkalender hat alle harten Fristen mit Ampel
- [ ] Mindestens 4 Schriftsatz-Entwürfe generiert
- [ ] Legal Critic Score ≥ 80/100
- [ ] Gesamt-Dauer < 30 Minuten
- [ ] Anwalt kann Mandant/Gegner korrigieren → Re-Run funktioniert
- [ ] Alle Outputs im Dashboard sichtbar und klickbar
- [ ] PDF-Export für Schriftsätze funktioniert

### Kosten-Schätzung (2021 Seiten)

| Layer     | Modell | Total Tokens | Kosten              |
| --------- | ------ | ------------ | ------------------- |
| 1         | Haiku  | ~1.85M       | ~$0.46              |
| 2         | Haiku  | ~1.85M       | ~$0.46              |
| 3         | Sonnet | ~1.85M       | ~$5.55              |
| 4         | Sonnet | ~1.85M       | ~$5.55              |
| 5         | Sonnet | ~300K        | ~$0.90              |
| 6         | Opus   | ~100K        | ~$1.60              |
| **Total** |        |              | **~$14.50 pro Akt** |
