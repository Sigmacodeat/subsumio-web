# Sigmabrain — Strategie, Pre-Mortem & Monetarisierung

> **INTERN — nicht in öffentliche Releases aufnehmen.** Stand: 11. Juni 2026.
> Basis: gbrain v0.42.38.0 (Fork), Web-App in `web/`, Markt-Recherche Juni 2026.

---

## 1. Executive Summary

Sigmabrain ist ein Fork von gbrain — technisch eines der stärksten Retrieval-/Memory-Systeme
am Markt (Hybrid-Suche, selbstverdrahtender Wissensgraph, Synthese mit Gap-Analyse,
Multi-Tenant fuzz-getestet). Das Produkt-Risiko ist **nicht die Technik. Es ist Distribution,
Verpackung und Fokus.** Die Kategorie "AI Memory" ist 2026 hart umkämpft (Mem0, Zep, Letta,
Cognee, Supermemory) — dort gewinnen wir nicht über Features, sondern indem wir die Kategorie
wechseln: **Sigmabrain verkauft keine Memory-API an Entwickler, sondern ein "Company Brain"
an wissensintensive Teams** — mit vertikalen Funnels (VC/PE, Legal, Consulting), einem
Pricing über dem Dev-Tool-Niveau und einem Empfehlungsmarketing-Programm mit wiederkehrender
Provision als primärem Wachstumskanal.

Die eine Entscheidung, die alles andere dominiert: **ein Vertikal als Beachhead wirklich
gewinnen (Empfehlung: VC/PE), die anderen als Funnel-Pages mitführen.** Multi-Vertikal nach
außen, Single-Vertikal im operativen Fokus.

---

## 2. Pre-Mortem: "6 Monate später — es läuft nicht. Warum?"

Methode: Wir tun so, als wäre Juni 2026 + 6 Monate = Dezember 2026, das Produkt ist fertig,
und es ist trotzdem gescheitert. Das sind die zehn wahrscheinlichsten Todesursachen,
sortiert nach Letalität — jeweils mit dem Gegenmittel, das JETZT eingebaut werden muss.

### K1 — Wir verkaufen Infrastruktur an Leute, die Lösungen kaufen wollen. (Tödlichkeit: maximal)

gbrain ist heute ein CLI-/MCP-Tool, das "von einem AI-Agenten installiert" wird, mit
PGLite/Supabase, API-Keys und 30-Minuten-Setup. Unsere Zielkunden (Partner in VC-Fonds,
Anwälte, Berater) **installieren keine CLI und besitzen keine API-Keys.** Wenn nach 6 Monaten
niemand zahlt, ist das der Grund Nr. 1: Es gab nie eine gehostete, anmeldbare Cloud-Version.
- **Gegenmittel:** Managed Cloud ist KEIN "später"-Feature, sondern das Produkt. Signup →
  E-Mail → Brain läuft, in unter 3 Minuten, ohne eigenen API-Key (Keys liegen bei uns,
  Kosten sind im Preis einkalkuliert). Self-hosted bleibt als Open-Source-Pfad und
  Enterprise-Argument bestehen.

### K2 — Kategorie-Falle: Wir sind "noch ein Memory-Layer" geworden. (Tödlichkeit: hoch)

Mem0 ($19–249/Monat), Zep ($25/Monat), Supermemory (usage-based ab $5) kämpfen um Entwickler
mit sinkenden Preisen und Benchmark-Schlachten. Wenn unsere Landing Page "Hybrid-Suche, HNSW,
RRF, P@5" schreit, vergleichen Käufer uns mit $19-Tools — und wir verlieren auf deren Spielfeld.
- **Gegenmittel:** Outcome-Sprache statt Architektur-Sprache. Nicht "RRF-Fusion", sondern
  "Du gehst vorbereitet ins Meeting". Technik-Benchmarks gehören auf eine /technology-Seite
  für die Due Diligence, nicht in den Hero.

### K3 — Kein Distributionskanal: "Build it and they will come". (Tödlichkeit: hoch)

Ein Referral-Programm multipliziert Traffic — **0 × 30 % Provision = 0.** Wenn nach 6 Monaten
nur 40 Besucher/Tag kommen, war das Empfehlungsprogramm wirkungslos, weil es niemanden gab,
der empfehlen konnte.
- **Gegenmittel:** Erst 100 Kunden manuell (Founder-Sales: warme Intros, LinkedIn in der
  Vertikale, Communities), DANN skaliert das Partnerprogramm. Affiliate-Programm ab Tag 1
  aufsetzen (Kosten ~0), aber als Verstärker einplanen, nicht als Motor.

### K4 — Pricing positioniert uns als Spielzeug. (Tödlichkeit: hoch)

29 €/Monat "Pro" sagt einem VC-Partner oder einer Kanzlei: "Das ist ein Consumer-Tool."
Harvey nimmt $1.000+/Seat/Monat von Kanzleien. Gleichzeitig: Ein Power-User im
tokenmax-Modus verursacht real dreistellige LLM-Kosten/Monat (siehe CLAUDE.md-Kostenmatrix) —
**bei 29 € Flatrate zahlen wir drauf. Negative Unit Economics töten leise.**
- **Gegenmittel:** Neues Pricing (Abschnitt 6): Pro 79 €, Team 290 €, Enterprise individuell.
  Fair-Use-Token-Budget pro Tier, das die Kostenmatrix aus CLAUDE.md respektiert
  (conservative-Mode im Pro-Tier als Default).

### K5 — Upstream-Merge-Hölle mit gbrain. (Tödlichkeit: mittel, chronisch)

gbrain shippt im Wochentakt (v0.42.x!). Nach 6 Monaten Divergenz ist der Fork entweder
veraltet (wir verlieren das beste Argument: die Engine) oder das Mergen frisst 30 % der
Entwicklungszeit.
- **Gegenmittel:** Harte Trennung: Engine bleibt so nah wie möglich am Upstream (keine
  Core-Patches ohne Not, eigene Features als Layer darüber). `web/`, Branding, Billing,
  Cloud-Hosting leben in unserem Territorium, das Upstream nie anfasst.

### K6 — Trust-Lücke: Kein DSGVO-Paket, keine echten Referenzen. (Tödlichkeit: hoch in DACH)

Kanzleien und Fonds kaufen kein Tool ohne AVV (Auftragsverarbeitungsvertrag), Impressum,
Datenschutzerklärung, Hosting-Standort-Antwort und Referenzen. **Akut: Die aktuellen
Landing-Page-Testimonials ("Dr. M. Schulze, Rechtsanwalt") sind erfunden — in Deutschland
ist das wettbewerbsrechtlich abmahnfähig (UWG, Irreführung) und zerstört bei Auffliegen
genau das Vertrauen, von dem ein Brain-Produkt lebt.**
- **Gegenmittel:** Fake-Testimonials sofort raus (in dieser Session erledigt — ersetzt durch
  ehrlich gekennzeichnete Anwendungsszenarien). Impressum + Datenschutz-Seiten angelegt
  (Platzhalter, vor Launch von Anwalt prüfen lassen). AVV-Template und "Wo liegen meine
  Daten?"-Seite vor dem ersten zahlenden DACH-Kunden. Self-Hosted/EU-Hosting als
  Differenzierer gegen US-Tools aktiv vermarkten.

### K7 — Onboarding-Killer: Time-to-Value > 10 Minuten. (Tödlichkeit: hoch)

Der "Aha-Moment" ist die erste synthetisierte Antwort auf die EIGENEN Daten. Wenn dafür
erst 500 Dokumente hochgeladen werden müssen, springen 90 % vorher ab.
- **Gegenmittel:** Onboarding mit sofortigem Wert: (a) Demo-Brain mit Beispieldaten zum
  Sofort-Abfragen, (b) ein einziger Import (E-Mail-Postfach ODER Ordner-Drop ODER
  Meeting-Notizen) reicht für die erste echte Antwort, (c) die erste Antwort wird aktiv
  inszeniert, nicht dem Zufall überlassen.

### K8 — Drei Vertikale gleichzeitig = null Vertikale gewonnen. (Tödlichkeit: mittel)

Multi-Vertikal-Funnels sind als Fassade billig (3 Landing Pages). Aber wenn Sales, Content,
Integrationen und Referenzen auf drei Branchen verteilt werden, entsteht nirgends kritische
Masse.
- **Gegenmittel:** Funnel-Pages für alle drei (erledigt), aber 80 % der operativen Energie
  auf EINE Wedge-Vertikale. Empfehlung VC/PE: Das Graph-Schema (invested_in, founded,
  advises) ist bereits dafür gebaut, die gbrain-Herkunft (YC-Produktionsbrain) ist die
  glaubwürdigste Referenzgeschichte, und der Markt zahlt vierstellig pro Jahr ohne
  Compliance-Zyklus einer Kanzlei.

### K9 — SEO-/Brand-Kollision "Sigma Brain". (Tödlichkeit: niedrig, nervig)

"Sigma Brain" ist ein Gamer-Supps/H3H3-Energy-Drink mit starker SEO-Präsenz; "Sigma" trägt
zusätzlich Meme-Konnotation ("sigma male"). Organische Suche nach unserem Markennamen zeigt
6 Monate lang Nootropic-Pulver.
- **Gegenmittel (Entscheidung: Name bleibt):** Konsequent **ein Wort "Sigmabrain"** (nie
  "Sigma Brain") in jedem Text, Title-Tag, Backlink. Kategorie-Keyword immer mitführen
  ("Sigmabrain — The Company Brain"). Domains sofort sichern: sigmabrain.com + .de + .ai
  + .io. Trademark-Recherche Klasse 9/42 (Software) — andere Nizza-Klasse als das Getränk
  (32), Konflikt unwahrscheinlich, aber prüfen lassen. Brand-Suchanfragen gewinnen wir
  über Eigentraffic, nicht über Verdrängung des Drinks.

### K10 — Einzelkämpfer-Scope-Explosion. (Tödlichkeit: chronisch)

Cloud-Hosting + Billing + 10 Marketing-Seiten + 3 Vertikale + Partnerprogramm + Dashboard
+ Upstream-Merges ist ein 5-Personen-Backlog. Nach 6 Monaten ist alles zu 60 % fertig und
nichts launchbar.
- **Gegenmittel:** Launch-Definition radikal klein: 1 Vertikale, 1 gehosteter Plan,
  1 Onboarding-Pfad, Stripe + Rewardful, Rest ist Waitlist. Die 90-Tage-Sequenz in
  Abschnitt 8 ist darauf zugeschnitten.

**Zusammengefasst — die drei Fehler, die uns wirklich töten:** (1) kein gehostetes Produkt
für Nicht-Techniker, (2) Dev-Tool-Positionierung & -Pricing im falschen Markt,
(3) kein aktiver Distributionsaufbau vor dem Skalierungs-Hebel Referral.

---

## 3. Naming: Sigmabrain (Entscheidung: behalten)

| Kriterium | Bewertung |
|---|---|
| Domain sigmabrain.com frei | ✅ Sofort registrieren (+ .de, .ai, .io, Social Handles) |
| Einprägsam, aussprechbar DE+EN | ✅ stark |
| Kategorie-Fit ("Brain") | ✅ trägt die Produktmetapher |
| SEO-Kollision Gamer Supps "Sigma Brain" | ⚠️ real, aber andere Kategorie; einteiliges "Sigmabrain" + Kategorie-Claim mildert |
| Meme-Risiko "Sigma" | ⚠️ in B2B-Vertikalen vernachlässigbar, bei Gen-Z-Consumer eher Vorteil |
| Trademark | ⚠️ Nizza-Klasse 9/42 vs. 32 (Getränk) — Recherche beauftragen, Risiko gering |

**Entscheidung Vertikal-Marken „Subsumio" (Legal) / „Taxumio" (Tax) etc.
(Juni 2026): JA als Produktlinien-Namen, NEIN als eigenständige Marken.**
Empfohlenes Modell: **„Subsumio — powered by Sigmabrain"** (Branded-House-
Light). Begründung: (a) Eigenständige Marken × N Branchen = Marketing-Budget,
SEO-Autorität und Vertrauensaufbau × N — als Einzelkämpfer der sichere Weg,
überall Mittelmaß zu sein (K3/K10); (b) Produktlinien-Namen auf den
bestehenden Vertikal-Funnels (+ später eigene Domains subsumio.com →
sigmabrain.com/solutions/legal als Redirect oder gehostete Skin) fangen die
branchenspezifische Suche ab, OHNE die Plattform-Marke zu fragmentieren;
(c) die Architektur trägt es bereits heute: Ein Codebase, Content-getriebene
Vertikale, Branche-am-Konto (Signup-Select), Schema-Packs je Branche —
eine eigene Landingpage je Produktlinie ist Content, kein Umbau. Kauf-Flow
direkt auf der Landingpage = bestehender /signup mit vorbelegter Branche
(`/signup?industry=legal` — Query-Param-Vorbelegung ist der nächste kleine
Schritt). WICHTIG vor Nutzung der Namen: Markenrecherche (Nizza 9/42) für
„Subsumio"/„Taxumio" beauftragen — gleiche Sorgfalt wie beim Hauptnamen (K9).

**Entscheidung „Sigmabrain OS" (Juni 2026): NICHT als Hauptbrand.** Gründe:
(a) ICP sind Nicht-Techniker — „OS" signalisiert Komplexität/Lock-in, Gegenteil
des 3-Minuten-Versprechens; (b) /compare verneint bewusst Vollständigkeit
(keine Recherche, kein Drafting) — „OS" behauptet sie und untergräbt die
Ehrlichkeits-Strategie; (c) Ein-Wort-Brand-Regel (K9) würde fragmentiert.
**Reserviert als Produktname** für das spätere Self-Host-Desktop-Bundle
(Tauri + Engine lokal): „Sigmabrain OS — dein Brain, komplett auf deiner
Hardware." Dort trägt „OS" die richtige Bedeutung (eigenständig lauffähiges
System) statt einer leeren Plattform-Behauptung.

Brand-Regeln: immer "Sigmabrain" (ein Wort, großes S), Claim immer dabei:
**EN: "Sigmabrain — the brain your firm never had."** / **DE: "Sigmabrain — das Gedächtnis
deiner Firma."** Sub-Claim je Vertikale auf den Funnel-Pages.

---

## 4. Markt & Positionierung

**Kategorie-Landschaft Juni 2026:**

- **Dev-Memory-APIs:** Mem0 (Hobby free / Starter $19 / Pro $249 / Enterprise), Zep
  (Graph-Memory ab $25/Monat), Supermemory (usage-based, $5 frei), Letta/Cognee (open
  source). Kämpfen um Agent-Entwickler. **Nicht unser Spielfeld — aber unsere Engine
  schlägt sie bei Synthese + Graph, das ist die /technology-Story.**
- **Vertikale Lösungen:** Harvey (Legal, ~$1.000+/Seat/Monat, $50k–300k-Verträge, 20+
  Seats Minimum), Affinity/Attio (VC-CRM), Notion/Glean (horizontales Firmenwissen).
  **Hier sitzt das Geld — und zwischen $25-Dev-Tool und $288k-Harvey-Vertrag klafft
  eine riesige Mid-Market-Lücke. Das ist unsere Position.**

**Positionierung:** "Das Company Brain für wissensintensive Teams. Eine Antwort statt
zehn Dokumente — aus euren Meetings, Mails, Deals und Akten. Self-hosted oder EU-Cloud."

**Vertikale Funnels (außen) + Wedge (innen):**

1. **VC / PE / Investoren** *(Wedge — operativer Fokus)*: Deal-Memos, Founder-Tracking,
   Meeting-Prep, "Wer hat in X investiert?". Graph-Kanten existieren bereits. Referenz-
   Story: produktiv auf 146k Seiten / 24,5k Personen / 5,3k Firmen (Upstream-Produktionsbrain).
2. **Legal / Kanzleien**: Akten-Synthese, Fristen, Widerspruchs-Findung; DSGVO/Self-Hosted
   als Killer-Argument gegen US-Clouds; Preisanker Harvey macht uns "günstig".
3. **Consulting / Agenturen**: Institutional Memory, Pitch-Historie, Projektwissen,
   Onboarding neuer Berater in Minuten.
4. **Executive Search & Recruiting** (seit Branding-Runde): proprietärer Talent-Graph.
5. **Steuerberater & Wirtschaftsprüfer** *(NEU, Juni 2026 — `/solutions/tax`)*: das
   "Kanzleigedächtnis neben DATEV".

### 4a. Markt-Update Juni 2026 (Deep Research, 2. Runde)

**Legal DACH — die Lücke ist bestätigt und größer geworden:**
- Harvey: ~1.200 USD/Seat/Monat, 20–50 Seats Minimum → ab ~290k USD/Jahr. Legora
  (vormals Leya): 5,55 Mrd. USD Bewertung (März 2026). Beide jagen Big Law.
- Beck-Noxtua (Launch Nov. 2025) besetzt "souveräner deutscher Legal-AI-Workspace" —
  beweist, dass der DACH-Markt Souveränität KAUFT. Unser Konter: Self-Hosted ist
  maximale Souveränität (auditierbare Open-Source-Engine), und wir sind die
  Wissensschicht über den EIGENEN Akten, keine Rechtsrecherche → kein Frontalangriff
  auf Noxtua/beck-online nötig.
- ~300 Legal-Tech-Firmen in DE, ~800 Mio. € Marktvolumen. Zwischen 25-$-Dev-Tools
  und 290k-$-Harvey klafft weiter die Mid-Market-Lücke — Funnel-Copy nennt das jetzt
  explizit (FAQ "Was unterscheidet das von Harvey, Legora oder Noxtua?").

**Steuerberater — warum die fünfte Vertikale jetzt:**
- **Regulatorischer Burggraben:** § 203 Abs. 4 StGB verlangt ZUSÄTZLICH zur AVV eine
  Verschwiegenheitsverpflichtung des Tool-Anbieters (BStBK-FAQ "KI in der
  Steuerberatung", Stand Jan. 2026; DStV-Muster-KI-Richtlinie April 2026). Die meisten
  US-Clouds scheitern daran. Self-Hosted umgeht § 203 strukturell (keine mitwirkende
  Person) — kein anderer nennenswerter Anbieter kann das mit auditierbarer Engine.
- **Schmerz:** 72,7 % der Kanzleien melden Fachkräftemangel, 55 % Burnout. Wissen über
  Mandanten-Besonderheiten lebt in Köpfen und Postfächern.
- **Komplement, nicht Konkurrenz:** DATEV Copilot (seit Feb. 2026, kostenlos für
  Mitglieder) deckt das DATEV-Universum (strukturierte Welt) ab; Taxy.io/NWB KIRA/
  Haufe CoPilot Tax decken Steuer-RECHERCHE ab. Niemand besetzt das unstrukturierte
  Kanzleigedächtnis (Mails, Gestaltungs-Memos, Besprechungsnotizen). Positionierung:
  "DATEV kennt die Zahlen. Sigmabrain kennt das Warum."
- Demo-Use-Case auf der Funnel-Page: E-Rechnungs-Pflicht-Betroffenheit über alle
  Mandanten + Kommunikations-Historie — Cross-Mandanten-Frage, die kein DMS beantwortet.

### 4b. Konkurrenz-Vollanalyse + Adoptions-Roadmap (Juni 2026, Runde 3)

**Verifizierte Wettbewerbslandschaft** (Details + Quellen auf `/compare`, EN+DE):

| Anbieter | Kategorie | Kern-Fakten (verifiziert) |
|---|---|---|
| Harvey | Enterprise Legal AI | Vals-Benchmark Top-Werte; Berichte: ~1.200 $/Seat/Monat, 20–50-Seat-Min.; LexisNexis-Partnerschaft; kein Self-Host, closed |
| Legora | Enterprise Legal AI | 100 Mio. $ ARR (Apr. 2026), 5,55 Mrd. $ Bewertung; Preise individuell |
| CoCounsel (TR) | Research + Workflows | Westlaw-Kopplung; öffentl. Konfigurator: ab ~639 $/User/Monat (Solo, inkl. Westlaw); beste Rechtsrecherche |
| Lexis+ AI / vLex Vincent | Research | Riesige Rechtsdatenbanken, Zitatprüfung; Vincent im Vals-Benchmark 53,6–72,7 % |
| Beck-Noxtua | DACH souverän | Eigenes deutsches Legal-LLM (beck-online-Training), IONOS/OTC-Hosting, min. 3 Lizenzen, kein Self-Host |
| Libra | DACH | Von Wolters Kluwer übernommen (2026) — Konsolidierung läuft |
| Spellbook | Verträge in Word | 99–199 $ (Enterprise ~350 $)/User/Monat; SMB-freundlich |
| Luminance | M&A/DD | **Bietet On-Premise!** Berichte: 50–100k $+/Jahr für kleine Teams; closed source |
| Glean | Knowledge Layer | ~50 $/User/Monat, ~100-Seat-Min. (~60k $/Jahr Einstieg); 100+ Konnektoren; **SaaS-only, kein Self-Host**; eigener Enterprise-Graph |

**Ehrlichkeits-Korrektur unserer eigenen Story:** Self-Hosting ist NICHT einzigartig
(Luminance hat On-Premise). Unser belastbares Unikat ist die Kombination:
**Open Source (auditierbar) + 0-€-Self-Host + kein Seat-Minimum + Cross-Domain-Graph
+ Gap-Analyse.** Die `/compare`-Seite verliert bewusst die Zeilen Rechtsrecherche,
Drafting, Legal-Benchmark und Konnektoren-Katalog — das macht die gewonnenen Zeilen
glaubwürdig (und ist UWG-sicher: jede Drittanbieter-Angabe verlinkt eine öffentliche
Quelle, Unbekanntes steht als „k. A.").

**Adoptions-Roadmap (technisch bessere Ideen der Konkurrenz → kopieren):**

| Idee (von wem) | Status |
|---|---|
| Fristen-/Termin-Extraktion bei Ingestion (Subsumio, Harvey-Workflows) | ✅ **GEBAUT:** `skills/deadline-extract/` — Extraktion + Timeline-Filing; berechnet bewusst KEINE gesetzlichen Fristen (Verifikations-Flag statt falscher Autorität) |
| Ehrliche Vergleichsseite als Vertrauenskanal (Lulius' Preisvergleichs-Content-Strategie) | ✅ **GEBAUT:** `/compare` + `/de/compare` |
| Zitatprüfung gegen Quelldokument (Lexis Shepard's-Konzept, auf eigene Akten übertragen) | Vorhanden: citation-fixer-Skill + Dream Cycle. Ausbau: Ein-Klick-Verifikation im Dashboard-Query-UI (Zitat → Fundstelle springen) — Tage 31–60 |
| Konnektoren-Katalog (Glean) | Teilweise (connector-ingest: Drive/Gmail/Notion/GitHub). Ausbau NUR nach Wedge-Traktion — 100+ Konnektoren sind ein Multi-Jahres-Burggraben, nicht kopierbar in einem Sprint |
| Word-Add-in (Spellbook) | NICHT kopieren — anderes Produkt, volle Plattform-Abhängigkeit, K10-Scope-Falle |
| Eigenes Legal-LLM (Noxtua) | NICHT kopieren — Kapitalbedarf zweistellige Millionen; unsere Engine ist modell-agnostisch (API-Wahl ist ein Feature, kein Mangel) |
| Audit-Trail mit Hash-Kette (Subsumio, Luminance-Compliance) | Kandidat fürs Enterprise-Tier (AVV/Compliance-Argument), nach erstem Enterprise-Lead |

**Recherchierte Kandidaten für Vertikale 6+ (NICHT bauen vor Wedge-Traktion, K8!):**
- **Versicherungsmakler/-agenturen:** Branchenanalysen nennen "preserving fast-vanishing
  institutional knowledge" explizit als Top-Problem; AI-native Broker (Novella, 21 Mio. $
  Raise Mai 2026; Harper/YC) zeigen Investoren-Appetit. Schmerz = Renewal-Historie,
  Kunden-Kontext, Carrier-Beziehungen.
- **Family Offices / Wealth Management:** gleiche Graph-Stärke wie VC (Beteiligungen,
  Beziehungen), höchste Diskretionsanforderungen → Self-Hosted-Argument zieht maximal.
- **Notare / M&A-Boutiquen:** strukturell identisch mit Legal/Steuer (Verschwiegenheit,
  Akten, Fristen), kleinerer Markt — als Sub-Segment der Legal-Page mitnehmen, keine
  eigene Page.

---

## 5. Monetarisierung & Pricing (überarbeitet)

Grundsätze: (a) Preis trägt die LLM-Kosten je Tier (Search-Mode als Kostenhebel:
Pro = conservative/balanced, Team = balanced, Enterprise = tokenmax möglich),
(b) Preis signalisiert Vertikal-Wert, nicht Dev-Tool, (c) Self-Hosted bleibt frei
(Open Source = Top-of-Funnel + Enterprise-Türöffner).

| Plan | Preis | Für wen | Inhalt |
|---|---|---|---|
| **Open Source** | 0 € | Techniker, Self-Hosted | Volle Engine, eigene Keys, Community |
| **Pro** | **79 €/Monat** | Einzelne Professionals | Gehostet, 25k Seiten, Fair-Use-Queries, Dream Cycle, E-Mail-Import |
| **Team** | **290 €/Monat** (5 Seats inkl., +49 €/Seat) | Fonds, Kanzleien, Beratungen | Multi-User scoped Access, Shared Brain, Admin, Prioritäts-Support |
| **Enterprise** | ab 12.000 €/Jahr | 25+ Seats, Compliance | EU-/On-Prem-Hosting, AVV/SLA, SSO, tokenmax |

Jahreszahlung −20 %. Kein "Unbegrenzte Queries"-Versprechen mehr (Unit-Economics-Falle K4);
stattdessen großzügiges Fair-Use mit transparenter Anzeige im Dashboard.

---

## 6. Empfehlungsmarketing: das Sigmabrain-Partnerprogramm

Drei Schichten, ein Prinzip: **wiederkehrende Provision auf wiederkehrenden Umsatz.**
(Benchmarks 2026: SaaS-Standard 20–30 % recurring; B2B 10–20 %; "kompetitiv" = 25–30 %.)

### Schicht 1 — Affiliates (Content-Creator, Newsletter, YouTube, Kurs-Anbieter)
- **AKTUALISIERT (Juni 2026, Struktur-Entscheidung): Zwei-Ebenen-Programm, hart
  gedeckelt.** Split: **25 % wiederkehrend (Ebene 1, direkt geworbene Kunden) +
  5 % Override (Ebene 2, Kunden von selbst rekrutierten Affiliates)** — 30 %
  Gesamtabgabe bleibt, identische Unit Economics, aber der Override macht
  Partner-Rekrutierung zum eingebauten Wachstumsmotor („passiv verdienen").
  Jeweils 12 Monate pro Kunde, 90-Tage-Cookie, Auszahlung ab 50 €.
- **Warum exakt 2 Ebenen und keine dritte (verbindlich):** (a) § 16 Abs. 2 UWG /
  § 27 öUWG — Provision ausschließlich auf echten Produktumsatz, nie auf Anwerbung,
  keine Einstiegsgebühren; ab Ebene 3 entsteht progressive-Kundenwerbung-Optik und
  -Risiko. (b) Marken-Risiko: MLM-Geruch zerstört die Vertrauensposition bei
  Verschwiegenheits-Kunden (Kanzleien/StB) — der /partners-Auftritt erklärt den
  2-Ebenen-Deckel deshalb OFFENSIV als Feature (Compliance-Box).
- **Gebietsexklusivität: ENTSCHIEDEN NEIN (vorerst).** Gründe: vor Traktion
  unbepreisbar (man verkauft Versprechen), EU-Vertikal-GVO macht Gebietsschutz +
  Beschränkung passiver Verkäufe zur Anwaltssache, und Exklusivität ohne
  Performance-Bindung blockiert die besten Regionen für immer. **Alternative im
  Programm: „Regional Launch Partner"** — leistungsgebundener Regional-Vorrang,
  Right of First Refusal auf etwaige spätere Exklusivität, voller 5-%-Override auf
  lokal rekrutierte Affiliates. Re-Evaluation von echter Exklusivität erst ab
  nachgewiesener Traktion (≥ 25 zahlende Kunden in einer Region) und nur mit
  anwaltlich erstelltem Vertriebspartnervertrag.
- **Tooling-Korrektur: Rewardful kann KEIN natives 2-Tier.** Für die
  Zwei-Ebenen-Auszahlung: **FirstPromoter** (natives 2-Tier, Stripe-Integration)
  oder PartnerStack (teurer, Netzwerk). Produktinterne Attribution beider Ebenen
  ist bereits gebaut (Admin: Ebene-1-/Ebene-2-Spalten aus der referredBy-Kette,
  kein Schema-Change nötig).

### Schicht 2 — In-Product-Referral (Kunden werben Kunden)
- Doppelseitig: **Werber + Geworbener erhalten je 1 Monat gratis** (bei Team-Plan:
  1 Monat Rabatt). Referral-Link prominent im Dashboard (Settings → "Empfehlen & sparen",
  in dieser Session als UI angelegt).
- Warum doppelseitig: einseitige Programme konvertieren messbar schlechter; der Geworbene
  braucht einen Grund, DIESEN Link zu nehmen.

### Schicht 3 — Vertikal-Partner (Implementierer, Berater, Kanzlei-IT, Fund-Ops-Berater)
- **20 % lifetime Revenue-Share** + sie behalten 100 % ihres Implementierungs-/
  Beratungshonorars. Zertifizierung ("Sigmabrain Certified Partner") nach 3 Live-Kunden.
- Das ist der eigentliche Vertikal-Hebel: Eine Fund-Ops-Beraterin mit 30 Fonds-Kunden
  ist mehr wert als 1.000 Webseiten-Besucher.

**Reihenfolge (gegen K3):** Monat 1–2 Founder-Sales → Monat 2 Rewardful + In-Product-
Referral live → Monat 3+ aktive Affiliate-Rekrutierung in der Wedge-Vertikale (VC-Newsletter,
Fund-Ops-Communities, LinkedIn-Creator) → ab Monat 4 Vertikal-Partner-Programm.

---

## 7. Produkt: Was die Web-App jetzt kann (in dieser Session umgesetzt)

- **Zweisprachig EN (Default, global) + DE** (`/` und `/de/...`), Sprachumschalter, ein
  Content-System (`src/content/site.ts`) — keine doppelte Pflege von Layouts.
- **Landing Page** neu: Outcome-Hero, ehrliche Stats (Engine-Benchmarks statt geborgter
  Brain-Statistiken), Anwendungsszenarien statt Fake-Testimonials, neues Pricing, FAQ,
  vollständiger Footer.
- **3 Vertikal-Funnels** (EN+DE): `/solutions/vc`, `/solutions/legal`, `/solutions/consulting`
  — je mit Branchen-Schmerzpunkten, Demo-Dialog, Feature-Mapping, CTA.
- **Partner-Seite** (`/partners`): alle drei Programm-Schichten mit Provisionsrechner-Logik.
- **Pricing-Seite** (`/pricing`): neue Tiers, Vergleich, FAQ.
- **Impressum & Datenschutz** als Platzhalter-Seiten (vor Launch anwaltlich prüfen!).
- **Dashboard**: Referral-Karte in Settings, Branding-Konsistenz.

**Bewusst NICHT in dieser Session (nächste Engineering-Blöcke):** Auth/Billing
(Stripe + Rewardful-Snippet), gehostetes Multi-Tenant-Provisioning, E-Mail-/Kalender-
Importer, Waitlist-Backend. Das ist die Reihenfolge im 90-Tage-Plan.

---

## 8. 90-Tage-Plan

**Tage 1–30 — Launch-fähig machen:** Domains + Trademark-Recherche; Stripe + Rewardful;
Auth + gehosteter Pro-Plan (ein Provisioning-Pfad reicht); Onboarding mit Demo-Brain;
Impressum/Datenschutz/AVV anwaltlich; Waitlist für Team/Enterprise.
**Tage 31–60 — Wedge-Vertrieb:** 50 Gespräche in der VC/PE-Vertikale (warme Intros,
LinkedIn, Communities); 10 Design-Partner zu 50 % Rabatt gegen Case Study + echtes
Testimonial (ersetzt die Szenarien-Sektion); In-Product-Referral live.
**Tage 61–90 — Verstärker zünden:** 3 echte Case Studies auf die Funnel-Pages;
Affiliate-Rekrutierung (20 gezielte Partner in der Wedge); erste Vertikal-Partner
onboarden; Pricing-Validierung (zahlt jemand 79 € ohne Rabatt? Wenn ja: halten.
Wenn alle verhandeln: Enterprise-Lastigkeit prüfen, nicht Preis senken).

**Erfolgskriterium Tag 90:** ≥ 10 zahlende Kunden, ≥ 3 davon über Empfehlung,
≥ 1 Team-Plan. Wenn das verfehlt wird, ist K1/K2/K3 nicht gelöst — dann Pre-Mortem
erneut lesen, bevor Features gebaut werden.

---

## Quellen (Markt-Recherche Juni 2026)

**Runde 2 (Legal DACH, Steuerberater, weitere Vertikale):**
- Legal-AI-Preisvergleich DE: https://www.lulius.ai/blog/legal-ai-vergleich-deutschland ·
  https://legal-tech.de/zwoelf-ki-tools-fuer-kanzleien/
- Harvey vs. Legora Marktkampf: https://www.juve.de/markt-und-management/harvey-oder-legora-der-milliardenkampf-um-den-legal-ai-markt/ ·
  https://www.handelsblatt.com/technik/ki/kuenstliche-intelligenz-ki-fuer-juristen-boomt-wie-legora-und-noxtua-davon-profitieren/100157818.html
- BStBK-FAQ "KI in der Steuerberatung" (Jan. 2026): https://www.bstbk.de/downloads/bstbk/digitalisierung/BStBK_FAQ-KI_end.pdf
- DStV-Muster-KI-Anwendungsrichtlinie: https://www.haufe.de/steuern/taxulting/muster-ki-anwendungsrichtlinie-fuer-steuerberater_598848_684194.html
- § 203 StGB + KI-Tools: https://visionarydata.de/blog/chatgpt-steuerberater-erlaubt-203-stgb
- KI-Tool-Landschaft Steuerkanzlei: https://visionarydata.de/blog/ki-tools-steuerberater-vergleich ·
  https://www.datev.de/web/de/berufsgruppenuebergreifend/ueber-datev/innovation/kuenstliche-intelligenz
- Fachkräftemangel Steuerkanzleien: https://superkind.ai/de/blog/ai-tax-advisors
- Versicherungs-Vertikale (institutional memory): https://www.wipfli.com/insights/articles/2026-insurance-industry-trends-ai-but-make-it-people-first ·
  https://www.businesswire.com/news/home/20260514273285/en/

**Runde 1:**
- Mem0 Pricing: https://mem0.ai/pricing · Supermemory: https://supermemory.ai/pricing/
- Kategorie-Vergleiche: https://dev.to/agdex_ai/ai-agent-memory-in-2026-mem0-vs-zep-vs-letta-vs-cognee-a-practical-guide-cfa · https://atlan.com/know/best-ai-agent-memory-frameworks-2026/
- Affiliate-Benchmarks: https://www.rewardful.com/articles/affiliate-commission-explained · https://www.referralcandy.com/blog/affiliate-commission-rates · https://growsurf.com/statistics/saas-referral-statistics/
- Harvey-Pricing (Legal-Preisanker): https://bindlegal.com/resources/comparisons/harvey-pricing-2026/ · https://costbench.com/software/ai-legal-tools/harvey-ai/
- Namens-Kollision: https://gamersupps.gg/products/sigma-brain-100-servings
