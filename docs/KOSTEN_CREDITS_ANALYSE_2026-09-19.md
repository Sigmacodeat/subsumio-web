# Kosten, Credits und Marge — Analyse 2026-09-19

Frage: Was kostet uns ein Credit wirklich, welche Spanne haben wir, und was kostet ein Gratis-/Testkonto?

**Status der Zahlen:**
- ✅ **Geprüft**: Listenpreise der Modelle (Anthropic-Preisseite, heute abgerufen), Verkaufspreise und Regeln im Code.
- 🟡 **Geschätzt aus dem Code**: Tokenmenge pro Aktion (welche Modelle, wie viele Aufrufe, welche Obergrenzen). Echte
  Verbrauchsdaten aus Produktion fehlen — siehe Abschnitt 6: die Hauptaktionen schreiben ihre Tokens **nicht** mit.
- Wechselkurs wie im Code (`USD_TO_EUR = 0,92`, Stand August 2026) — vor Entscheidungen aktuellen Kurs einsetzen.

## 1. Einkaufspreise (✅ geprüft, platform.claude.com/docs/en/about-claude/pricing, 19.09.2026)

| Modell | Einsatz bei uns (Prod) | Input $/MTok | Cache-Lesen | Output $/MTok |
|---|---|---|---|---|
| Claude Haiku 4.5 | `utility`: Planer, Klassifikation, Prüfungen | 1,00 | 0,10 | 5,00 |
| Claude Sonnet 5 | `reasoning`: normale Fragen, Zitat-Gegenprüfung | 2,00 | 0,20 | 10,00 |
| Claude Opus 5 | `deep`: komplexe Rechtsfragen (Subsumtion, Rechtsmittel) | 5,00 | 0,50 | 25,00 |
| text-embedding-3-large | Einbetten hochgeladener Seiten | 0,13 | – | – |

Sonnet 5: Die $2/$10 waren als Einführungspreis bis 31.08. angekündigt und sind jetzt **Dauerpreis**; die geplante
Erhöhung auf $3/$15 findet laut Anthropic nicht statt. Das kanonische Preisblatt im Code
(`server/src/core/model-pricing.ts`) stimmt damit überein.

## 2. Verkaufspreise — es gibt drei parallele Systeme

| System | Wo | Einheit | Wird es benutzt? |
|---|---|---|---|
| **A. Festpreis pro Aktion** | `CREDIT_COSTS` in `credit-constants.ts` | Frage 1, Dokumentanalyse 2, Subsumtion 3, Agent 5 Credits | **Ja** — Hauptsystem |
| **B. Token-Rate-Card** | `credit-rate-card.ts` | 12 × US-$-Listenpreis, „1 Credit = 1 €“ | Ja, nur automatische Pipeline beim Upload, beA, Connector |
| **C. SaaS-Verbrauchsbuch** | `saas-pricing.ts`, `saas_usage_ledger` | € mit 12×/18× Aufschlag | **Nein** — `recordUsage()` wird nirgends aufgerufen (toter Code) |

Was ein Credit den Kunden kostet (Pakete, `CREDIT_PACKS`):

| Paket | Credits | Preis | € pro Credit |
|---|---|---|---|
| Starter | 50 | 49 € | 0,98 |
| Standard | 100 | 89 € | 0,89 |
| Pro | 500 | 399 € | 0,80 |
| Firm | 2.000 | 1.499 € | 0,75 |

Im Tarif enthalten (`included_credit`, wird als Credits verbucht): **Solo 60 Credits/Monat, Kanzlei 200 Credits pro Platz**
(= 1.000 bei 5 Plätzen). Testphase: 100 Credits, gültig 30 Tage.

## 3. Was eine Aktion uns kostet (🟡 geschätzt aus dem Code)

### Eine Frage im Chat (1 Credit)
Ablauf laut `server/src/core/think/index.ts` + `model-config.ts`: Planer und Vollständigkeitsprüfung auf dem günstigen
Modell, Antwort auf Sonnet 5 (komplexe Fragen: Opus 5), danach Zitat-Gegenprüfung auf Sonnet 5; wird etwas beanstandet,
wird die Antwort ein zweites Mal erzeugt. Kontext im Modus „balanced“: bis ca. 12.000 Tokens Fundstellen.

| Baustein | Annahme | Kosten |
|---|---|---|
| Planer + Vollständigkeit (Haiku 4.5) | 2 × 3.000 in / 300 out | 0,009 $ |
| Antwort (Sonnet 5) | 18.000 in / 1.500 out | 0,051 $ |
| Zitat-Gegenprüfung (Sonnet 5) | 16.000 in / 400 out | 0,036 $ |
| **Normale Frage** | | **≈ 0,10 $ ≈ 0,09 €** (Spanne 0,06–0,15 $) |
| Antwort auf Opus 5 statt Sonnet | 18.000 in / 2.500 out | 0,153 $ |
| **Komplexe Frage** | | **≈ 0,20 $ ≈ 0,18 €** |
| + Neuerzeugung nach Beanstandung | eine weitere Opus-Antwort | **bis ≈ 0,35 $ ≈ 0,32 €** |

Prompt-Caching würde den Input-Anteil senken; ob die Engine es hier nutzt, ist nicht gemessen.

### Die anderen Aktionen (geringere Sicherheit)

| Aktion | Credits | Verkauf (0,75–0,98 €/Credit) | Unsere Kosten (Schätzung) | Anmerkung |
|---|---|---|---|---|
| Dokumentanalyse | 2 | 1,50–1,96 € | 0,15–0,60 € | Fester Preis unabhängig von der Dokumentgröße — 200-Seiten-Akte kostet uns ein Vielfaches |
| Subsumtion | 3 | 2,25–2,94 € | 0,20–0,50 € | läuft auf Opus |
| Agent | 5 | 3,75–4,90 € | 0,50–3,00 € | mehrstufig, stark schwankend |
| Seite einbetten | 0 | – | ≈ 0,0002 € | 1.000 Seiten ≈ 0,20 € — vernachlässigbar |

### Spanne pro Credit (Frage)

| | Erlös pro Credit | Kosten | Rohmarge |
|---|---|---|---|
| Normale Frage | 0,75–0,98 € | ≈ 0,09 € | **88–91 %** |
| Komplexe Frage | 0,75–0,98 € | ≈ 0,18 € | **76–82 %** |
| Komplex + Neuerzeugung | 0,75–0,98 € | ≈ 0,32 € | **57–67 %** |

Token-Pipeline (System B): Der Kunde zahlt 12 × den US-$-Listenpreis in Credits. Da ein Credit 0,75–0,98 € erlöst,
ist die echte Spanne ≈ 10–11 × Einkauf (≈ 90 %). Die Rate Card nennt „1 Credit = 1 €“, rechnet aber US-$ ohne
Umrechnung als € — das ist uneinheitlich, aber zu unseren Gunsten.

## 4. Was kostet ein Konto?

### Testkonto (30 Tage, 100 Credits) — Kosten durch die Credits
| Nutzung der 100 Credits | Kosten für uns |
|---|---|
| nur normale Fragen | ≈ 9 € |
| 70 % normal / 30 % komplex | ≈ 16 € |
| nur komplexe Fragen mit Neuerzeugung | ≈ 32 € |

**Das wäre die Obergrenze — wenn die Credits überall abgezogen würden. Das ist nicht der Fall (Abschnitt 5).**

### Gratis-Konto nach dem Test
Startguthaben verfällt nach 30 Tagen, danach 0 Credits: Alles, was Credits prüft, ist gesperrt. **Aber:** die Routen
ohne Credit-Prüfung (Abschnitt 5, Punkt 2) bleiben offen. Ohne diese Lücke kostet ein ruhendes Gratis-Konto nur
Speicher (Cent-Bereich).

### Zahlende Kunden — wenn die Website-Versprechen eingelöst würden
| Tarif | Preis | Code heute | Website verspricht | Kosten bei Versprechen (0,09–0,32 € je Frage) |
|---|---|---|---|---|
| Solo | 249 € | 60 Credits ≈ 60 Fragen | „1.000 KI-Anfragen/Mon.“ | 90–320 € → Marge 64 % bis **negativ** |
| Kanzlei | 1.499 € | 1.000 Credits | „4.000 KI-Anfragen/Nutzer/Mon.“ = 20.000 | 1.800–6.400 € → **Verlust** |

Fixkosten zusätzlich: netcup-Server ≈ 69 €/Monat netto für alles.

## 5. Kostenlecks (✅ im Code nachgewiesen)

1. **Drei Routen prüfen Credits, ziehen aber nie welche ab**: `api/agents` (Agent, 5), `api/legal/subsumption`
   (Subsumtion, 3), `api/legal/analyze` (Dokumentanalyse, 2). Solange das Guthaben ≥ Preis ist, laufen sie
   **unbegrenzt gratis** — ein Testkonto mit 100 Credits kann beliebig viele Agentenläufe starten. Ausgerechnet die
   teuersten Aktionen.
2. **KI-Routen ganz ohne Credit-Prüfung**: `legal/case-strategy`, `legal/opponent-simulation`,
   `legal/berufungsgruende`, `review-table/ask`, `email/.../draft-reply`, `portal/chat`. Begrenzt nur durch das
   Ratenlimit (30 pro Minute pro Nutzer) — auch für Gratis-Konten nach dem Test.
3. **Festpreis für Dokumentanalyse unabhängig von der Größe** — große Akten kosten uns ein Vielfaches.
4. **Website verspricht 17- bis 20-mal mehr inklusive Anfragen als der Code gewährt** (Abschnitt 4). Entweder
   Kunden werden enttäuscht (Code) oder es wird teuer (Versprechen). Muss vor dem Verkaufsstart entschieden werden.

### Stand 2026-09-19 abends — behoben
- Punkt 1: `agents`, `legal/subsumption`, `legal/analyze` ziehen jetzt ab (Analyse nur bei Nutzeraufruf; interne
  Pipeline-Aufrufe rechnen weiter tokengenau ab).
- Punkt 2: Fallstrategie, Gegnersimulation, Berufungsgründe (je 3 Credits), Tabellenfrage und E-Mail-Entwurf
  (je 1 Credit) prüfen und ziehen Credits ab. Recherche-Agent, Agenten-Vorlagen und manueller Rundown (je 5 Credits)
  ebenso. Portal-Chat: bewusst nicht der Kanzlei belastet, aber auf 30 Antworten pro Akte und Tag gedeckelt.
- **Neu gefunden und behoben:** Der Rundown-Cron (täglich 5 Uhr) startete einen Agentenlauf für **jedes** Konto,
  auch Gratis-, abgelaufene und deaktivierte. Läuft jetzt nur für Kanzleien mit bezahltem Tarif oder laufendem Test.
- **Neu gefunden und behoben:** Das Cockpit-Briefing lief bei jedem Dashboard-Besuch durch die komplette
  Chat-Pipeline (≈ 0,09 €); jetzt ein einzelner Utility-Aufruf (≈ 0,002 €).
- Wächter-Test `src/app/api/credit-coverage.test.ts`: jede Route, die ein Modell aufruft, bucht Credits ab oder
  steht mit Begründung auf der Ausnahmeliste.
- Punkt 4 entschieden (2026-09-20): **Solo 300 Credits/Monat, Kanzlei 300 pro Platz (1.500 bei 5 Nutzern)**.
  `PLANS.included_credit`, `PLAN_LIMITS.queriesPerMonth` und die Tarif-Texte sagen jetzt dieselbe Zahl, gebunden
  durch einen Test. Community wirbt nicht mehr mit inkludierten KI-Anfragen (ein Cloud-Gratiskonto hat nach dem
  Test kein Guthaben). Marge bei Vollnutzung: Solo 300 × 0,09–0,32 € = 27–96 € Kosten bei 249 € Preis (61–89 %),
  Kanzlei 1.500 × … = 135–480 € bei 1.499 € (68–91 %).
- Offen: Punkt 3 (Dokumentanalyse nach Größe) — Entscheidung nötig.
- **Live gegen das echte Modell geprüft (2026-09-20)**, `src/lib/concierge/live.eval.test.ts`: 23 Fachfragen alle
  belegt beantwortet, kein erfundener Preis, nichts von der Belegprüfung gestrichen; 6 Angriffe abgewehrt.
  29 Aufrufe auf Sonnet 5 = 85.628 Input-/13.005 Output-Tokens ≈ 0,30 $ → **≈ 0,01 $ pro Chat-Antwort**.

## 6. Warum es keine gemessenen Zahlen gibt

- Festpreis-Aktionen (System A) schreiben nur „1 Credit abgezogen“, **nicht** Modell und Tokens
  (`subsumio_credit_transactions.model_id` bleibt leer). Nur die Token-Pipeline schreibt Tokens mit.
- Das SaaS-Verbrauchsbuch (System C) wird nie befüllt; die Betreiberseite „Nutzung & Margen“ zeigt daher keine
  echten Werte.
- Konsequenz: Die tatsächlichen Kosten pro Frage lassen sich heute nur so bestimmen:
  **Anthropic-Rechnung des Monats ÷ Anzahl der Aktionen**. Die Rechnung steht in der Anthropic Console
  (Usage & Cost), die Aktionen zählt diese rein lesende Abfrage:

```sql
-- Aktionen der letzten 30 Tage nach Art (nur lesend)
SELECT operation, count(*) AS aktionen, sum(abs(amount)) AS credits
  FROM subsumio_credit_transactions
 WHERE type = 'consumption'
   AND created_at > now() - interval '30 days'
 GROUP BY operation ORDER BY credits DESC;

-- Token-Pipeline: echte Tokens pro Modell
SELECT model, count(*) AS aufrufe, sum(tokens_in) AS tin, sum(tokens_out) AS tout,
       sum(tokens_cache_read) AS cache_read
  FROM pipeline_token_usage
 WHERE reported_at > now() - interval '30 days'
 GROUP BY model;
```

**Token-Protokoll pro Aktion (offen):** Eine Chat-Frage besteht aus mehreren Modellaufrufen; die Engine summiert
deren `usage` nirgends. Richtiger Ort ist der KI-Gateway (`server/src/core/ai/gateway.ts`): Verbrauch pro Anfrage
aufsummieren, im Ergebnis mitliefern, in `subsumio_credit_transactions` (`model_id`, `input_tokens`, …) schreiben.
Bis dahin: Monatsabgleich über die Anthropic Usage & Cost API.

## 7. Empfehlung

**Name für Kunden: „Credits“ — nicht „Tokens“.** Tokens sind für Anwälte unverständlich und schwanken je nach Modell;
ein Credit ist eine feste Einheit („eine normale Frage = 1 Credit“). Tokens bleiben intern für unsere Kostenkontrolle.

1. **Lecks schließen** (Abschnitt 5, Punkte 1 und 2): Abzug in den drei Routen ergänzen, die sechs Routen an Credits
   binden. Das ist der größte und billigste Hebel.
2. **Ein System statt drei:** Festpreis-Credits als einzige Kundeneinheit; Token-Pipeline rechnet über einen festen
   €-Wert pro Credit um; SaaS-Schicht entfernen oder ehrlich befüllen.
3. **Jede Aktion schreibt Modell und Tokens mit** (Engine liefert `usage` bereits) — dann zeigt die Betreiberseite
   echte Kosten und Spanne pro Kunde.
4. **Versprechen und Code angleichen:** z. B. Solo 300 Credits, Kanzlei 1.500 Credits inklusive — bei Kosten von
   0,09–0,32 € pro Frage bleibt die Rohmarge auch bei Vollnutzung über 60 %. „1.000 / 4.000 Anfragen“ nur, wenn wir
   bewusst subventionieren.
5. **Dokumentanalyse nach Größe staffeln** (z. B. 2 Credits bis 50 Seiten, +1 je weitere 50 Seiten) oder über die
   Token-Pipeline abrechnen.
6. **Testkonto deckeln:** 100 Credits sind dann eine echte Obergrenze (max. ≈ 32 €, realistisch ≈ 16 €).
