# DEEP AUDIT: Legal Agent Pipeline Blueprint V2

> **Datum:** 2026-06-25 | **Auditor:** Principal Engineering  
> **Methode:** Line-by-line Code-Review aller relevanten Dateien vs. Gold-Standard

---

## 0. EXECUTIVE SUMMARY

Blueprint V1 ist architektonisch korrekt, hat aber **7 kritische Findings**.

| #   | Finding                                              | Severity |
| --- | ---------------------------------------------------- | -------- |
| 1   | 4 neue Specialist-Definitionen fehlen                | KRITISCH |
| 2   | put_page Namespace-Restriktion nicht adressiert      | KRITISCH |
| 3   | Modell-Zuweisung falsch (alle nutzen Sonnet-Default) | KRITISCH |
| 4   | Anti-Hallucination-Gates unvollständig               | KRITISCH |
| 5   | AT-spezifische Deadline-Rules fehlen im Schema Pack  | MODERATE |
| 6   | Neue Page-Types nicht im Schema Pack registriert     | MODERATE |
| 7   | Supervisor vs. Pipeline-Handler Architektur unklar   | MODERATE |

---

## 1. FEHLENDE SPECIALIST-DEFINITIONEN

### Code-Realität

`@/Users/msc/subsumio-web/server/src/core/minions/specialist-defs.ts:40-152`  
definiert 6 Specialists: `legal-researcher`, `legal-analyst`, `legal-strategist`, `legal-drafter`, `legal-critic`, `legal-deadline-extractor`.

**Problem:** Keiner deckt die Gold-Standard-Outputs ab. Die Prompts sind zu generisch.

### V2: 4 neue Specialists + Prompt-Overhaul

#### Layer 1: `on-scanner` (Haiku, 15 turns)

**Prompt-Kern:** Pattern-Extraktion `ON \d+(\.\d+)*` → strukturierte Tabelle mit on_nummer, datum, typ, seiten, personen, verfahren, anwaelte, quote. Hallucination-Gate: Jede ON MUSS wörtlich im Text vorkommen. Sortierung numerisch.

#### Layer 2: `entity-extractor` (Haiku, 15 turns)

**Prompt-Kern:** NER aller Personen/Firmen/Behörden. Rollen-Klassifikation: beschuldigter→GEGNER, opfer→MANDANT, zeuge, anwalt, richter, behoerde. ON-Bezüge pro Entity. Deduplizierung mit aliases. Hallucination-Gate: Jeder Name MUSS wörtlich im Text stehen.

#### Layer 3: `forensic-analyst` (Sonnet, 25 turns)

**Prompt-Kern:** Bericht-Struktur nach Gold-Standard: Zusammenfassung (A-F), Chronologie, unterlassene Ermittlungen, nicht vernommene Personen, Geldfluss, Amtshaftungspunkte. Jede Behauptung braucht `quote` + `on` + `paragraph`. Output als JSON.

#### Layer 4: `damage-extractor` (Sonnet, 20 turns)

**Prompt-Kern:** Zwei Tasks: (A) Schadenstabelle mit Töpfen (ahg, dsgvo, privatbeteiligung, zivilklage), jeder Position mit betrag, beleg_on, beleg_quote, status (EISEN/STARK/MITTEL/SCHWACH). (B) Fristenkalender VERBATIM (nie berechnen), Ampel-System, beleg_on, beleg_quote. Output als JSON.

---

## 2. PUT_PAGE NAMESPACE-RESTRIKTION

### Code-Realität

`@/Users/msc/subsumio-web/server/src/core/minions/tools/brain-allowlist.ts:131-161`

Subagents können nur unter `wiki/agents/<subagentId>/...` schreiben. `allowed_slug_prefixes` kann dies erweitern (v0.23).

### V2: Pipeline-Handler schreibt, nicht der Specialist

Specialists geben **JSON zurück**. Der Pipeline-Handler (trusted local caller, `remote=false`) schreibt die strukturierten Pages via `engine.putPage()`.

```
Specialist (subagent) → JSON Response
  ↓
Pipeline-Handler (minion handler, trusted) → engine.putPage("people/adis-hrustemovic", ...)
  ↓
Page landet unter korrektem Slug
```

**Warum nicht `allowed_slug_prefixes`:** Security-Risk für multi-tenant. Der Handler ist trusted und kann sicher schreiben.

---

## 3. MODELL-ZUWEISUNG

### Code-Realität

`@/Users/msc/subsumio-web/server/src/core/minions/handlers/subagent.ts:60`: `DEFAULT_MODEL = 'claude-sonnet-4-6'`

Keiner der 6 existing Specialists hat `model` gesetzt → **alle nutzen Sonnet**.

`@/Users/msc/subsumio-web/server/src/core/model-config.ts:57-79`: Aliases: opus→`anthropic:claude-opus-4-7`, sonnet→`anthropic:claude-sonnet-4-6`, haiku→`anthropic:claude-haiku-4-5-20251001`

### V2: Korrigierte Modell-Zuweisung

| Layer | Specialist                  | Modell     | Modell-ID                             | Begründung                                                     |
| ----- | --------------------------- | ---------- | ------------------------------------- | -------------------------------------------------------------- |
| 1     | on-scanner                  | **Haiku**  | `anthropic:claude-haiku-4-5-20251001` | Pattern-Extraktion, kein Deep-Reasoning, 5x günstiger          |
| 2     | entity-extractor            | **Haiku**  | `anthropic:claude-haiku-4-5-20251001` | NER + Klassifikation, strukturiert                             |
| 3     | forensic-analyst            | **Sonnet** | `anthropic:claude-sonnet-4-6`         | Tiefe Analyse, Querverweise                                    |
| 4     | damage-extractor            | **Sonnet** | `anthropic:claude-sonnet-4-6`         | Komplexe Querverweise, §-Logik                                 |
| 5     | legal-drafter               | **Sonnet** | `anthropic:claude-sonnet-4-6`         | Formelle juristische Texte                                     |
| 5b    | legal-drafter (Klage >5Mio) | **Opus**   | `anthropic:claude-opus-4-7`           | Höchste Präzision bei hohem Streitwert                         |
| 6     | legal-critic                | **Opus**   | `anthropic:claude-opus-4-7`           | Critic muss schlauer sein als Generator (blind-spot avoidance) |

**Wichtig:** `model` MUSS in jedem SpecialistDef gesetzt werden. Ohne → Sonnet-Default.

**Opus für Layer 6:** Der Critic muss Fehler finden, die Sonnet gemacht hat. Gleiche Modell-Klasse = gleiche blind spots. Opus als Critic = höchste Detection-Rate. Kosten: ~$0.48/Call — vertretbar.

---

## 4. ANTI-HALLUCINATION-GATES UNVOLLSTÄNDIG

### Code-Realität

`@/Users/msc/subsumio-web/server/src/core/legal/llm-util.ts:130-150`: `groundQuotes()` prüft nur Zitat gegen EINEN `documentText`.

### V2: 5-Ebenen-Hallucination-Gate

1. **Verbatim-Quote-Gate** (bestehend, erweitert): haystack = ALLE Sub-Pages kombiniert (nicht nur eine)
2. **ON-Referenz-Check** (NEU): Jede ON in Layer 3-6 MUSS in Layer 1 ON-Tabelle existieren
3. **Entity-Name-Check** (NEU): Jede Personen-Referenz in Layer 3-6 MUSS in Layer 2 Entity-Tabelle existieren
4. **Amount-Check** (NEU): Jeder Betrag in Layer 4 MUSS als Ziffer im Quelltext vorkommen (mit Tausender-Trennzeichen-Varianten)
5. **Legal-Critic** (Layer 6, erweitert): Cross-Layer-Konsistenz + §-Verifikation gegen Public-Law-Brain/RIS

### Cross-Layer-Validation nach jedem Layer

```
Layer 1 → Validate: Alle ONs haben Quote? Quotes im Quelltext?
Layer 2 → Validate: Namen im Quelltext? ON-Refs in Layer 1?
Layer 3 → Validate: Quotes im Quelltext? ONs in Layer 1? Personen in Layer 2?
Layer 4 → Validate: Beträge im Quelltext? ONs in Layer 1? Daten im Quelltext?
Layer 5 → Validate: §§ verifizierbar? ONs in Layer 1? Beträge aus Layer 4?
Layer 6 → Validate: Audit deckt alle Layer? Score plausibel?
```

Fail → Layer re-run mit Fehler-Feedback (1 Retry).

---

## 5. AT-SPEZIFISCHE DEADLINE-RULES FEHLEN

### Code-Realität

`@/Users/msc/subsumio-web/src/lib/legal-schema-pack.ts:409-423`: 13 Deadline-Rules, alle DE-spezifisch (BGB, ZPO, StGB). **Keine einzige AT-Regel.**

### V2: AT-Rules ergänzen

```
ahg_verjaehrung, ahg_aufforderung_hemmung, ahg_klagefrist,
abgb_1489_verjaehrung, abgb_1489_hemmung,
spo_106_einspruch, spo_195_fortfuehrung, spo_193_abs2_neue_beweise, spo_28_ermittlungsantrag,
dsgvo_art82_schadensersatz, dsgvo_art77_beschwerde,
emrk_art6_verzoegerung
```

---

## 6. NEUE PAGE-TYPES NICHT IM SCHEMA PACK

### Code-Realität

`@/Users/msc/subsumio-web/src/lib/legal-schema-pack.ts:122-267`: 12 Page-Types registriert. Keiner der Blueprint-V1-Types.

### V2: 7 neue Page-Types für Schema Pack v2.2.0

`on_index`, `forensic_report`, `damage_table`, `deadline_calendar`, `legal_draft`, `quality_audit`, `pipeline_state` — jeweils mit required/optional frontmatter, link verbs, matter_scoped, gobd_relevant.

---

## 7. SUPERVISOR vs. PIPELINE-HANDLER

### Code-Realität

`@/Users/msc/subsumio-web/server/src/core/minions/handlers/supervisor.ts:112-340`: Supervisor mit Auto-Dekomposition, Wave-Execution, Critic + 1 Revise-Runde, persistiert als `agent_run` Page.

### V2: Neuer `legal-pipeline` Minion-Handler

Nutzt `MinionQueue` + `InboxCollector` (wie Supervisor), aber:

- **Feste 6-Layer-Sequenz** (keine Auto-Dekomposition)
- **Map-Reduce pro Layer** (neu — Supervisor hat das nicht)
- **Pipeline-State-Page** (neu)
- **Strukturierte Page-Outputs** (neu — Supervisor schreibt nur `agent_run`)
- **Cross-Layer-Validation** (neu)
- **Re-Run einzelner Layer** (neu)
- **Pipeline-Handler schreibt Pages** (trusted, nicht Subagent)

```
legal-pipeline handler
  ├── Layer 1: Map (3 Haiku-Calls) → Reduce → validate → write on_index page
  ├── Layer 2: Map (3 Haiku-Calls) → Reduce → validate → write entity pages
  ├── Layer 3: Map (9 Sonnet-Calls) → Reduce → validate → write forensic_report page
  ├── Layer 4: Map (6 Sonnet-Calls) → Reduce → validate → write damage_table + deadline_calendar
  ├── Layer 5: 6 parallel Sonnet-Calls → validate → write legal_draft pages
  ├── Layer 6: 1 Opus-Call → write quality_audit page
  └── State: update pipeline_state page nach jedem Layer
```

---

## 8. MAP-REDUCE DETAIL

### Context-Limits & Batching

Sub-Pages: ~150KB each ≈ ~50K tokens. Haiku/Sonnet/Opus: 200K token window.

| Layer     | Modell | Sub-Pages/Batch | Batches  | Gesamt-Calls          |
| --------- | ------ | --------------- | -------- | --------------------- |
| 1         | Haiku  | 12              | 3        | 3 Map + 1 Reduce = 4  |
| 2         | Haiku  | 12              | 3        | 3 Map + 1 Reduce = 4  |
| 3         | Sonnet | 4               | 9        | 9 Map + 1 Reduce = 10 |
| 4         | Sonnet | 6               | 6        | 6 Map + 1 Reduce = 7  |
| 5         | Sonnet | —               | 6 Pakete | 6                     |
| 6         | Opus   | —               | 1        | 1                     |
| **Total** |        |                 |          | **32 LLM-Calls**      |

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

---

## 9. RE-RUN BEI MANDANT/GEGNER-KORREKTUR

```
Anwalt ändert Rolle: "Adis Hrustemovic" von beschuldigter → GEGNER
  → Pipeline-State: layer_2_status = "needs_rerun"
  → Re-Run Layer 3-5 (nicht 1-2, die sind rollen-unabhängig)
  → Layer 3: forensischer Bericht aus Mandanten-Perspektive
  → Layer 4: Schadenstabelle für Mandanten
  → Layer 5: Schriftsätze mit korrekter Partei-Stellung
  → Layer 6: Critic re-audited
  → Pipeline-State: completed
```

---

## 10. DEFINITION OF DONE (V2)

- [ ] 4 neue Specialists in `specialist-defs.ts` mit `model`-Feld
- [ ] `legal-pipeline` Minion-Handler implementiert
- [ ] Map-Reduce pro Layer funktioniert
- [ ] Cross-Layer-Validation aktiv (5 Ebenen)
- [ ] 7 neue Page-Types im Schema Pack registriert
- [ ] 12 AT-spezifische Deadline-Rules ergänzt
- [ ] Pipeline-State-Tracking
- [ ] Re-Run bei Rollen-Korrektur
- [ ] Kosten < $15 pro Akt
- [ ] Gesamt-Dauer < 30 Minuten
- [ ] Gold-Standard-Vergleich: ≥80% Übereinstimmung
