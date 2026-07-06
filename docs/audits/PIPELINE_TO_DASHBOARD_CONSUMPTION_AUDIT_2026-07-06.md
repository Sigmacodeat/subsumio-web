# Backend-Pipeline → Dashboard-Nutzbarkeit — Audit

> **Datum:** 2026-07-06
> **Frage:** Nachdem die Upload-Engine gehärtet ist — läuft die Verarbeitung durch die Agenten
> danach richtig? Werden Daten korrekt klassifiziert und für den Anwalt nutzbar gemacht? Welche
> Daten haben eigene Dashboard-Links (Fristen, Widersprüche, erkannte Fehler)? Wird alles im
> Frontend angezeigt?
> **Methodik:** Zeilengenauer Code-Trace von `legal-pipeline.ts` (9.440 Zeilen, 20+ Analyse-Layer)
> bis zu den konkreten Dashboard-Komponenten, die die Ergebnisse lesen (oder eben nicht lesen).

---

## 1. Executive Summary

**Gemischtes Bild, mit einem zentralen strukturellen Befund:** Die Kernwertschöpfung — Fristen und
Widersprüche, genau die zwei Use-Cases, die du explizit genannt hast — ist **sauber und vollständig
verdrahtet**, inklusive Vier-Augen-Review, eigener Dashboard-Seiten und automatischer Sync-Ketten.
Auch die Klassifizierung (Dokumenttyp/Jurisdiktion) ist persistent sichtbar mit Confidence-Werten.

**Aber:** Die Pipeline ist im Backend von ursprünglich 6 auf **20+ spezialisierte Analyse-Layer**
gewachsen (Beweislast, Zulässigkeit, Beweiskraft, Vergleichsanalyse, Vollstreckung, Berufungsrisiko,
Verjährungsscan, Kostenprognose, Gegenargumente u.v.m.) — teure Sonnet-Calls, die bei **jedem
Upload automatisch laufen**. Die Anzeige-Komponente (`PipelinePanel`) kennt aber nur noch die
**ursprünglichen 6 Layer** und wurde beim Ausbau nie nachgezogen. Die neuen Analysen werden zwar
technisch generisch mitgerendert (weil sie in denselben Backend-„Buckets" landen), aber unter
**falsch beschrifteten Karten** — der Anwalt sieht „Layer 4: Damage+Deadline", wenn dort tatsächlich
Beweislast-, Zulässigkeits- und Beweiskraft-Analysen liegen.

| Bereich                            | Zustand            | Kernbefund                                                                                  |
| ---------------------------------- | ------------------ | ------------------------------------------------------------------------------------------- |
| Fristen (Deadlines)                | ✅ Vollständig     | Auto-Sync, eigene Seite, Review-Status-Workflow, Case-Tab-Integration                       |
| Widersprüche (Contradictions)      | ✅ Vollständig     | Nightly-Probe + On-Demand-Check, im Case-Tab UND Overview-Tab sichtbar                      |
| Klassifizierung (Typ/Jurisdiktion) | ✅ Gut             | Im Vault mit Confidence-Badge; im Case-Doc-Tab nur Typ, keine Jurisdiktion                  |
| Ensemble-Critic-Verdict            | ✅ Gut             | Kohärenz-Score + zentrale These im PipelinePanel sichtbar                                   |
| 19 Deep-Analysis-Layer             | 🔴 Fehletikettiert | Inhalte erscheinen, aber unter falschen/veralteten Layer-Labels                             |
| Insights-Widget „Widerspruch"      | 🟠 Irreführend     | Zeigt Extraktionsfehler, nicht echte inhaltliche Widersprüche                               |
| Separate Dashboard-Tools           | 🟡 Duplikation     | `precedent-search`/`litigation` rufen eigene On-Demand-APIs statt Pipeline-Output zu nutzen |

---

## 2. Was hervorragend funktioniert (verifiziert, nicht nur behauptet)

### 2.1 Fristen-Kette — vorbildlich

- Layer 5 (Sonnet) extrahiert Fristen + validiert sie gegen Paragraphen (Layer 5b) →
  `deadline_calendar`-Seiten.
- [pipeline-sync.ts](../../src/lib/legal/pipeline-sync.ts) materialisiert diese automatisch (täglicher
  Cron, [cron/deadlines/route.ts:182](../../src/app/api/cron/deadlines/route.ts)) in `legal_deadline`-Seiten
  mit `review_status: "unreviewed"` — genau die Seiten, die Digest-Mail, Topbar-Benachrichtigungen,
  Kalender-Export UND die `/dashboard/deadlines`-Seite lesen.
- Im Case-Detail-Tab ([deadlines-tasks-tab.tsx](../../src/components/legal/matter-tabs/deadlines-tasks-tab.tsx))
  erscheinen Pipeline-Vorschläge separat als `suggestedDeadlines` mit klarem
  Review-Status-Badge (unreviewed/reviewed/approved/rejected) — der Anwalt sieht explizit, was die
  KI vorschlägt vs. was er bestätigt hat. Eigene Seiten: `/dashboard/deadlines` (global) und
  `/dashboard/fristenbuch` (Fristenbuch-Ansicht).

### 2.2 Widersprüche — vorbildlich

- Zwei Erkennungswege: (a) nächtlicher `contradiction-probe`-Cron (semantische Kontradiktionen,
  Haiku-Judge) und (b) On-Demand-Check über `/api/legal/contradictions` (strukturierter Cross-Check:
  Parteien-Namen, Datums-Widersprüche, negations-basierte Fakten-Konflikte via Levenshtein-Heuristik).
- Beide schreiben in `case.frontmatter.contradictions[]` mit `doc_a_slug`, `doc_b_slug`, `field`,
  `value_a`/`value_b`, `severity`, `description`.
- **Wird angezeigt** in [strategy-tab.tsx:389](../../src/components/legal/matter-tabs/strategy-tab.tsx)
  UND [overview-tab.tsx:909](../../src/components/legal/matter-tabs/overview-tab.tsx) — mit
  „Widersprüche erkannt (N)"-Badge, Manuell-Neu-Check-Button, semantischem Probe-Status
  („No contradiction probe has run yet" etc.).

### 2.3 Klassifizierung

- Layer 0 (Doc-Classifier) + `detectJurisdiction()` stempeln `doc_type`, `jurisdiction`,
  `jurisdiction_confidence`, `jurisdiction_unverified` auf jede Seite.
- Im **Vault** ([vault/page.tsx:1035](../../src/app/dashboard/vault/page.tsx)) vollständig sichtbar
  mit Confidence-/Unverified-Badge und filterbar.
- Im **Case-Documents-Tab** nur `doc_type_label` als Badge + Filter — **Jurisdiktion fehlt dort**
  (kleine Lücke, siehe TODO unten).

### 2.4 Ensemble-Critic (Layer 7)

- 3-Modell-Konsens (Opus + DeepSeek + Grok) schreibt `ensemble_verdict` direkt in den Pipeline-Job-State
  (nicht als separate Seite) — im PipelinePanel korrekt mit Kohärenz-Score und zentraler These
  gerendert, unabhängig vom Label-Problem der Layer-Karten.

---

## 3. Der zentrale Befund: 19 Analyse-Layer sind fehletikettiert, nicht unsichtbar

### Wie es technisch funktioniert (und warum es trotzdem ein Problem ist)

Das Backend bündelt alle Sub-Analysen eines Bereichs in denselben nummerischen State-Bucket:

```
state.layers[4]  ← legal_grounding_map, precedent_match, burden_of_proof,
                     admissibility_check, evidence_quality, witness_expert  (6 Analysen!)
state.layers[5]  ← damage_table, deadline_calendar, cost_benefit, settlement_analysis,
                     enforcement_analysis, appeal_risk, procedural_strategy,
                     insurance_coverage, tax_impact, counterclaim_risk,
                     mediation_adr, limitation_scan, cost_award           (13 Analysen!)
state.layers[6]  ← legal_draft, counter-arguments                         (2 Analysen)
```

[PipelinePanel.tsx:88-100](../../src/components/legal/PipelinePanel.tsx) kennt aber nur:

```
{ num: 4, name: "Damage + Deadline", type: "damage_table" }   // ← das ist eigentlich Layer 5!
{ num: 5, name: "Legal Drafter",     type: "legal_draft"   }   // ← das ist eigentlich Layer 6!
{ num: 6, name: "Legal Critic",      type: "quality_audit" }   // ← das ist eigentlich Layer 7!
```

Die Nummerierung im Frontend ist **um mindestens eins verschoben** gegenüber dem, was der Backend-Code
in `legal-pipeline.ts` tatsächlich Layer 4/5/6/7 nennt (siehe Datei-Header-Kommentar, Zeilen 9-35).

**Die gute Nachricht:** Das Rendering selbst ist generisch — beim Aufklappen einer Layer-Karte werden
_alle_ Seiten aus `output_slugs` gerendert, unabhängig vom Seitentyp, mit ihrem eigenen Titel. Ein
Anwalt, der „Layer 4" aufklappt, sieht also tatsächlich die Beweislast- und Zulässigkeits-Analysen —
nur unter der irreführenden Überschrift „Damage + Deadline", was Verwirrung stiftet und die
eigentliche Tiefe der Analyse (13+ Spezialgutachten pro Layer-Bucket) komplett verschleiert. Ein
Anwalt, der nicht weiß, dass sich hinter „Layer 5: Legal Drafter" in Wahrheit die
Vergleichs-/Vollstreckungs-/Berufungsrisiko-/Verjährungs-/Kostenprognose-Analyse verbirgt, wird sie
nie bewusst aufsuchen — er sieht nur einen Zähler-Badge („13") ohne zu wissen, was die 13 Dokumente
sind, bis er jedes einzeln aufklappt.

### Betroffene Analysen ohne eigene Sichtbarkeit/Label (aber technisch im generischen Renderer erreichbar)

Fact-Gap-Detector, Law-Matcher (§-Retrieval), Precedent-Matcher (OGH/BGH/BVerfG), Burden-of-Proof,
Admissibility-Checker, Evidence-Quality-Assessor, Witness/Expert-Analyzer, Deadline-Validator,
Cost-Benefit-Analyzer (EV/Break-Even), Settlement-Analyzer (BATNA/ZOPA), Enforcement-Analyzer,
Appeal-Risk-Analyzer, Procedural-Strategist, Insurance-Coverage-Analyzer, Tax-Impact-Analyzer,
Counterclaim-Risk-Analyzer, Mediation/ADR-Analyzer, Limitation-Scanner (Verjährung!), Cost-Award-Predictor,
Counter-Argument-Layer.

**Besonders kritisch: der Limitation-Scanner (Verjährungsscan, URGENT/WARNUNG/OK pro Anspruch)** —
das ist funktional eine Art „erkannter Fehler/Risiko im Akt", explizit nach deiner Frage — läuft
automatisch, landet aber nur als unbeschriftetes Dokument im „Layer 5"-Sammelbecken. Ein Anwalt
bekommt keinen eigenen Alarm/Badge dafür, obwohl das Ergebnis (drohende Verjährung) potenziell das
wichtigste Einzelergebnis der gesamten Pipeline ist.

### Duplikation statt Wiederverwendung

`/dashboard/precedent-search` und `/dashboard/litigation` rufen **eigene, unabhängige On-Demand-APIs**
(`api.legal.precedentSearch`, `api.legal.litigation`) auf, die bei jedem Nutzer-Klick frisch rechnen —
sie lesen **nicht** die bereits automatisch berechneten `precedent_match`/`procedural_strategy`-Seiten
aus der Pipeline. Ergebnis: doppelte LLM-Kosten für dieselbe Art Analyse, und die automatische
Pipeline-Version verpufft ungenutzt.

---

## 4. TODO-Liste (priorisiert)

### 🔴 P0 — Größter Hebel, überschaubarer Aufwand

- [ ] **PipelinePanel `LAYER_INFO` korrigieren und erweitern.**
      [PipelinePanel.tsx:88-100](../../src/components/legal/PipelinePanel.tsx): Nummerierung an die
      tatsächlichen Backend-Layer-Nummern angleichen (aktuell off-by-one) und für jeden Bucket (4, 5, 6)
      eine Liste der enthaltenen Sub-Analysen mit eigenem Icon/Label rendern, statt eines einzigen
      generischen Namens. Da das Rendering der Inhalte selbst schon generisch funktioniert, ist der
      Umfang überschaubar: Datenstruktur von `LAYER_INFO` auf `Array<{ bucket: number; subTypes:
    {type: string; label: string; icon}[] }>` erweitern und beim Rendern nach `fm.type` gruppieren
      statt nach dem Bucket allein.
- [ ] **Verjährungsscan (`limitation_scan`) einen eigenen sichtbaren Alarm geben.**
      Analog zu Fristen/Widersprüchen: eigenes Badge/Insight mit Ampel-Status (URGENT/WARNUNG/OK) im
      Case-Overview-Tab, nicht nur als unbeschriftetes Dokument im Layer-5-Sammelbecken. Das ist
      Risiko-Klasse „erkannter Fehler im Akt" und verdient dieselbe Prominenz wie ein Fristen-Alarm.

### 🟠 P1 — Ehrlichkeit + Konsistenz

- [ ] **Insights-Widget „Widerspruch"-Typ umbenennen oder korrekt speisen.**
      [insights-engine.ts:222](../../src/lib/insights-engine.ts) `generateContradictions()` prüft nur
      `analysis_status === "failed"` / `extraction_unverified` — das sind Extraktionsprobleme, keine
      inhaltlichen Widersprüche. Entweder umbenennen (z. B. `extraction_issue`) oder zusätzlich echte
      `case.frontmatter.contradictions` als Insights einspeisen, damit „Widerspruch" im Insights-Feed
      dasselbe bedeutet wie im Case-Tab.
- [ ] **Jurisdiktions-Badge auch im Case-Documents-Tab.**
      [documents-tab.tsx](../../src/components/legal/matter-tabs/documents-tab.tsx) zeigt `doc_type_label`,
      aber keine Jurisdiktion — im Vault ist sie vorhanden (inkl. Unverified-Warnung). Für
      Multi-Jurisdiktions-Akten (z. B. AT-Kanzlei mit DE-Mandant) fehlt dem Anwalt direkt in der Akte
      die Information, in welchem Recht ein Dokument erkannt wurde.

### 🟡 P2 — Wertschöpfung statt Duplikation

- [ ] **`/dashboard/precedent-search` und `/dashboard/litigation` an die Pipeline-Outputs andocken.**
      Vor einem frischen On-Demand-Call erst prüfen, ob bereits ein `precedent_match`/
      `procedural_strategy`-Ergebnis aus der automatischen Pipeline für diese Akte vorliegt, und es
      als Ausgangspunkt/Vorschau anzeigen („Automatische Analyse vom {Datum} — neu berechnen?").
      Vermeidet doppelte LLM-Kosten und macht die automatische Tiefenanalyse tatsächlich nützlich.
- [ ] **Cost-Benefit/Settlement/Enforcement/Appeal-Risk-Analysen ins Strategy-Tab heben.**
      Diese passen inhaltlich exakt zum bestehenden [strategy-tab.tsx](../../src/components/legal/matter-tabs/strategy-tab.tsx)
      (das bereits Widersprüche + semantische Probe zeigt) — als weitere Sektionen mit eigenen
      Überschriften statt im generischen Layer-Bucket zu verschwinden.

---

## 5. Antwort auf die Kernfragen

**„Ist das richtig aufgebaut?"** — Architektonisch ja (Contract-first, jede Analyse als eigene
Brain-Page, generischer Renderer). Aber die Frontend-Layer-Beschriftung ist beim Pipeline-Ausbau von
6 auf 20+ Layer nicht mitgewachsen — ein reines Wartungs-/Nacharbeits-Problem, kein Architekturfehler.

**„Werden Daten richtig klassifiziert und nutzbar gemacht?"** — Ja, Klassifizierung (Typ/Jurisdiktion)
ist solide, mit einer kleinen Lücke (keine Jurisdiktion im Case-Doc-Tab).

**„Welche Daten haben eigene Dashboard-Links — Fristen, Widersprüche, erkannte Fehler?"** — Fristen:
ja, zwei eigene Seiten + Case-Tab-Integration. Widersprüche: ja, im Strategy- und Overview-Tab.
**Erkannte Fehler/Risiken aus den 19 Deep-Analysis-Layern (insb. Verjährung): nein, keine eigenen
Links/Badges** — nur generisch im fehletikettierten PipelinePanel erreichbar.

**„Haben wir an diese Use-Cases gedacht?"** — Teilweise. Die zwei explizit genannten (Fristen,
Widersprüche) — ja, sehr gut. Die stillschweigend mitgemeinte dritte Kategorie („erkannte Fehler aus
dem Akt", die von 19 weiteren Spezial-Layern stammen) — die Pipeline denkt daran und rechnet es,
das Frontend zeigt es aber nur unter falschem Namen an.
