# Stresstest: Komplexe Mehrgleisige Amtshaftungsfälle — Pipeline vs. Praxisfall

> **Datum:** 2026-07-04
> **Auslöser:** Ein real bearbeiteter, sehr komplexer Amtshaftungsfall (mehrere parallele Verfahrensschienen: Zivilklage AHG, DSGVO-Klagen/-Beschwerden gegen mehrere Verantwortliche, Disziplinaranträge, Strafanzeige, Befangenheitsanträge, Verfahrenshilfe, dazu aggregierende Strategiedokumente wie eine Haftungs-Matrix und eine Schadenstabelle) wurde außerhalb von Subsumio mit Ad-hoc-Skripten (Python/HTML/CSS → PDF) und iterativer KI-Recherche aufgebaut. Frage: **Kann die Subsumio-7-Layer-Pipeline einen Fall dieser Tiefe heute selbständig bearbeiten?**
> **Methodik:** Abgleich der im Praxisfall tatsächlich erstellten Analyse-Artefakte und Schriftsatz-Typen gegen die Pipeline-Layer und das Draft-Package-System, Code-verifiziert. Keine echten Namen/Aktenzeichen in diesem Dokument (Privacy-Regel).

---

## 1. Executive Summary

**Kurzantwort: Die einzelnen Fähigkeiten sind fast alle da — aber das Datenmodell ist auf „ein Akt = ein Gegner = ein Anspruch" gebaut. Ein Fall dieser Komplexität sprengt das heutige Modell strukturell, nicht nur inhaltlich.**

Das ist die gute UND die schlechte Nachricht zugleich: Jedes einzelne analytische Manöver, das im Praxisfall von Hand (mit KI-Unterstützung) gemacht wurde, hat eine fast 1:1 passende Pipeline-Layer-Entsprechung — teils frappierend genau (die handgebaute Verjährungs-Matrix mit Hemmung/Unterbrechung pro Anspruch ist praktisch die Spezifikation von Layer 5l). Was fehlt, ist nicht Analysetiefe, sondern die **Klammer darüber**: Der Praxisfall ist kein einzelner Akt, sondern ein Mandat mit **drei separaten Gerichtsakten plus mehreren behördlichen Nebenschienen**, vereint nur auf der Ebene des Mandanten. Genau diese Klammer — „ein Mandant, mehrere Verfahren, ein gemeinsames Lagebild" — gibt es im Datenmodell nicht.

| Fähigkeit                                       | Praxisfall (händisch)                                       | Pipeline-Entsprechung                                              | Deckung                                                 |
| ----------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------- |
| ON-Zuordnung im Gesamtakt                       | manuelle ON-Tabelle                                         | Layer 1 ON-Scanner                                                 | ✅ direkt                                               |
| Entitäten/Adressen-Konsistenz                   | manuelle Konsistenzprüfung                                  | Layer 2 Entity-Extractor                                           | ✅ direkt                                               |
| Fehler-/Lückenliste im Akt                      | manuelle Fehlerliste                                        | Layer 3 Forensic + 3c Fact-Gap                                     | ✅ direkt                                               |
| Rechtliche Prüfung (§§, Rsp.)                   | manuelle Rechtsprüfung + Online-Recherche                   | Layer 4 Law-Matcher + 4b Precedent-Matcher                         | ✅ direkt                                               |
| Schadenstabelle                                 | manuelle Tabelle                                            | Layer 5 Damage-Table                                               | ✅ direkt                                               |
| Fristen-/Verfahrensdauer-Check                  | manuelle Fristenanalyse                                     | Layer 5b Deadline-Validator                                        | ✅ direkt                                               |
| **Verjährungs-Matrix pro Anspruch**             | manuelle Matrix mit Hemmung/Unterbrechung, pro Gegner       | **Layer 5l Limitation-Scanner**                                    | ⚠️ Struktur passt, **Gegner-Dimension fehlt im Schema** |
| Prozessstrategie / Gegner-Zugzwang              | manuelles Strategiepapier                                   | Layer 5g Procedural-Strategist                                     | ✅ direkt                                               |
| Gegenargumente vorwegnehmen                     | manueller zweiter Durchgang                                 | Layer 6.5 Counter-Argument                                         | ✅ direkt                                               |
| Schriftsatz-Entwürfe                            | ~25 verschiedene Dokumenttypen, 4 Adressatengruppen         | **Layer 6 + `draft-packages.ts`: 6 Dokumenttypen, 1 Gegner-Rolle** | ❌ **größte Lücke**                                     |
| „Wer muss noch angeschrieben werden?"           | eigene Vollständigkeits-/Institutionen-Checkliste           | **kein Pipeline-Äquivalent**                                       | ❌ fehlt komplett                                       |
| „Ein Mandant, drei Gerichtsakten, ein Lagebild" | Haftungsmatrix + Master-Schadenstabelle über alle Verfahren | **kein Fall-übergreifendes Datenmodell**                           | ❌ fehlt komplett                                       |

---

## 2. Die drei strukturellen Lücken (was den Fall wirklich schwer macht)

### Lücke 1 — Datenmodell kennt nur „ein Akt = ein Gegner"

`CaseFrontmatter` ([legal-types.ts](src/lib/legal-types.ts)) hat genau ein `opponent_name`/`opponent_slugs`-Feld; die Cases-Anlage ([cases/new/page.tsx](src/app/dashboard/cases/new/page.tsx)) modelliert einen Gegner pro Akte. Ein Amtshaftungsfall dieser Größenordnung hat aber strukturell **mehrere gleichzeitige Gegner mit unterschiedlicher Rolle** (der Rechtsträger/Bund für die AHG-Klage, zwei verschiedene Datenverantwortliche für zwei getrennte DSGVO-Verfahren, handelnde Beamte für die Disziplinaranträge, eine Privatperson für die Strafanzeige) — nicht als Nebensache, sondern als Kern des Falls. Heute bräuchte man dafür mehrere separate Akten ohne jede Verknüpfung.

### Lücke 2 — Keine Mehr-Akten-Klammer auf Mandantenebene

Grep über den gesamten Code nach `related_cases`, `parent_matter`, `linked_case` u. ä.: **keine Treffer**, die auf ein Konzept „mehrere Gerichtsakten/Verfahren gehören zusammen" hindeuten. Der Praxisfall hatte **drei separate Gerichtsakten** (unterschiedliche Geschäftszahlen, teils sogar mit Verfahrensübertragung zwischen Aktenzeichen) plus Korrespondenz mit zwei weiteren Behörden — vereint nur durch die Person des Mandanten und durch die beiden aggregierenden Strategiedokumente (Haftungsmatrix, Master-Schadenstabelle), die im Praxisfall **von Hand** über alle Akten hinweg gebaut wurden. Die Pipeline kennt pro Lauf genau einen `case_slug`; es gibt keinen Layer, der über mehrere Case-Slugs hinweg eine gemeinsame Haftungsmatrix oder Master-Schadenstabelle zusammenführt.

### Lücke 3 — Verjährungs-Scanner ohne Gegner-Dimension

Das ist der konkreteste, im Code verifizierte Befund: Der Prompt von Layer 5l ([legal-pipeline.ts:5274](server/src/core/minions/handlers/legal-pipeline.ts)) verlangt pro Anspruch: Verjährungsfrist, Beginn, Fristende, verjährt?, Hemmung/Unterbrechung, Handlungsbedarf — **aber kein Feld für „gegen wen"**. Im Praxisfall hatte **derselbe Anspruchstyp** (z. B. DSGVO-Schadenersatz) gegen zwei verschiedene Datenverantwortliche **unterschiedliche Kenntnis-Anker und damit unterschiedliche Fristenden**. Ohne Gegner-Dimension im Schema würde der Scanner das entweder vermischen oder nur den erstbesten Gegner erfassen — genau der Fehler, der in einem echten Amtshaftungsfall am teuersten ist.

---

## 3. Die Draft-Package-Lücke (die praktischste)

`LEGACY_AT_PACKAGE` ([draft-packages.ts:50](server/src/core/legal/draft-packages.ts)) — das Kommentar im Code nennt es selbst „die flagship Amtshaftungs-/Strafakte", also exakt dieser Falltyp — deckt heute:

> AHG-Antrag · Strafantrag · Einspruch (§ 106 StPO) · DSGVO-Beschwerde (eine) · Klageentwurf AHG · Versand-Checkliste

Das sind **6 Dokumenttypen**. Ein Fall der beobachteten Komplexität brauchte real rund **25 unterschiedliche Schreiben** über vier Adressatengruppen hinweg:

| Adressatengruppe                       | Im Praxisfall benötigt                                                                                         | Im Draft-Package-System                                                                                          |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Zivilgericht                           | Klageentwurf (AHG)                                                                                             | ✅ vorhanden                                                                                                     |
| DSGVO-Datenverantwortliche             | **Klagen gegen mehrere verschiedene Verantwortliche**                                                          | ⚠️ nur 1 generischer Typ, nicht pro Verantwortlichem                                                             |
| Datenschutzbehörde                     | Aufsichtsbeschwerden (Art. 77 DSGVO)                                                                           | ❌ fehlt (nur „dsgvo_beschwerde" allgemein, nicht DSB-spezifisch)                                                |
| Staatsanwaltschaft                     | Strafantrag/-anzeige, Haftantrag, Befangenheitsantrag (§ 47 StPO), Einspruch wegen Säumnis, Fortführungsantrag | ⚠️ nur Strafantrag + Einspruch vorhanden                                                                         |
| Finanzstrafbehörde                     | Finanzstrafanzeige                                                                                             | ❌ fehlt                                                                                                         |
| Disziplinarbehörden (mehrere Ressorts) | Disziplinaranträge/Dienstaufsichtsbeschwerden                                                                  | ❌ fehlt komplett                                                                                                |
| Gericht (Verfahrensrecht)              | Verfahrenshilfeantrag, Befangenheitsantrag gg. Richter                                                         | ❌ fehlt komplett                                                                                                |
| Strategie (intern)                     | Haftungsmatrix, Master-Schadenstabelle                                                                         | ❌ fehlt komplett (Schadenstabelle je Akt existiert als Layer-5-Output, aber nicht fall-übergreifend aggregiert) |

**Das bedeutet konkret:** Für einen Fall dieser Art würde die Pipeline heute ca. 6 von 25 nötigen Schreiben liefern — die richtigen sechs (AHG-Kern), aber ohne die Behörden-Nebenschienen, ohne Verfahrensanträge, ohne die strategische Klammer.

---

## 4. Was die Pipeline schon heute besser kann als der Praxisfall

Nicht alles ist Lücke — an mehreren Stellen ist die Pipeline dem händischen Vorgehen bereits überlegen:

- **Determinismus statt Handarbeit:** Kostenverzeichnis (RATG), ON-Validierung, Fristenberechnung laufen deterministisch (Layer nutzt `kosten-at.ts`/`gz-validate.ts`/`frist-engine.ts`), während der Praxisfall diese Prüfungen über Ad-hoc-Python-Regex-Skripte nachgebaut hat (`legal_audit.py`) — fehleranfälliger und pro Fall neu zu schreiben.
- **Retry-mit-Feedback:** Layer 1 (ON-Scanner) validiert gegen den Originaltext und wiederholt bei Fehlern automatisch — der Praxisfall hatte dafür ein eigenes, manuell gepflegtes Audit-Skript.
- **Cross-Layer-Validierung:** Layer 5b prüft Fristen gegen die tatsächlich gefundenen §§ — im Praxisfall eine rein manuelle Analysestufe.
- **Ensemble-Critic (Layer 7):** 3-Modell-Konsens für die finale Qualitätsprüfung — im Praxisfall gab es nur ein einzelnes Konsistenz-Skript.

Die Pipeline ist also für den **Kernfall (ein Mandant, ein Gegner, eine Anspruchsgruppe)** bereits mindestens so gründlich wie das händische Vorgehen — oft gründlicher, weil deterministisch statt Regex-geraten. Das Problem ist ausschließlich die **Reichweite** bei mehrgleisigen Fällen.

---

## 5. Härtungs-Blueprint

### Phase A — Mehr-Gegner-Fähigkeit im Kernmodell (P0, ~2–3 Tage)

- [ ] **A1** `CaseFrontmatter` um `additional_opponents: Array<{ name, slug, rolle: "hauptbeklagter"|"nebenbeklagter"|"drittbeteiligter" }>` erweitern; Cases-Anlage + Akten-Kontakte-Tab entsprechend
- [ ] **A2** Layer 5l Limitation-Scanner-Schema um Pflichtfeld `gegner` pro Anspruch erweitern (Prompt + Page-Schema); ohne Gegner-Zuordnung kein „verjährt/nicht verjährt"-Urteil ausgeben
- [ ] **A3** Draft-Resolver: pro zusätzlichem Gegner die passenden Pakete separat auflösen (z. B. zwei DSGVO-Beschwerden statt einer, wenn zwei Verantwortliche vorliegen)

### Phase B — Mehr-Akten-Klammer auf Mandantenebene (P0, ~3–4 Tage)

- [ ] **B1** Neues Konzept „Mandat" (oder `related_case_slugs` direkt auf `CaseFrontmatter`) — mehrere Gerichtsakten/Verfahren derselben Person gruppieren, unabhängig von Gerichtsbarkeit/Gegner
- [ ] **B2** Fall-übergreifender Layer (neu oder Erweiterung von Layer 5g): baut die **Haftungsmatrix** (Anspruch × Gegner × Rechtsgrundlage × Status) und die **Master-Schadenstabelle** über alle verknüpften Akten hinweg — genau die zwei Dokumente, die im Praxisfall den größten manuellen Aufwand verursacht haben
- [ ] **B3** Dashboard: Mandats-Ansicht, die alle verknüpften Akten + deren Status auf einen Blick zeigt (Vorstufe zu „Portfolio-Insights" auf Mandantenebene statt nur Kanzleiebene)

### Phase C — Draft-Package-Erweiterung für Behörden-Nebenschienen (P1, ~3–4 Tage)

- [ ] **C1** Neue AT-Pakete: `disziplinarantrag` (parametrisiert nach Ressort/Behörde), `dienstaufsichtsbeschwerde`, `befangenheitsantrag` (§ 47 StPO — Richter/Organe), `verfahrenshilfe_antrag`, `haftantrag`/`fortfuehrungsantrag` (§ 195 StPO), `dsb_beschwerde` (Art. 77 DSGVO, getrennt von der zivilrechtlichen DSGVO-Klage), `finanzstrafanzeige`
- [ ] **C2** `resolveDraftPackages` um eine Dimension „Nebenverfahren" erweitern (checkbox-artig: welche Zusatzschienen sind für diesen Fall relevant), gespeist aus der Forensik-/Fact-Gap-Analyse (Layer 3/3c erkennt oft schon, ob z. B. eine Befangenheit oder Disziplinarrelevanz im Raum steht)
- [ ] **C3** `kosten-at.ts` um Verfahrenshilfe-Bedürftigkeitsprüfung (§ 63 ff. ZPO) ergänzen — heute nur RATG-Kostenverzeichnis für Zivilverfahren

### Phase D — „Institutionen-Checkliste" als eigenständiges Feature (P1, ~2 Tage)

- [ ] **D1** Neuer Layer/Post-Layer-5-Schritt: „Wer muss noch informiert/angeschrieben werden?" — leitet aus den erkannten Ansprüchen + Gegnern + Fristen eine Vollständigkeitsliste ab (exakt das Artefakt, das im Praxisfall den größten strategischen Wert hatte)
- [ ] **D2** Dashboard-Darstellung als Checkliste im Akten-/Mandats-Kontext, mit Status „geschrieben/offen/Frist X"
- **Akzeptanz Phase D:** Für einen Testfall mit 3 Gegnern + 2 Fristenschienen identifiziert das System selbständig alle 5 Adressaten und die jeweilige Dringlichkeit.

### Phase E — Meta-Check: Verfahrensverstöße der Gegenseite (P2, ~2 Tage)

- [ ] **E1** Neuer Prüfpunkt in Layer 3/3c: Hat die Behörde/Gegenseite ihre EIGENEN verfahrensrechtlichen Fristen eingehalten (z. B. Zwischenbericht-Intervalle bei Ermittlungsverfahren)? Das ist bei Amtshaftung oft der eigentliche Haftungsgrund und wurde im Praxisfall als eigene manuelle Analyse durchgeführt
- **Akzeptanz:** Die forensische Analyse liefert nicht nur „was fehlt in unserer Beweisführung", sondern auch „wo hat die Behörde selbst ihre Pflichten verletzt".

**Aufwand gesamt: ~12–15 Personentage.** Phase A+B sind die Voraussetzung für alles andere (ohne Mehr-Gegner/Mehr-Akten-Modell bleibt Phase C nur eine längere Einzelfall-Liste). Phase C+D liefern den größten sichtbaren Sprung Richtung „für Amtshaftung wirklich perfekt".

---

## 6. Ehrliches Fazit

Die Pipeline ist **für den klassischen Amtshaftungsfall (ein Mandant, ein Rechtsträger, eine Anspruchsgruppe) bereits stark** — die Layer-Architektur trifft die reale anwaltliche Arbeitsweise erstaunlich genau, teils layer-für-layer deckungsgleich mit dem, was im Praxisfall von Hand gemacht wurde. Für **mehrgleisige Großfälle** mit mehreren Gegnern, mehreren Gerichtsakten und behördlichen Nebenschienen fehlt heute die strukturelle Klammer — nicht die Intelligenz der einzelnen Layer, sondern das Datenmodell, das sie zusammenhält. Das ist gute Nachricht für die Priorisierung: Es ist kein Rebuild der Pipeline nötig, sondern eine gezielte Erweiterung des Fall-/Gegner-Datenmodells (Phase A+B) plus einer breiteren Dokumenttyp-Bibliothek (Phase C) — beides klar umrissene, additive Arbeit ohne Risiko für das, was heute schon funktioniert.
