# KI- und Copilot-Audit mit Umbauplan

Stand: 18.09.2026. Umfang:

- die KI-Architektur (Web-Schicht und Engine)
- der Copilot
- der Arbeitsalltag in der Kanzlei mit Akten und Dokumenten
- Barrierefreiheit
- Regulierung (AI Act, ÖRAK, DSGVO)
- Wettbewerb

Die Code-Befunde haben Datei:Zeile-Belege. Die sicherheitsrelevanten davon habe ich einzeln am Code nachgeprüft (markiert mit ✔). Was nur erschlossen und nicht zur Laufzeit beobachtet ist, steht als „(vermutet)“ da. Die Markt- und Rechtsaussagen stammen aus Webrecherche vom 18.09.2026, die Quellen stehen in Abschnitt 8.

---

## 1. Gesamturteil

**Das Fundament ist richtig, aber drei Versprechen sind im Code noch nicht eingelöst.**

| Dimension                                                   | Urteil                | Kern                                                                                                                                                                                       |
| ----------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Produktthese (Akte + Fristen + Korpus + KI in einem System) | stark                 | In Österreich hat das niemand. Die Wettbewerber sind entweder Recherche-Werkzeuge (AI:ssociate, MANZ-Noxtua, Lexis Protégé, LinDa) oder dünne GPT-Hüllen in der Kanzleisoftware (ADVOKAT). |
| Technisches Rückgrat                                        | gut                   | Ein einziges physisches Gateway zur Engine, Zitate werden gegen echten Normtext geprüft, Rechtsordnung fail-closed, `createEngineProxy` als richtige Abstraktion                           |
| Vertrauensversprechen (EU-Hosting, Aktenumfang, Freigaben)  | **nicht eingelöst**   | siehe P0-1 bis P0-3                                                                                                                                                                        |
| Arbeitsfluss für Anwält:innen                               | fragmentiert          | rund 24 KI-Flächen, 3 getrennte Chats, kein Dokument-Loop, Antworten lassen sich nicht in die Akte zurückschreiben                                                                         |
| Qualität der Belege                                         | Mittelfeld            | Es wird nur geprüft, ob eine Norm existiert, nicht ob sie die Aussage trägt. Die Prüfung läuft nachträglich und blockiert nichts.                                                          |
| Barrierefreiheit                                            | über dem Durchschnitt | gute Basis, konkrete Lücken im Chat selbst                                                                                                                                                 |
| AI-Act- und ÖRAK-Konformität                                | teilweise             | Kennzeichnung vorhanden, aber falscher Artikel; maschinenlesbare Markierung fehlt; ÖRAK-Checkliste derzeit nicht unterschreibbar                                                           |

**Kurz gesagt:** Wir haben mehr KI-Funktionen als alle österreichischen Wettbewerber. Sie hängen aber nicht als _ein_ Arbeitsweg zusammen, und drei Sicherheitszusagen, die jede Kanzlei vor Vertragsschluss prüfen wird, stimmen mit dem Code nicht überein. Ein Totalumbau ist nicht nötig. Nötig sind eine Pflicht-Pforte für jeden KI-Aufruf, ein Assistent statt vieler und ein geschlossener Dokument-Loop.

---

## 2. P0: Befunde, die vor dem Pilot mit echten Mandatsdaten behoben sein müssen

### P0-1 Die EU-Datenresidenz wird nicht durchgesetzt ✔

- Produktion läuft mit `SUBSUMIO_AI_PROVIDER=openrouter` (`server/deploy/hetzner/.env.example:95`). Daraus ergeben sich diese Modellstufen (`server/src/core/model-config.ts:123-128`):

  | Stufe     | Modell                   |
  | --------- | ------------------------ |
  | utility   | `deepseek/deepseek-chat` |
  | reasoning | Claude Sonnet 4.6        |
  | deep      | `x-ai/grok-4.3`          |

- Alle `engineComplete`-Aufrufer nutzen die Stufe `utility`. Damit gehen folgende Inhalte standardmäßig an DeepSeek, sofern keine Engine-Überschreibung pro Zweck existiert (nicht geprüft):
  - E-Mail-Antwortentwürfe
  - Fristextraktion
  - WhatsApp-Intent
  - Copilot-Memory
  - das Briefing
- `src/lib/model-provider-policy.ts` („called before every AI API call“) hat **keinen einzigen Importeur außerhalb der Tests** ✔.
- Die Organisationseinstellung `eu_only` filtert nur ein Dropdown.
- Die Modellauswahl im Chat ignoriert die Engine: Der `runThink`-Aufruf in `server/src/commands/web-api.ts:3309` liest `body.model` nicht.
- Das Marketing sagt „EU-gehostet“ (`src/content/city-pages.ts:29`, `site.ts:776`).

**Warum P0:** Der ÖRAK-Leitfaden (Sept. 2025) verlangt für KI-Anbieter und **jeden Sub-KI-Anbieter** Folgendes:

- eine Vereinbarung nach § 40 Abs 3 RL-BA
- ein Trainingsverbot
- Server in der EU oder einem Angemessenheitsstaat
- die Meldung bei Hausdurchsuchungen

Mit dem heutigen Routing können wir die ÖRAK-Checkliste nicht wahrheitsgemäß unterschreiben. Das ist Berufsrecht (§ 9 RAO) und zugleich ein Vertriebsblocker.

### P0-2 Aktenumfang und Chinese Walls greifen für Web-Nutzer nicht ✔

- Die Engine setzt `matterScope = "all"`, sobald kein Identitäts-Token mitkommt (`server/src/commands/web-api.ts:1520-1530`).
- Das signierte Token schickt nur der WhatsApp-Pfad (`src/lib/engine.ts:317-332`). Die Dashboard-Header enthalten nur Quelle, API-Key und Rechtsordnung (`engine.ts:181-189`).
- Die Chinese-Wall-Prüfung sitzt nur in `matter-context.ts`, nicht in `/api/think` und nicht in `/api/copilot/*` ✔.
- `case_slug` grenzt die Suche ein, prüft aber keine Berechtigung.
- **Folge (vermutet):**
  - Wer hinter einer Chinese Wall sitzt, kann eine gesperrte Akte über Chat oder Copilot trotzdem abfragen.
  - Die kanzleiweite Chat-Suche durchsucht alle Akten.

Harvey synchronisiert Ethical Walls aus Intapp. Für Kanzleien ist das Pflicht, kein Extra.

### P0-3 KI-Schreibaktionen ohne serverseitige Freigabe, dazu ein Injektionspfad ✔

- `POST /api/copilot/tools` führt `send_email` sofort aus (`src/app/api/copilot/tools/route.ts:1449-1475`). Dasselbe gilt für `create_case`, `deadline_mark_done` und andere. Die Freigabe ist nur ein UI-Dialog im Client (`chat-types.ts:66-73`).
- Das vorhandene Vier-Augen-System (`approval.ts`, `approval-execution.ts`) ist nicht angeschlossen.
- Werkzeuge werden per Regex aus dem Freitext des Modells gelesen (`chat-panel.tsx:127-415`), nicht über natives Tool-Use.
- Der Parser akzeptiert `[TOOL:send_email …]` (`chat-panel.tsx:182-190`), obwohl der System-Prompt das Werkzeug gar nicht anbietet.
- Im Engine-Prompt werden nur `<take>` und die Nutzerfrage ausdrücklich als Daten markiert. **Abgerufene `<pages>` (Dokumentinhalte) nicht** (`server/src/core/think/prompt.ts:61-70`) ✔.
- **Kette:** Ein präpariertes Dokument im Posteingang kann die Modellantwort so steuern, dass eine Werkzeugmarke erscheint. Nicht-destruktive Werkzeuge laufen dann sofort. Bei `send_email` hängt es nur noch am Client-Dialog, und der zeigt die Parameter abgeschnitten an (`tool-call-bubble.tsx:163`).

### P0-4 KI-Funktionen, die ins Leere rufen ✔

Diese Endpunkte existieren in `server/src` nicht:

| Endpunkt                      | Betroffene Funktion                                                               |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `/api/chat`                   | Mandantenportal-Chat, Review-Table „Fragen“ (fallen still auf Platzhalter zurück) |
| `/api/legal/schriftsatz`      | **Entwurfsschritt des Berufungs-Agenten**                                         |
| `/api/legal/fristenreport`    | Fristenreport                                                                     |
| `/api/legal/trigger-pipeline` | Autonomous-Cron                                                                   |

Außerdem rufen `copilot/plan` und `copilot/draft-review` serverseitig den Browser-Client `api.query.think` auf (`src/lib/planning-session.ts:97,308`). Vermutlich fehlt dabei der Quell-Header, und die Aufrufe laufen fail-closed ins Leere. `planning-mode-panel` hat zudem keinen Importeur.

**Maßnahme:** Jede dieser Funktionen entweder anschließen oder ausblenden. Ein Pilot darf auf keine stillen Platzhalterantworten stoßen.

---

## 3. P1: Architektur

1. **Rund 45 KI-Einstiege in sechs Stilen.** Es gibt 11 Routen mit handgeschriebenem `fetch(ENGINE_URL/api/think)`, 19 über `createEngineProxy`, 6 über `engineComplete` und dazu Agenten-Supervisor-Aufrufe. Bereinigung, Credits, Rechtsordnung, Grounding und Audit sind deshalb pro Route verschieden. Beispiele:
   - `legal/subsumption` läuft mit `mode: "tokenmax"` ohne Credits.
   - `agents` nimmt per `.passthrough()` `supervisor_model`, `skip_critic` und Budget vom Nutzer an.
2. **Grounding prüft nur Existenz und läuft nachträglich.**
   - `verified: sourceText !== null` (`legal-grounding.ts:529`) prüft nur, ob eine Norm existiert.
   - Geprüft werden nur die ersten 20 Zitate.
   - Das Stream-Gate annotiert nur und übergibt keine Rechtsordnung (`citation-gate.ts:205`).
   - `useGroundedAnswer` übergibt ebenfalls keine.
   - Im Chat wird doppelt gegroundet.
   - Die Stanford-Studie (JELS 2025) wertet „misgrounded“, also eine echte Quelle, die die Aussage nicht trägt, als schwersten Fehler. Genau den erkennen wir nicht.
3. **Die Grounding-Invariante aus CLAUDE.md ist verletzt** (ohne Hook, ohne Panel):
   - `translate`, `case-scanner`, `vault`
   - `cases/[slug]/investigation` (Liste)
   - der KI-Antwortentwurf in `emails-tab.tsx:159-164`
   - `draft-review-panel`, `DraftEditor`
   - `review-inbox-tab.tsx:286`, `MatterReviewInbox.tsx:237`
   - `contracts/page.tsx:836` (Panel ohne `grounding`)

   Es gibt keinen CI-Guard, der das erzwingt; der vorhandene Test prüft nur den Chat.

4. **Die Rechtsordnung ist im Chat hart auf AT gesetzt:** `setJurisdiction(fm.jurisdiction === "eu" ? "eu" : "at")` ✔ (`chat-panel.tsx:840, 2130`).
   - DE- und CH-Akten bekommen die österreichische Prompt-Policy.
   - Die Copilot-Werkzeuge kennen nur `at|all`.
   - `case-strategy` schickt keine Rechtsordnung der Akte mit.
   - Für den AT-Start ist das tragbar. Für den DE/CH-Ausbau ist es ein Fehler.
5. **Der Kontext ist zu klein geschnitten.**
   - Die Aktenliste im Chat ist auf 100 begrenzt (`chat-panel.tsx:826`).
   - `case-strategy` filtert aus einem einzigen kanzleiweiten Abruf mit `limit=200` (`case-strategy/route.ts:89-110`). Bei großen Kanzleien fehlen die eigenen Aktendokumente still (vermutet).
   - Dasselbe Muster wie im Gedächtnis-Eintrag zum Engine-Listenlimit.
6. **Der KI-Audit-Trail ist dünn.**
   - Pro Aufruf werden weder Modell noch Prompt-Hash, Quellen oder Output-Hash festgehalten.
   - `logTraceAudit` und `logInjectionAudit` haben keine Aufrufer.
   - `X-AI-Generated` wird nur bei Streams gesetzt, nicht bei JSON-Antworten.
   - Versicherer verlangen inzwischen nachweisbare KI-Governance.
7. **Der System-Prompt entsteht im Client** und geht als `instructions` (bis 40k Zeichen) mit. Persona und Leitplanken sind damit vom Nutzer steuerbar.
8. **Der Prompt-Sanitizer verstümmelt Fachtext.** `/system\s*:\s*/` hat keine Wortgrenze, deshalb wird „Betriebssystem:“ verändert (`prompt-sanitizer.ts`).
9. **Upstream-Reste im Engine-Prompt:** „gbrain's synthesis engine“ und das Beispiel „garry has a hunch“ (`server/src/core/think/prompt.ts:61,77`). Das kostet Kontext und passt nicht zur Kanzlei-Persona.

**Positiv (in Arbeit, nicht committet):** Die RIS-Verlinkung (`src/lib/ris-url.ts`, AT-Normdateien, Fassungswahl „in Kraft“, host-gepinnte URLs) ist sorgfältig und zielt genau auf die größte Schwäche aller Wettbewerber, nämlich lokales und zeitlich richtiges Recht. Beim Fertigstellen sollte die Rechtsordnung auch durch Stream-Gate und `useGroundedAnswer` durchgereicht werden.

---

## 4. Arbeitsweg im Kanzleialltag (UX)

### 4.1 Was eine Anwältin heute erlebt

- **Drei Chats auf einem Bildschirm:**
  - der globale Copilot (`dashboard/layout.tsx:789`)
  - der Dokument-Chat (`brain/[slug]/page.tsx:541`)
  - das „Akte fragen“-Feld im Strategie-Tab (`strategy-tab.tsx:780-850`, verwirft Zitate und Verlauf, `matter-detail-context.tsx:1311-1315`)
- **Rund 24 KI-Seiten nach Werkzeug statt nach Aufgabe:**
  - Deep-Analysis und Übersetzen liegen im Admin-Bereich.
  - Tabular Review und Case-Scanner fehlen in der Navigation.
  - Die Sidebar verlinkt 87 Dashboard-Ziele.
- **Der Copilot sieht das offene Dokument nicht:** `pageSlug: undefined` ✔ (`copilot-sidebar.tsx:704`).
  - PDFs werden in einem rohen `<iframe>` angezeigt.
  - Markieren und fragen geht nicht (kein `getSelection` im Code ✔).
  - Zitate springen nicht zur Fundstelle. `quote` und `chunk_index` liegen vor, werden aber nicht übergeben (`chat-message.tsx:204`).
- **Antworten lassen sich nicht in die Akte zurückschreiben.** Es gibt kein „In Akte speichern“, „Frist anlegen“, „Aufgabe anlegen“ oder „In Entwurf übernehmen“ an der Nachricht. Übrig bleiben Kopieren und Einfügen.
- **Der Chat-Verlauf liegt nur im Browser** (IndexedDB ✔).
  - Er ist nicht geräteübergreifend und nicht für Kolleg:innen sichtbar.
  - Er ist nicht auditierbar.
  - Ab 100 Sitzungen wird er still gekürzt.
- **Kontextverlust bei Übergaben:** Die Befehlspalette und der Upload springen in den Chat, ohne Akte oder Dokument mitzugeben.
- **Die Word-Erweiterung ist nicht auslieferbar.**
  - Das Manifest zeigt auf `https://subsum.io/word-addin/taskpane.html`, aber es gibt weder `public/word-addin` noch eine Route ✔.
  - Das API-Token muss man von Hand einfügen.
  - Redlines landen als Text statt als Änderungsverfolgung.
  - Beim Outlook-Add-in dasselbe Bild.
- **Diktat ist ein Formular mit einer Dauer-Eingabe, keine Aufnahme** ✔.
  - Die Spracheingabe nutzt die Web Speech API. In Chrome geht das Audio an Google-Server, was für Mandatsinhalte ein Verschwiegenheitsproblem ist.
  - `engineTranscribe` für serverseitige Transkription existiert bereits.

### 4.2 Was der Markt 2026 als Referenz etabliert hat

Harvey, Legora, CoCounsel und Lexis Protégé sind strukturell fast identisch geworden:

1. **Ein Assistent**, der bei mehrstufigen Aufgaben **zuerst seinen Plan zeigt** und korrigieren lässt. Lange Aufgaben laufen im Hintergrund und melden sich zur Prüfung.
2. **Die Akte bzw. der Arbeitsraum ist die Kontexteinheit**: Dokumente, Rechte, Chinese Walls, Aktivitäts-Log.
3. **Tabular Review als zweiter Kernbildschirm**: Dokumente × Fragen, jede Zelle belegt, Zellen sperren oder als geprüft markieren.
4. **Workflows und Playbooks**, die die Kanzlei selbst definiert.
5. **Word und Outlook** als Arbeitsort, mit Änderungsverfolgung, Diktat und Ablage zurück in die Akte.
6. **Verifikation als eigener Schritt**: Trägt die Quelle die Aussage? Die Belegstelle klappt direkt unter der Aussage auf.
7. **Admin-Schicht**: Nutzungsmetriken, Playbook-Governance, EU-Instanz.

In Österreich (Stand Sept. 2026):

- AI:ssociate hat Recherche, Analyse, Entwurf sowie Word und Outlook für 39–99 €, mit sehr knappen Entwurfskontingenten.
- BEAMON (Bryter) ist Word-first und seit März 2026 ÖRAK-Partner.
- MANZ-Noxtua (Juni 2026) bietet Kommentare, Matrix-Analysen und Workflows.
- Lexis Protégé AT (17.09.2026) arbeitet agentisch und zeigt den Plan zuerst.
- ADVOKAT hat einen GPT-Assistenten in der Kanzleisoftware.

**Keiner verbindet Akte, Fristen, Korrespondenz und belegte KI.** Das ist unsere Lücke. Sie hält aber nur, wenn unser Arbeitsweg _ein_ Weg ist.

### 4.3 Barrierefreiheit (WCAG 2.2 AA / EN 301 549 V4.1.1)

**Gut:**

- `lang="de-AT"`, Skip-Link, Fokus bei Routenwechsel
- globales `:focus-visible`, reduzierte Bewegung
- AA-Kontraste in beiden Themes
- Befehlspalette als Combobox
- abschaltbare Einzeltasten-Shortcuts (SC 2.1.4)
- Chat-Log als `role="log" aria-live="polite" aria-busy`
- Fokusfalle im Copilot
- axe-Tests auf rund 50 Routen

**Lücken:**

| Problem                                                                              | Beleg                                                                         | WCAG          |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ------------- |
| Nachrichtenaktionen nur bei Hover sichtbar; auf Touch-Geräten nie                    | `chat-message.tsx:266` ✔                                                      | 2.4.7, 2.4.11 |
| Icon-Buttons ohne Namen, ca. 16 px                                                   | `copilot-explanation-panel.tsx:140-145`, `draft-review-panel.tsx:229,254,279` | 4.1.2, 2.5.8  |
| AI-Act-Badge und „Anwaltlich zu prüfen“-Erklärung nur per Tooltip bzw. `title`       | `CitationPanel.tsx:95-104,139-146`                                            | 1.3.1, 2.1.1  |
| Fehlendes `aria-expanded`                                                            | Vorlagenmenü, Dokument-Chat                                                   | 4.1.2         |
| Fehlendes `aria-current`                                                             | Akten-Tabs                                                                    | 4.1.2         |
| Seitenwechsel-Ansage aus dem URL-Slug und `assertive` („Kollisionspruefung geladen“) | `layout.tsx:338-340`                                                          | 4.1.3         |
| Chat-Textfeld mit `focus:outline-none`                                               | `chat-input.tsx:227`                                                          | 2.4.11        |
| Shortcuts kollidieren mit Browser-Kürzeln (Strg+Umschalt+C/N, Cmd+Umschalt+A)        | –                                                                             | 2.1.4         |
| Keine a11y-Tests für offenen Copilot, Streaming und Freigabekarten                   | –                                                                             | –             |

Rechtlich gilt BaFG/EAA für reine B2B-Software in der Regel nicht. Für das **Mandantenportal** (Verbraucher) kann es aber greifen. Öffentliche Auftraggeber verlangen EN 301 549. Deshalb sollte WCAG 2.2 AA die Zielnorm sein.

### 4.4 Vertrauens-UX

**Stark:** Das `CitationPanel` zeigt verifizierte und unverifizierte Normen, dazu „Nicht im Corpus gefunden — möglicherweise erfunden“ und „Anwaltlich zu prüfen“ standardmäßig. Die KI-Kennzeichnung kommt aus einer einzigen Konstante (`ai-act.ts`). Der Drafting-Loop funktioniert: generieren, bearbeiten, in der Akte speichern (mit KI-Frontmatter), als DOCX exportieren.

**Schwach:**

- **Falscher Artikel an fünf Stellen:** „Art. 52“ statt Art. 50 ✔. Betroffen sind `AIActConformityBanner.tsx:19`, `compliance/ai-act/page.tsx:64` und `content/dashboard.ts:7419,7490-7491`.
- Die Compliance-Seite behauptet eine Kennzeichnung „in allen Legal-AI-Outputs“, die es nicht gibt.
- Feedback-Daumen sind nirgends verdrahtet, weil kein Aufrufer `onFeedback` übergibt.
- Freigabekarten kann man nicht bearbeiten, und nach einer Werkzeugaktion gibt es kein Rückgängig.
- Modellname, Token und Latenz werden Anwält:innen standardmäßig angezeigt. Das ist Rauschen statt Vertrauenssignal.

---

## 5. Regulatorischer Rahmen: was das Produkt bis wann können muss

| Pflicht                                                                                                    | Frist                                                                     | Quelle                                                        | Stand bei uns                                                |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------ |
| KI-Kennzeichnung am Kontaktpunkt (Chatbot)                                                                 | gilt seit 02.08.2026                                                      | AI Act Art. 50(1)                                             | vorhanden, aber falscher Artikel und Lücken auf 10 Flächen   |
| Maschinenlesbare Markierung KI-generierter Texte (Entwürfe, Zusammenfassungen)                             | **02.12.2026** für Bestandssysteme                                        | Art. 50(2), Omnibus VO 2026/1744, Code of Practice 10.06.2026 | fehlt (DOCX/PDF-Metadaten, JSON-Header)                      |
| Hochrisiko                                                                                                 | 02.12.2027, betrifft uns nur bei Verkauf an Gerichte oder Schiedsgerichte | Annex III 8(a), BRAK-Leitfaden                                | Zweckbestimmung „für Anwält:innen“ dokumentieren             |
| KI-Kompetenz fördern                                                                                       | laufend                                                                   | Art. 4 (durch Omnibus abgeschwächt), ÖRAK                     | In-Produkt-Hinweise und Schulungsnachweis fehlen             |
| Ausnahmslose Prüfung aller KI-Outputs, Letztverantwortung bei der Anwältin                                 | laufend                                                                   | ÖRAK, SAV, CCBE, BRAK                                         | Badge vorhanden; Export-Gate für unverifizierte Zitate fehlt |
| KI-Anbieter und Sub-Anbieter: § 40 Abs 3 RL-BA, AVV, Trainingsverbot, EU-Server, Hausdurchsuchungs-Meldung | vor Vertragsschluss                                                       | ÖRAK-Checkliste                                               | **nicht unterschreibbar** (P0-1)                             |
| DE: § 43e BRAO, § 203 StGB; CH: Hilfsperson nach Art. 321 StGB                                             | für DE/CH-Ausbau                                                          | BRAK, SAV                                                     | offen                                                        |

Präzedenzfall AT: Der OGH hat am 07.10.2025 (14 Os 95/25i) eine KI-erstellte Nichtigkeitsbeschwerde mit erfundenen Entscheidungen nicht inhaltlich behandelt. Das Rechtsmittel war damit für den Mandanten verloren. DE: AG Köln 312 F 130/25, OLG Celle 5 U 1/25. Dazu kommt Betreiberhaftung für Halluzinationen (OLG Hamm 4 UKl 3/25). **Jedes Zitat, das unsere Oberfläche verlässt, ist ein Haftungsthema.**

---

## 6. Zielbild: ein Assistent, drei Kontexte, eine Pforte

```
                    ┌──────────────────────────────────────────┐
  Oberfläche        │  EIN Assistent (Copilot)                 │
                    │  Kontext: Kanzlei · Akte · Dokument/Stelle│
                    │  /frist /entwurf /prüfen /tabelle /recht  │
                    └───────┬───────────────┬──────────────────┘
                            │               │ Ergebnis-Aktionen:
  Fachflächen werden        │               │ In Akte · Frist · Aufgabe
  zu „Skills“, die der      │               │ · In Entwurf · an Word
  Assistent startet         ▼               ▼
                    ┌──────────────────────────────────────────┐
  Pflicht-Pforte    │  aiGateway (Web, ersetzt 6 Stile)        │
  (jeder KI-Aufruf) │  Identitäts-Token (Akte, Rolle, Wall)    │
                    │  Rechtsordnung der Akte · Sanitizer      │
                    │  Provider-Policy EU · Credits · Audit     │
                    │  (Modell, Prompt-Hash, Quellen, Output-   │
                    │  Hash) · KI-Kennzeichnung · Grounding     │
                    └───────┬──────────────────────────────────┘
                            ▼
                    ┌──────────────────────────────────────────┐
  Engine            │  natives Tool-Use-Loop, Plan zuerst       │
                    │  Schreib-Tools nur mit Freigabe-Token     │
                    │  abgerufene Seiten als DATEN markiert     │
                    │  matterScope/ACL fail-closed              │
                    │  Modelle nur EU (Bedrock EU / Mistral)    │
                    └──────────────────────────────────────────┘
```

Die Leitsätze:

1. **Die Akte ist das Zuhause.** Jede KI-Aktion startet aus Akte, Dokument oder Textstelle und schreibt ihr Ergebnis dorthin zurück. Der Kanzlei-Kontext ist die Ausnahme.
2. **Ein Assistent, viele Skills.** Die heutigen Einzelseiten (Subsumtion, Red-Team, Berufungsgründe, Case-Scanner, Übersetzen, Deep-Analysis …) bleiben als Fähigkeiten erhalten. Man erreicht sie aber aus dem Assistenten und aus der Akte, nicht als 24 Menüpunkte.
3. **Der Agent schlägt vor, die Anwältin entscheidet.** Pläne sind sichtbar und editierbar. Jede Schreib- oder Sendeaktion braucht ein serverseitiges Freigabe-Token. Die Freigabe zeigt den vollständigen, bearbeitbaren Inhalt.
4. **Verifikation vor Export, nicht vor Anzeige.** Der Chat zeigt Zitate sofort und markiert sie. Export, Versand und Word-Übernahme sind aber gesperrt, solange unverifizierte Zitate nicht ausdrücklich freigegeben wurden. Das wird mit Name und Zeitpunkt protokolliert.
5. **Eine Pforte, kein Stilmix.** Kein KI-Aufruf ohne `aiGateway`. Ein Lint- oder CI-Guard verbietet `fetch(ENGINE_URL + "/api/think")` außerhalb der Pforte, so wie der bestehende JSONB-Guard.

---

## 7. Umbauplan

Größen: S ≤ 2 Tage, M ≤ 1 Woche, L ≤ 3 Wochen (eine Person).

### Welle A: Vertrauen herstellen (vor Pilot mit echten Mandatsdaten, ca. 2 Wochen)

| #   | Maßnahme                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Größe          | Abnahme                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------- |
| A1a | **Erledigt 18.09., kostenbewusst korrigiert:** utility und subagent → Claude Haiku 4.5, reasoning (normale Rechtsfragen, Zitat-Gegenprüfung) → Claude Sonnet 5, deep (nur als komplex erkannte Fragen und die drei Deep-Spezialisten) → Claude Opus 5. Fable 5.1 nur auf ausdrücklichen Wunsch (`models.purpose.*`). Die Zitat-Gegenprüfung lief bisher bei jeder Antwort auf der teuren deep-Stufe und liegt jetzt auf reasoning. DeepSeek und Grok sind raus. Mindest-Ausgabelimit für denkende Modelle (`effectiveMaxOutputTokens`). | S              | Tests grün; Prod-Config `models.tier.*` darf die Defaults nicht überschreiben |
| A1  | (später, mit Datenschutz-Entscheidung) Modellrouting nur EU: Utility/Deep weg von DeepSeek/Grok; Claude über EU-Region (Bedrock Frankfurt) oder Mistral; OpenRouter nur mit erzwungener EU-/ZDR-Provider-Liste, falls das vertraglich belegbar ist. `enforceProviderPolicy` in der Engine am `runThink`/`complete`-Eingang erzwingen, fail-closed.                                                                                                                                                                                      | M              | Test: jeder Tier-Default ∈ Allowlist; Prod-Log zeigt nur EU-Endpunkte         |
| A2  | ÖRAK-Paket: Checkliste, § 40 Abs 3 RL-BA-Vereinbarung, AVV, Sub-Auftragsverarbeiter-Liste, Trainingsverbot/ZDR schriftlich von jedem LLM-Anbieter                                                                                                                                                                                                                                                                                                                                                                                       | S (+ Verträge) | unterschriebene Checkliste im Vertriebsordner                                 |
| A3  | Identitäts-Token für **alle** Web→Engine-Aufrufe (heute nur WhatsApp); Chinese Walls in der Engine fail-closed; `case_slug` wird autorisiert, nicht nur gefiltert                                                                                                                                                                                                                                                                                                                                                                       | M              | E2E: gesperrte Nutzerin bekommt 403 auf Chat mit gesperrter Akte              |
| A4  | Copilot-Schreibwerkzeuge über `approval.ts`: Server verlangt ein Freigabe-Token; `send_email` aus dem Parser entfernen, solange es nicht angeboten wird; abgerufene `<pages>` im Engine-Prompt als DATEN markieren                                                                                                                                                                                                                                                                                                                      | M              | Test: POST ohne Token → 403; Injektions-Fixture löst keine Aktion aus         |
| A5  | Tote KI-Funktionen anschließen oder ausblenden: Schriftsatz (Berufungs-Agent), Portal-Chat, Review-Table-Fragen, Fristenreport, Copilot-Plan/Draft-Review                                                                                                                                                                                                                                                                                                                                                                               | S–M            | keine Route ruft einen nicht existierenden Engine-Endpunkt (Skript-Guard)     |
| A6  | Art. 52 → Art. 50 an allen Stellen; Compliance-Seite auf den echten Stand bringen                                                                                                                                                                                                                                                                                                                                                                                                                                                       | S              | grep „Art. 52“ = 0                                                            |
| A7  | Marketing „EU-gehostet“ erst nach A1 stehen lassen, sonst vorübergehend präzisieren                                                                                                                                                                                                                                                                                                                                                                                                                                                     | S              | –                                                                             |

### Welle B: Ein Arbeitsweg (Pilotphase, ca. 4–5 Wochen)

| #   | Maßnahme                                                                                                                                                                                                                                                                                                                             | Größe |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| B1  | `aiGateway` als Pflicht-Pforte (Weiterentwicklung von `createEngineProxy`): Rechtsordnung der Akte, Sanitizer (mit Wortgrenzen-Fix), Credits, Audit mit Modell/Prompt-Hash/Quellen/Output-Hash, `X-AI-Generated` auch bei JSON; alle ~45 Einstiege migrieren; CI-Guard                                                               | L     |
| B2  | Grounding-Invariante flächendeckend (10 Verstöße aus §3.3) plus CI-Guard, der jede Komponente mit `api.legal.*`/`api.query.think` auf `useGroundedAnswer` + `CitationPanel` prüft; Rechtsordnung in Stream-Gate und Hook; doppeltes Grounding im Chat entfernen; RIS-Arbeit fertigstellen                                            | M     |
| B3  | Maschinenlesbare KI-Markierung in DOCX/PDF-Export und gespeicherten Entwürfen (Frist 02.12.2026)                                                                                                                                                                                                                                     | S     |
| B4  | Chat-Verlauf serverseitig pro Akte (auditierbar, mit Kolleg:innen teilbar, kein stilles Kürzen); IndexedDB nur als Cache                                                                                                                                                                                                             | M     |
| B5  | Ergebnis-Aktionen an jeder Antwort: In Akte speichern · Frist anlegen · Aufgabe · In Entwurf übernehmen; Freigabekarten mit vollem, editierbarem Inhalt                                                                                                                                                                              | M     |
| B6  | Dokument-Loop: PDF.js-Viewer statt iframe; markieren → fragen; Copilot erhält `pageSlug` und Auswahl; Zitate springen zur Fundstelle (`quote`/`chunk_index` durchreichen); Dokument-Chat und Strategie-„Akte fragen“ im Copilot aufgehen lassen                                                                                      | L     |
| B7  | Kontext-Übergaben reparieren: Befehlspalette und Upload geben Akte/Dokument mit; Aktenliste im Chat paginiert statt 100; `case-strategy` fragt aktenbezogen statt kanzleiweit mit 200                                                                                                                                                | S     |
| B8  | Barrierefreiheit im Chat: Aktionen bei `focus-within` sichtbar und auf Touch immer; Namen und 24 px für Icon-Buttons; Tooltips fokussierbar; `aria-expanded`/`aria-current`; Seitenansage aus Titel und polite; sichtbarer Fokus im Textfeld; Shortcut-Kollisionen weg; Playwright+axe für offenen Copilot, Streaming, Freigabekarte | M     |
| B9  | Navigation nach Aufgaben: Recherche · Entwerfen · Prüfen · Analysieren · Fristen · Kommunikation; Tabular Review in die Navigation; Deep-Analysis/Übersetzen aus dem Admin-Bereich; Modell/Token-Anzeige standardmäßig aus                                                                                                           | M     |
| B10 | Feedback-Daumen an jeder KI-Antwort verdrahten (fließt in Eval und Retrieval-Feedback)                                                                                                                                                                                                                                               | S     |
| B11 | System-Prompt serverseitig bauen (Client schickt nur Kontext-IDs, keine `instructions`); Engine-Prompt von Upstream-Resten („gbrain“, „garry has a hunch“) befreien und auf Kanzlei-Persona zuschneiden                                                                                                                              | M     |
| B12 | Rechtsordnung aus der Akte übernehmen statt AT zu erzwingen (`chat-panel.tsx:840,2130`); Werkzeug-Schemas `at\|de\|ch\|eu`; `case-strategy` mit Aktenrechtsordnung                                                                                                                                                                   | S     |
| B13 | Rückgängig für Werkzeugaktionen (Frist erledigt, Akte angelegt, Aufgabe) innerhalb eines Zeitfensters; E-Mails erst nach Freigabe mit Sende-Verzögerung                                                                                                                                                                              | M     |

### Welle C: Agent und Arbeitsorte (nach dem Pilot, ca. 6–8 Wochen)

| #   | Maßnahme                                                                                                                                                                                                                                                                            | Größe |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| C1  | Natives Tool-Use in der Engine statt Regex-Marken; Ergebnisse gehen zurück ans Modell (echter Loop); **Plan zuerst** bei mehrstufigen Aufgaben; Hintergrundjobs mit Benachrichtigung „bereit zur Prüfung“; Supervisor-Jobs mit matterScope/Rechtsordnung/ACL, ohne `.passthrough()` | L     |
| C2  | Grounding v2: Prüfung Aussage ↔ Belegstelle (trägt die Quelle die Aussage?), Fassung und Stichtag je Norm („i.d.F. BGBl …“), Warnung bei zwischenzeitlicher Novelle, Gegenposition anzeigen (gegen Anbiederung, CCBE); Export-Gate mit Freigabe-Protokoll                           | L     |
| C3  | Word-Add-in produktiv: gehostet, SSO statt Token, Redlines als Änderungsverfolgung, Klauseln aus der Akte, Ablage zurück in die Akte mit Version; danach Outlook (Triage, aktenbezogene Antwort, Ablage)                                                                            | L     |
| C4  | Diktat echt: Aufnahme → `engineTranscribe` auf EU-Modell → Akte; Web Speech API für Mandatsinhalte abschalten                                                                                                                                                                       | M     |
| C5  | Tabular Review als Kernfläche: Zellen belegt, Zellen sperren/als geprüft markieren, Referenzdokument je Spalte, Export                                                                                                                                                              | M     |
| C6  | KI-Kompetenz im Produkt: kurze Einführung zu Grenzen und Prüfpflicht, abrufbar als Schulungsnachweis für die Kanzlei (Art. 4, ÖRAK)                                                                                                                                                 | S     |

### Welle D: Vorsprung ausbauen

- **Öffentliches AT-Benchmark** zu Zitatgenauigkeit und Fassungstreue. Kein österreichischer Anbieter veröffentlicht Zahlen. Laut Legal-Tech-Barometer 2026 korrigieren 70 % der Anwält:innen KI-Output regelmäßig.
- **Kanzleiwissen als Differenzierung:** „unsere früheren Schriftsätze zu § 1295 ABGB“. Kommentar-Literatur haben die Verlage, das Kanzleiwissen haben nur wir.
- DE/CH-Rechtsordnung sauber durchziehen (Zeitpunkt nach dem AT-Start).
- Workflows und Playbooks, die die Kanzlei selbst baut.

### Abdeckung: jeder Befund hat eine Maßnahme

| Befund                                                        | Maßnahme   |
| ------------------------------------------------------------- | ---------- |
| P0-1 EU-Routing / Provider-Policy / Modellwahl ignoriert      | A1, A2, A7 |
| P0-2 Aktenumfang / Chinese Walls                              | A3         |
| P0-3 Schreibaktionen ohne Server-Freigabe, Injektionspfad     | A4, C1     |
| P0-4 tote Engine-Endpunkte                                    | A5         |
| §3.1 ~45 Einstiege, Kosten ohne Credits, `.passthrough()`     | B1, C1     |
| §3.2 Grounding nur Existenz, nachträglich, ohne Rechtsordnung | B2, C2     |
| §3.3 Grounding-Invariante verletzt (10 Flächen)               | B2         |
| §3.4 Rechtsordnung hart AT                                    | B12        |
| §3.5 Kontext abgeschnitten (100/200-Limits)                   | B7         |
| §3.6 Audit-Trail dünn, `X-AI-Generated` nur bei Streams       | B1, B3     |
| §3.7 System-Prompt aus dem Client                             | B11        |
| §3.8 Sanitizer verstümmelt Fachtext                           | B1         |
| §3.9 Upstream-Reste im Engine-Prompt                          | B11        |
| §4.1 drei Chats, 24 KI-Seiten, Navigation                     | B6, B9     |
| §4.1 kein Dokument-Loop, Zitate ohne Fundstelle               | B6         |
| §4.1 keine Übernahme in die Akte                              | B5         |
| §4.1 Verlauf nur im Browser                                   | B4         |
| §4.1 Kontextverlust bei Übergaben                             | B7         |
| §4.1 Word/Outlook nicht auslieferbar                          | C3         |
| §4.1 Diktat-Stub, Web Speech an Google                        | C4         |
| §4.3 Barrierefreiheit im Chat                                 | B8         |
| §4.4 Art. 52, Compliance-Überbehauptung                       | A6         |
| §4.4 Feedback nicht verdrahtet                                | B10        |
| §4.4 Freigabe nicht editierbar, kein Rückgängig               | B5, B13    |
| §4.4 Modell/Token-Anzeige als Rauschen                        | B9         |
| §5 maschinenlesbare Markierung bis 02.12.2026                 | B3         |
| §5 KI-Kompetenz / Schulungsnachweis                           | C6         |
| §5 Export-Gate für unverifizierte Zitate                      | C2         |
| §4.2 Tabular Review, Plan zuerst, Hintergrundjobs             | C1, C5     |

### Erfolgsmessung

| Kennzahl                                                            | Ziel   |
| ------------------------------------------------------------------- | ------ |
| Anteil KI-Antworten mit Ergebnis-Aktion (In Akte / Frist / Entwurf) | > 30 % |
| Klicks von der Akte bis zur belegten Antwort                        | ≤ 2    |
| Zitate mit Belegstelle, die die Aussage trägt (Stichprobe)          | > 95 % |
| Exporte mit unfreigegebenen, unverifizierten Zitaten                | 0      |
| KI-Aufrufe außerhalb von `aiGateway` (CI)                           | 0      |
| KI-Aufrufe an Nicht-EU-Endpunkte (Prod-Log)                         | 0      |
| axe serious/critical auf Chat-Zuständen                             | 0      |

---

## 8. Entscheidungen, die nur die Inhaber treffen können

1. **Modellanbieter:** Welche Option nehmen wir?

   | Option                                 | Vorteil               | Nachteil                              |
   | -------------------------------------- | --------------------- | ------------------------------------- |
   | Claude über AWS Bedrock EU (Frankfurt) | beste Qualität        | eigener AWS-Vertrag                   |
   | Mistral (EU-Firma)                     | einfachste ÖRAK-Story | schwächer bei komplexer Subsumtion    |
   | OpenRouter mit EU-Provider-Zwang       | ein Vertrag           | EU-Zusage vertraglich schwer belegbar |

   Die Anthropic-Erstanbieter-API bietet laut Doku derzeit keine EU-Residenz. Empfehlung: Bedrock EU für Reasoning, Mistral für die Utility-Stufe.

2. **Konsolidierung:** Dürfen Einzelseiten aus der Navigation verschwinden und nur noch als Skills des Assistenten erreichbar sein?
3. **Reihenfolge Word vs. Dokument-Loop:** Empfehlung: zuerst den Dokument-Loop im Produkt (B6), dann Word (C3). Word allein ohne Akten-Rückweg kopiert nur AI:ssociate und BEAMON.
4. **Preisposition:** Die Lücke liegt zwischen AI:ssociate (39–99 €, knappe Entwürfe) und Beck-Noxtua (ca. 350 €/Platz, Angabe unsicher). 100–250 € mit unbegrenzten Entwürfen ist unbesetzt.

---

## 9. Quellen (Auswahl)

**Recht und Aufsicht**

- ÖRAK-Leitfaden KI + Checkliste (Sept. 2025): https://www.anwaltsblatt.at/fileadmin/user_upload/Anwaltsblatt/PDF/oerak_25_leitfaden-KI-folder_a4_250923.pdf
- BRAK-Hinweise KI (Dez. 2024): https://www.brak.de/fileadmin/service/publikationen/Handlungshinweise/BRAK_Leitfaden_mit_Hinweisen_zum_KI-Einsatz_Stand_12_2024.pdf
- AI Omnibus in Kraft (27.07.2026): https://digital-strategy.ec.europa.eu/en/news/ai-omnibus-enters-force
- Art. 50 Code of Practice: https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content
- CCBE Guide Generative AI (Okt. 2025): https://www.ccbe.eu/fileadmin/speciality_distribution/public/documents/IT_LAW/ITL_Guides_recommendations/EN_ITL_20251002_CCBE-guide-on-the-use-of-the-use-of-generative-AI-for-lawyers.pdf
- OGH 14 Os 95/25i: https://www.derstandard.at/story/3000000294724/ki-halluzinierte-in-nichtigkeitsbeschwerde-ogh-wies-zur252ck
- EN 301 549 V4.1.1: https://accessible-eu-centre.ec.europa.eu/content-corner/news/european-accessibility-standard-en-301-549-has-been-updated-2026-09-07_en
- Anthropic-Datenresidenz: https://platform.claude.com/docs/en/manage-claude/data-residency

**Studien und Einschätzungen**

- Stanford „Hallucination-Free?“ (JELS 2025): https://dho.stanford.edu/wp-content/uploads/Legal_RAG_Hallucinations.pdf
- „Who Checks the Citations?“ (2026): https://arxiv.org/abs/2606.21155
- Legal Tech Barometer AT 2026: https://future-law.eu/event-nachberichte/ergebnisse-legal-tech-barometer-2026/

**Wettbewerb**

- AI:ssociate: https://aissociate.at/
- BEAMON/ÖRAK: https://www.oerak.at/aktuelles/aktuelles/news/beamon-ai-der-ki-assistent-fuer-oesterreichische-rechtsanwaltskanzleien/
- MANZ-Noxtua: https://www.noxtua.com/news/press-releases/manz-and-noxtua-launch-legal-ai-workspace-in-austria
- Lexis Protégé AT: https://www.ots.at/presseaussendung/OTS_20260917_OTS0139/lexisnexis-setzt-auf-neue-agentic-ai-technologie-fuer-recht-steuer
- Legora aOS: https://legora.com/newsroom/legora-introduces-the-legora-aos-the-agentic-operating-system-for-legal-work
- Harvey (Juli 2026): https://www.harvey.ai/blog/the-brief-july-2026
- CoCounsel (Aug. 2026): https://www.thomsonreuters.com/en/press-releases/2026/august/thomson-reuters-launches-next-generation-of-cocounsel-legal-the-ai-ecosystem-built-for-legal-professionals

**Offen zu prüfen:**

- Primärtext der Art.-50-Leitlinien, insbesondere ob es eine B2B-Ausnahme bei der Markierung gibt
- ZDR- und Retention-Bedingungen von Bedrock und OpenRouter im Vertrag
- ob das BaFG auf das Mandantenportal anwendbar ist
