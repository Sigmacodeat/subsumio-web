# Blueprint: Das lernende Subsumio-Gehirn

Stand: 19.09.2026 · Grundlage: Code-Bestandsaufnahme (am Code nachgeprüft) und Recherche zu Wettbewerb und Rechtslage mit Quellen.

## 1. Frage und Antwort in einem Satz

**Frage:** Kann Subsumio ein zentrales Gehirn bauen, das aus allen Kanzleien, Fällen und Urteilen anonym lernt und dadurch immer klüger wird, und kann man damit werben?

**Antwort:** Das Ziel ist richtig, der Weg „aus den Akten aller Kanzleien lernen“ aber nicht. In Österreich scheitert er am Berufsrecht. Er widerspricht dem, was wir auf unserer Website versprechen, und er würde das stärkste Verkaufsargument im Markt zerstören. Dasselbe Ziel erreichen wir mit einem Gehirn aus drei Schichten:

1. Öffentliches Recht, das jeden Tag wächst.
2. Ein privates Gehirn je Kanzlei, das dort lernt.
3. Eine kollektive Schicht, die nur anonyme Qualitätssignale über öffentliche Quellen sammelt, nie Akteninhalte.

Damit kann man werben, und so hat es niemand.

## 2. Ist-Stand: was heute gebaut ist

### Trennung der Kanzleien

- Eine Engine, eine Datenbank, **eine `source_id` (brainId) je Kanzlei**. Der Server setzt sie in `src/lib/engine.ts`, die Engine liest sie in `server/src/commands/web-api.ts` `requestSourceId()`.
- Alle Lesezugriffe laufen über `sourceScopeOpts()` (`server/src/core/operations.ts:567`).
- Auf Aktenebene gelten Sichtbarkeit, Freigaben und Chinese Walls (`server/src/core/matter-access.ts`, `docs/architecture/MATTER_ACCESS.md`).
- Kanzleiübergreifend gibt es nur Datenräume je Akte. Die Dokumente bleiben dabei im Gehirn der eigenen Kanzlei.

### Das einzige gemeinsame Gehirn heute: das öffentliche Recht

- `SUBSUMIO_SHARED_READ_SOURCES=law-at,law-de,law-ch,law-eu` (`server/deploy/hetzner/.env.example:127`). Jede Kanzlei liest es mit, schreiben darf keine.
- Für AT gehören dazu die Gesetze, 14 Judikatur-Quellen (`law-at-judikatur-*`) und EU-Recht (`server/src/core/legal/jurisdiction.ts:45-67`).
- Der RIS-Delta-Watcher holt täglich neue Entscheidungen.
- **Doppelung:** Der Cron `judgements-sync` kopiert Urteile zusätzlich in jedes einzelne Kanzlei-Gehirn.

### Was heute schon lernt (alles je Kanzlei, nichts kanzleiübergreifend)

| Lernschleife                                         | Zustand                                                                                                                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Daumen hoch/runter im Assistenten                    | Wird gespeichert (`subsumio_answer_feedback`), aber nur als Zusammenfassung gelesen. **Fließt nirgends zurück.**                                                       |
| Feedback zu Suchtreffern (relevant/veraltet/falsch)  | Liegt nur im Arbeitsspeicher (`src/lib/retrieval-feedback.ts:136`, `new Map`). **Geht bei jedem Neustart verloren. Die Boosts werden nie auf das Ranking angewendet.** |
| Feedback-Triage, Regression-Mining                   | Gebaut, aber von keiner Route aufgerufen                                                                                                                               |
| Auto-Playbook, Klauselbibliothek, Copilot-Gedächtnis | Funktionieren je Kanzlei. Das ist echtes Lernen: „so arbeitet diese Kanzlei“.                                                                                          |
| Fakten, Takes, Salience, Dream Cycle                 | Pflegen die Daten je Quelle, bündeln aber kein Wissen                                                                                                                  |
| Fine-Tuning                                          | Nicht vorhanden. `src/lib/fine-tuning-gate.ts` definiert nur Kriterien und ist nirgends verdrahtet. Alles läuft über Retrieval und Prompting.                          |
| Peer-Benchmark                                       | Archiviert. Der zentrale Aggregator hat nie existiert: Der Export landete im eigenen Gehirn.                                                                           |

### Anonymisierung

- `server/src/core/legal/anonymizer.ts` sagt im Kopf selbst, dass es **Pseudonymisierung** nach Art. 4 Nr. 5 DSGVO ist und keine Anonymisierung.
- `server/src/core/anonymize.ts` arbeitet mit Regex und optional LLM. Das reicht für eine Arbeitskopie, nicht für eine rechtssichere Anonymisierung von Akten.

### Was wir öffentlich versprechen

- `src/content/site.ts:549`: „Training auf Ihren Mandantendaten — vertraglich ausgeschlossen“.
- `src/content/site.ts:414` und `src/content/blog.ts:51`: „kein Training mit Ihren Daten“.
- `src/content/blog.ts:208` rät Kanzleien selbst, auch **anonymisiertes oder aggregiertes** Training im AVV auszuschließen, solange die Anonymisierung nicht nachweisbar ist.

## 3. Wettbewerb: wer lernt über Kunden hinweg?

| Anbieter                      | Lernt über Kunden hinweg?                                                                                                                     | Was beworben wird                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Harvey                        | Nein, Modelle sind je Kanzlei getrennt („firewall it based on the firm“)                                                                      | „Kundendaten gehören nur dem Kunden“              |
| Thomson Reuters CoCounsel     | Nein                                                                                                                                          | Kein Training, keine Speicherung                  |
| Legora (ehem. Leya)           | Nein                                                                                                                                          | Kein Training, kein Fine-Tuning                   |
| MANZ/Beck Noxtua              | Nein, trainiert auf **Verlagsinhalten**                                                                                                       | Kein Training mit Eingaben                        |
| BEAMON (ÖRAK-Kooperation)     | Nein                                                                                                                                          | Wirbt mit erfüllter ÖRAK-Checkliste               |
| LexisNexis Protégé            | „Kein Training mit Kundendaten“, aber **pseudonymisierte Interaktionen** verbessern das Produkt                                               | Datenschutz                                       |
| Luminance                     | **Ja, vertraglich:** pseudonymisierte „Learnings“ aus Nutzung und Tagging dürfen dauerhaft zur Produktverbesserung genutzt werden (Trial-AGB) | „150 Mio.+ Dokumente“, Herkunft nicht offengelegt |
| EvenUp (USA, Personenschaden) | Wirbt mit Hunderttausenden Fällen als Datenvorteil. Ob mit Einwilligung, ist öffentlich nicht belegt.                                         | Datenvorteil                                      |
| Clio                          | Aggregierte, anonymisierte Nutzungsdaten für den Legal Trends Report, **kein Modelltraining**                                                 | Branchen-Benchmark                                |
| AI:ssociate, Donna            | Keine öffentliche Aussage zum Training gefunden                                                                                               | EU-Hosting, Pseudonymisierung                     |

**Befund:** Kein Anbieter im DACH-Raum wirbt mit einem kanzleiübergreifend lernenden Gehirn. Der Markt verkauft das Gegenteil. Wer über Kunden hinweg lernt (Luminance, LexisNexis), tut es leise im Vertrag und bewirbt es nicht.

## 4. Rechtlicher Rahmen

- **ÖRAK-Leitfaden KI (23.09.2025), am Original geprüft:**
  - Der Anbieter muss sich schriftlich verpflichten, dass eingegebene Daten „nicht zum Training des KI-Modells verwendet werden dürfen“.
  - Die Anbieter-Checkliste verlangt, dass eingegebene Daten „unter keinen Umständen für das Training von KI-Modellen verwendet werden“.
  - Eine mildere Stelle im Fließtext verbietet das Training nur, wenn Rückschlüsse auf Mandanten möglich sind. Die Checkliste ist aber das, was Kanzleien abhaken.
  - **Folge:** Mit Akten-Training kann Subsumio die ÖRAK-Checkliste nicht wahrheitsgemäß bestätigen, BEAMON schon.
- **§ 9 RAO (AT), § 43a, § 43e BRAO und § 203 StGB (DE):**
  - Die Verschwiegenheit umfasst schon die Tatsache, dass es ein Mandat gibt.
  - Die BRAK sagt, es reiche regelmäßig nicht, Namen zu entfernen, wenn sich die Mandatsinformationen aus dem Kontext ergeben.
  - Ein Schriftsatz zu einem Wiener Bauprojekt bleibt auch ohne Namen identifizierbar.
- **DSGVO:**
  - Maßstab ist ErwG 26.
  - Nach dem EuGH-Urteil C-413/23 P (04.09.2025) bleiben pseudonymisierte Daten bei demjenigen personenbezogen, der den Schlüssel hat, also bei uns.
  - Nach der EDPB-Stellungnahme 28/2024 ist ein Modell nur anonym, wenn sich Trainingsdaten praktisch nicht extrahieren lassen. Für Sprachmodelle, die sich Texte merken, ist das kaum nachweisbar.
- **Urteile:** RIS-OGD-Daten stehen unter CC BY 4.0. Kommerzielle Nutzung ist mit Quellenangabe erlaubt, die Entscheidungen sind bereits anonymisiert veröffentlicht. **Das ist der rechtlich saubere Rohstoff.**
- **AI Act:** Kanzlei-Werkzeuge fallen regelmäßig nicht unter Anhang III Nr. 8(a), weil der nur Justizbehörden erfasst. Ein eigenes Fine-Tuning macht uns erst ab etwa einem Drittel der ursprünglichen Rechenleistung zum GPAI-Anbieter.

Offen und nur mit Anwalts- bzw. ÖRAK-Gutachten zu klären: ob die Qualitätssignale der kollektiven Schicht (Abschnitt 5) schon „eingegebene Daten“ im Sinn der Checkliste sind.

## 5. Zielbild: drei Schichten

```
┌───────────────────────────────────────────────────────────────┐
│ SCHICHT 1 · Öffentliches Rechtsgehirn (für alle, wächst täglich)│
│  Gesetze + Fassungen · OGH/VwGH/VfGH/OLG · EU · Literatur (frei)│
│  + Zitiernetz, Leitsätze, „wie entscheidet der OGH zu X“       │
└──────────────▲───────────────────────────────▲────────────────┘
               │ liest                         │ nur anonyme Signale
┌──────────────┴──────────┐        ┌──────────┴─────────────────┐
│ SCHICHT 2 · Kanzlei-    │  ───►  │ SCHICHT 3 · Kollektive      │
│ Gehirn (privat)         │ opt-in │ Erfahrung (k-anonym,        │
│ Akten, Muster, Stil,    │        │ nur über öffentliche Objekte)│
│ Playbooks, Feedback     │        │ „dieser § / dieses Urteil   │
│ — verlässt nie die      │        │  half bei Frage-Typ Y“      │
│   Kanzlei               │        │ Korpus-Fehlermeldungen      │
└─────────────────────────┘        └─────────────────────────────┘
```

### Schicht 1: das öffentliche Rechtsgehirn

Diese Schicht wird aus öffentlichen Daten klüger. Hier liegt der eigentliche Hebel: Die Konkurrenz aus der Kanzleisoftware hat sie nicht, die Verlage haben keine Akten.

- **Aus jedem neuen RIS-Urteil wird Wissen, nicht nur ein Dokument:** Leitsätze, zitierte Normen, Rechtsfragen, Ergebnis (stattgegeben/abgewiesen), Senat, Streitwertklasse und Verweise auf frühere Entscheidungen. Daraus entsteht ein Zitiernetz: Welche Entscheidung ist herrschende Linie, welche wurde aufgegeben?
- **Rechtsprechungslinien je Norm,** etwa „§ 1096 ABGB: 212 OGH-Entscheidungen, Linie seit 2019 …“. Das ist die Antwort auf „wie ein Anwalt, der alles gelesen hat“, ohne eine einzige Akte.
- **Fassungshistorie und Änderungswarnungen,** die es teilweise schon gibt (Cron statute-currency).
- **Vorhandene Bausteine:** RIS-Delta-Watcher, `law-at-judikatur-*`, `court-analytics.ts`, Dream Cycle.

### Schicht 2: das Kanzlei-Gehirn

Es lernt, wie _diese_ Kanzlei arbeitet. Die Bausteine sind da, die Schleifen aber nicht geschlossen:

- Suchtreffer-Feedback persistieren und als Ranking-Boost je Kanzlei anwenden.
- Daumen und Begründung → Triage → Regressionsfälle je Kanzlei.
- Muster, Klauseln und Playbooks aus unterschriebenen Verträgen und eingebrachten Schriftsätzen (Auto-Playbook gibt es schon).
- Stil und Formulierungen der Kanzlei im Entwurf.

### Schicht 3: die kollektive Erfahrung

Diese Schicht ist neu und unser Alleinstellungsmerkmal, aber nur mit strengen Regeln:

- **Nur Signale über öffentliche Objekte,** also Norm-IDs, Entscheidungs-GZ und Fristregeln. Nie Text, nie Akten, nie Mandantennamen.
- **Die Fragetypen werden lokal in der Kanzlei** in eine feste Taxonomie eingeordnet (z. B. „Mietrecht / Mietzinsminderung / Schimmel“). Hinaus geht nur `{taxonomie_id, norm_id | gz, signal}`.
- **Signale:**
  - „Zitat übernommen“
  - „als falsch/veraltet markiert“
  - „Frist-Regel korrigiert“
  - „Fundstelle führt ins Leere“
- **Aggregation erst ab k ≥ 10 Kanzleien je Zelle,** dazu Rauschen (Differential Privacy), keine Kanzlei-IDs im Pool und kein Rückweg.
- **Opt-in je Kanzlei mit eigener Vertragsklausel,** abschaltbar und in der Oberfläche einsehbar: „Das hat Ihre Kanzlei beigetragen“.
- **Nutzen:**
  - Das Ranking im öffentlichen Gehirn lernt, welche Urteile Anwälte wirklich brauchen.
  - Fehler im Korpus werden von allen gemeldet und einmal für alle behoben.
  - Fristregeln werden über alle Kanzleien validiert.
- **Das ist kein Modelltraining.** Es sind Relevanz-Priors und Korrekturen am öffentlichen Korpus.

### Optional später: freiwillige Muster-Börse

- Eine Kanzlei gibt bewusst ein anonymisiertes Muster frei, etwa eine Klagevorlage, ein Klauselset oder eine Checkliste. Vorher wird es von einem Menschen geprüft und von der Kanzlei freigegeben.
- Ein Beitrag, kein stilles Lernen. Mit Namensnennung wirkt es wie Reputation für die Kanzlei.

### Bewusst nicht

- Kein Training und kein Fine-Tuning auf Akten, Schriftsätzen oder E-Mails, auch nicht „anonymisiert“.
- Keine Mandantendaten im gemeinsamen Pool.
- Keine Kanzlei-Benchmarks ohne k-Anonymität.

## 6. Warum nicht einfach aus den Akten lernen?

1. **Berufsrecht:** Die ÖRAK-Checkliste schließt es aus. Jede Kanzlei, die Subsumio nutzt, müsste sonst selbst gegen § 9 RAO abwägen, und viele würden ablehnen.
2. **Vertrieb:** Unser stärkster Satz lautet heute „Training vertraglich ausgeschlossen“. Wir müssten ihn zurücknehmen, und BEAMON, Legora und Noxtua würden genau damit gegen uns verkaufen.
3. **Technik:** Rechtstexte lassen sich über den Kontext identifizieren. Eine Anonymisierung, die ein Aufsichtsverfahren übersteht, gibt es in dieser Größenordnung nicht. Sprachmodelle können sich Trainingstexte merken.
4. **Nutzen:** Die Antwortqualität kommt bei uns aus Retrieval und Belegen, nicht aus Modellgewichten. Aktuelles öffentliches Recht plus Kanzleikontext schlägt ein nachtrainiertes Modell, das bei der nächsten Novelle veraltet.

## 7. Werbeaussage (Entwurf, nach Textregeln ohne absolute Versprechen)

> **Ein Gehirn, das mit dem österreichischen Recht mitwächst — und Ihre Akten nie verlässt.**
> Jede neue OGH-Entscheidung wird am Tag ihrer Veröffentlichung eingeordnet. Ihr Kanzlei-Gehirn lernt Ihre Muster und Ihren Stil. Und wenn Sie wollen, profitieren alle Kanzleien davon, welche Fundstellen sich in der Praxis bewähren — anonym, ohne einen einzigen Akteninhalt.

Diese Aussage ist wahr, prüfbar und mit der ÖRAK-Checkliste vereinbar, sofern das Gutachten zu Schicht 3 positiv ausfällt.

## 8. Umsetzungsplan

| Phase                                               | Inhalt                                                                                                                                                                                                                                            | Anknüpfung im Code                                                                                                              |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **0 · Fundament (1–2 Wochen)**                      | Suchtreffer-Feedback in Postgres statt `Map`. Boosts im Ranking anwenden (je Kanzlei). Daumen-Feedback → Triage → Regressionsfälle verdrahten. Urteils-Kopien je Kanzlei (`judgements-sync`) zugunsten der gemeinsamen Judikatur-Quellen abbauen. | `src/lib/retrieval-feedback.ts`, `src/lib/answer-feedback.ts`, `src/lib/feedback-triage.ts`, `src/app/api/cron/judgements-sync` |
| **1 · Öffentliches Gehirn anreichern (3–6 Wochen)** | Pro Urteil Leitsätze, Normen, Ergebnis und Zitate extrahieren. Zitiernetz im Graphen. Seite „Rechtsprechungslinie je Norm“. Quellenangabe CC BY.                                                                                                  | RIS-Delta-Watcher, Engine-Links/Graph, `court-analytics.ts`, Dream-Cycle-Legal-Phasen                                           |
| **2 · Kanzlei-Gehirn sichtbar machen**              | Einstellungsseite „Was Ihr Kanzlei-Gehirn gelernt hat“ (Muster, Playbooks, bevorzugte Quellen), löschbar.                                                                                                                                         | `src/lib/copilot-memory.ts`, Auto-Playbook                                                                                      |
| **3 · Kollektive Schicht (nach Gutachten)**         | Taxonomie, lokale Klassifikation, Signal-Export, zentraler Aggregator mit k ≥ 10 + DP, Opt-in-Klausel in AVV/AGB, Transparenzseite.                                                                                                               | neu; Lehren aus dem archivierten `peer-benchmark.ts` (dort fehlte der Aggregator)                                               |
| **4 · Muster-Börse (optional)**                     | Freigabe-Workflow mit menschlicher Anonymisierungsprüfung.                                                                                                                                                                                        | Klauselbibliothek, `anonymize.ts` als Hilfe, nicht als Garantie                                                                 |

**Entscheidungen, die beim Inhaber liegen:**

1. Das Zielbild mit drei Schichten statt Akten-Training freigeben.
2. Ein Gutachten zu Schicht 3 bei einem Berufsrechtler in Auftrag geben und die Frage ggf. der ÖRAK vorlegen.
3. Die Werbeaussage erst nach Phase 1 einsetzen, damit sie am Produkt belegbar ist.

## 9. Stand der Umsetzung (20.09.2026)

- **Schicht 2, erster Schritt steht:** Die Einstellung „Kanzlei-Gehirn lernt mit“
  (kanzleiweit, standardmäßig an, nur Administratoren, protokolliert) entscheidet, ob
  das Wissen der Kanzlei automatisch erweitert wird. Beschrieben in
  `docs/architecture/BRAIN_LEARNING.md`; beworben auf der SuperBrain-Seite
  (Abschnitt `#kanzlei-gehirn`), im FAQ der Startseite und im Handbuchkapitel
  „Kanzlei-Gehirn“.
- **Sprachregel:** „lernt mit“, nie „trainiert“. Innerhalb der Kanzlei wird kein
  Modell trainiert, und „Training“ ist genau das Wort, das die ÖRAK-Checkliste
  ausschließt.
- **Nebenbefund behoben:** Die synthetischen Kommentierungen liegen in einer Tabelle
  ohne Kanzleizuordnung, die jede Kanzlei liest. Sie entstehen daher jetzt
  ausschließlich aus veröffentlichter Rechtsprechung der `law-*`-Quellen, nie aus
  Akten einer Kanzlei (Test: `server/test/commentary-synthesis-law-only.test.ts`).
- **Noch offen aus Phase 0:** Suchtreffer-Feedback dauerhaft speichern und im Ranking
  anwenden; eine Seite, auf der abgeleitete Tatsachen und Einschätzungen einsehbar und
  löschbar sind (heute nur das Gedächtnis des Assistenten).
- **Unverändert offen:** Phase 1 (Leitsätze, Zitiernetz, Rechtsprechungslinien),
  das berufsrechtliche Gutachten zu Schicht 3 und die Onboarding-Entscheidung
  (Empfehlung: Self-Service inklusive, begleitetes Onboarding als Pauschale,
  Papier-Digitalisierung über einen Scan-Partner pro Seite).
