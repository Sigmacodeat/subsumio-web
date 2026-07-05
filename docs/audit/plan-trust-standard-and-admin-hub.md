# Umsetzungsplan: Ein Vertrauens-Standard für jede KI-Antwort + Settings/Admin-Hub

**Auftrag:** Keine halben Sachen. Markt-Reife-Anspruch. Wo eine schnelle und eine vollständige
Lösung zur Wahl stehen, wird die vollständige gebaut.
**Basis:** Anschluss an [dashboard-todo-verification-2026-07-04.md](dashboard-todo-verification-2026-07-04.md)
(TODO 10 nur teilweise erfüllt: Chat hat keine vollständige Grounding-Verifikation; TODO 13/15 nur
für die 8 internen `/settings`-Tabs erledigt, nicht für die ~46-Routen-Gesamtfläche).
**Alle Datei-/Zeilenangaben gegen den aktuellen Working-Tree-Stand verifiziert** (nicht aus dem
ursprünglichen Audit übernommen, sondern frisch nachgeprüft).

Zwei unabhängige Arbeitspakete, beide vollständig abzuschließen (nicht nacheinander optional):

- **Teil A — Vertrauens-Standard:** Jede KI-Antwort im Produkt bekommt dieselbe
  Grounding-Verifikation, dieselbe Zitat-Darstellung, denselben "Anwaltlich zu prüfen"-Hinweis.
  Kein Screen mehr mit KI-Text ohne Vertrauens-Signal.
- **Teil B — Settings/Admin-Hub:** Die gesamte Verwaltungsfläche (nicht nur die 8 Tabs unter
  `/settings`) wird nach Zielgruppe segmentiert, vollständig benannt/erklärt, und die drei
  toten Routen werden repariert statt ignoriert.

---

## Teil A — Vertrauens-Standard für jede KI-Antwort

### IST-Stand (verifiziert)

| Screen                                                                   | Zitate angezeigt?                                                     | Grounding-Verifikation (`api.legal.ground()`)                            | Volles `CitationPanel`                                    | "Anwaltlich zu prüfen"-Badge         |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- | ------------------------------------ |
| Research (`research/page.tsx`)                                           | ✅                                                                    | ✅ (Zeile 184)                                                           | ✅                                                        | ✅                                   |
| Analyze (`analyze/page.tsx`)                                             | ✅                                                                    | ✅                                                                       | ✅                                                        | ✅                                   |
| Tabular Review                                                           | ✅                                                                    | ✅                                                                       | ✅                                                        | ✅                                   |
| Drafting (`drafting/page.tsx`)                                           | ✅                                                                    | ⚠️ ungeprüft, Panel eingebunden                                          | ✅                                                        | ⚠️ zu verifizieren                   |
| **Chat** (`chat-panel.tsx` + `chat-message.tsx`)                         | ✅ (`CitationBadgesInline`, `GroundingStatus` aus `CitationLink.tsx`) | ❌ **fehlt**                                                             | ❌ nur die leichte Inline-Variante, nicht `CitationPanel` | ❌                                   |
| Strategy-Tab Quick-Actions (`strategy-tab.tsx`, nutzt `api.query.think`) | teilweise (Query-Antwort als Text)                                    | ❌                                                                       | ❌                                                        | ❌                                   |
| Rechtsprechung KI-Fallback (`rechtsprechung/page.tsx`)                   | ✅ Titel/Gericht/Az strukturiert                                      | ❌ (bewusst kein Grounding, stattdessen Warn-Badge "KI ⚠️ Verifizieren") | ❌                                                        | ⚠️ eigenes Warn-Badge statt Standard |

**Kernbefund:** Chat ist der mit Abstand meistgenutzte KI-Screen (Home-Suchfeld routet direkt
dorthin, `src/app/dashboard/page.tsx`) und der einzige große, der komplett ohne
Verifikationsschicht auskommt — nur "hier sind Zitate", nie "X von Y Zitaten sind gegen den Korpus
bestätigt". Das ist eine Lücke im Kernversprechen ("digitaler Partner, dem man vertrauen kann"),
nicht Kosmetik.

### Zielbild

Eine einzige Wahrheit für "wie vertrauenswürdig ist diese KI-Antwort", verwendet von **jedem**
Screen, der KI-Text ausgibt:

1. Jede KI-Antwort durchläuft nach Fertigstellung (nicht blockierend für den sichtbaren Text)
   `api.legal.ground(answerText)`.
2. Das Ergebnis wird als volles `CitationPanel` gerendert — nicht die abgespeckte
   `CitationBadgesInline`-Variante.
3. `attorneyReviewRequired` ist standardmäßig `true` für jede Rechtsauskunft, außer explizit anders
   deklariert.
4. Rechtsprechungs-KI-Fallback bekommt dieselbe Grounding-Pipeline statt seines eigenen
   Sonderwegs (das strukturierte JSON-Parsing aus der letzten Runde bleibt — es liefert nur die
   Rohdaten; die Vertrauensbewertung obendrauf wird vereinheitlicht).

### A.1 — Grounding als progressive Verbesserung in den Chat einbauen

**Datei:** `src/components/chat/chat-panel.tsx` (Sende-Handler ab Zeile ~800-870, dort wo
`api.query.think(...)` aufgerufen und die Antwort in `messages` geschrieben wird).

1. Nach Abschluss des Streams (Antworttext vollständig, `isStreaming` wird `false`) einen
   **nicht-blockierenden** Folgeaufruf `api.legal.ground(finalAnswerText)` anstoßen. Der sichtbare
   Antworttext erscheint sofort wie bisher; das Grounding-Ergebnis trudelt 1-3 Sekunden später ein
   und aktualisiert die Nachricht (`setMessagesState`, Pattern existiert bereits für
   Streaming-Updates).
2. `ChatMessage`-Typ (`src/components/chat/chat-types.ts:18-32`) um ein Feld
   `grounding?: CitationPanelData["grounding"]` erweitern (Typ aus `CitationPanel.tsx` importieren,
   nicht duplizieren) und ein `groundingStatus?: "pending" | "done" | "unavailable"` für den
   Zwischenzustand.
3. Fehlerfall: Wenn `ground()` fehlschlägt (Netzwerk, Engine down), `groundingStatus: "unavailable"`
   setzen — **kein** Fehler-Toast, nur ein dezenter Hinweis im Panel ("Verifikation nicht verfügbar"),
   damit ein Ausfall des Grounding-Service den Chat nicht blockiert oder störend wirkt.
4. Kosten/Performance: Grounding nur auslösen, wenn die Antwort mindestens einen Citation-Treffer
   hat (`message.citations.length > 0`) — eine Antwort ganz ohne Zitate hat nichts zu verifizieren.
   Bei sehr kurzen Antworten (< 40 Zeichen, z. B. reine Bestätigungen) ebenfalls überspringen.

### A.2 — Volles CitationPanel statt CitationBadgesInline im Chat rendern

**Datei:** `src/components/chat/chat-message.tsx` (aktuell Zeile 157-165 `CitationBadgesInline`,
Zeile 243 `GroundingStatus`).

1. Ersetze den Block durch `<CitationPanel data={{ citations, gaps, grounding, isStreaming,
attorneyReviewRequired: true, jurisdiction: message.jurisdiction }} compact />` — der
   `compact`-Modus von `CitationPanel` existiert bereits genau für diesen Zweck (weniger
   raumgreifend als in Research, aber gleiche Vertrauens-Information).
2. Solange `groundingStatus === "pending"`, zeige einen dezenten Lade-Indikator im Panel-Kopf
   ("Zitate werden geprüft …") statt das Panel erst nach Abschluss einzublenden — sofortiges
   Feedback, dass Verifikation läuft.
3. Die bisherigen `CitationBadgesInline`/`GroundingStatus`-Imports aus `CitationLink.tsx` bleiben
   als Bausteine erhalten (werden von `CitationPanel` intern mitverwendet, wie in Research/Analyze
   auch) — nur der direkte Verbrauch in `chat-message.tsx` wird ausgetauscht.

### A.3 — Strategy-Tab Quick-Actions an denselben Standard anschließen

**Datei:** `src/components/legal/matter-tabs/strategy-tab.tsx` (Quick-Actions rufen
`api.query.think` über den Chat-/Query-Mechanismus des Akte-Kontexts auf, siehe
`handleQuickAction`).

Da diese Antworten im selben `matter-detail-context`-Query-Flow wie der eingebettete
Matter-Chat landen: Sicherstellen, dass das dort verwendete Antwort-Rendering **denselben**
`CitationPanel`/Grounding-Pfad wie A.1/A.2 nutzt, nicht eine dritte eigene Darstellung. Falls die
Akte-Query-Antwort aktuell nur Rohtext ohne Zitat-Struktur zurückgibt, `api.query.think`-Aufruf so
erweitern, dass `citations`/`gaps` mitgeliefert und genauso wie im Chat verifiziert werden.

### A.4 — Rechtsprechungs-KI-Fallback an den Standard angleichen

**Datei:** `src/app/dashboard/rechtsprechung/page.tsx` (KI-Fallback-Pfad, JSON-Parsing bereits
vorhanden aus der letzten Runde, Zeilen ~88-150).

Nach erfolgreichem JSON-Parse der KI-Urteilsliste: für jeden Eintrag optional
`api.legal.ground()` auf den `summary`-Text anwenden und das Ergebnis in der bestehenden
"KI ⚠️ Verifizieren"-Badge-Logik ersetzen durch das echte Grounding-Ergebnis (verifiziert/nicht
verifiziert), statt eines pauschalen Warn-Labels. Wenn Grounding für einen Eintrag keine Treffer im
Corpus findet, bleibt das bisherige Warn-Badge als Fallback — das ist dann eine ehrliche Aussage
("kein interner Beleg gefunden"), keine Kosmetik.

### A.5 — Zentrale Wiederverwendbarkeit sicherstellen

Um zu verhindern, dass ein sechster Screen in Zukunft wieder eine eigene Zitat-Darstellung erfindet:

1. Neuer Hook `useGroundedAnswer(rawAnswerText: string, citations: ChatCitation[])` in
   `src/lib/hooks/use-grounded-answer.ts` (neu), der intern `api.legal.ground()` aufruft,
   Lade-/Fehlerzustand verwaltet und `{ grounding, status }` zurückgibt. Chat, Strategy-Quick-Actions
   und Rechtsprechung nutzen denselben Hook statt eigener `useState`/`useEffect`-Kopien.
2. Kurzer Vermerk in `CLAUDE.md` (Abschnitt "Reference map" oder ein neuer Eintrag in
   `docs/architecture/KEY_FILES.md`), dass **jede** neue KI-Ausgabe-Oberfläche `useGroundedAnswer` +
   `CitationPanel` nutzen MUSS — analog zum bestehenden Muster für JSONB/Source-Isolation als
   "Cross-cutting invariant".

### A — Definition of Done

- [ ] `tsc --noEmit` clean.
- [ ] Neuer Test `src/components/chat/chat-grounding.test.tsx`: Nachricht mit Zitaten → nach
      Antwortende wird `api.legal.ground` aufgerufen → `CitationPanel` erhält befülltes
      `grounding`-Objekt (nicht nur Mock-Strings, echte Render-Assertion auf verifizierte/nicht
      verifizierte Zählung).
- [ ] Manueller Check im Preview: Chat-Frage stellen, die auf eine Brain-Seite zitiert → Panel
      erscheint mit "wird geprüft" → nach kurzer Zeit mit Verifikationsstand.
- [ ] Kein Screen mit KI-Fließtext mehr, der **keinen** Aufruf von `useGroundedAnswer`/`CitationPanel`
      hat (Grep-Check: `grep -rL "useGroundedAnswer\|CitationPanel" <Liste der KI-Output-Screens>`).

---

## Teil B — Settings/Admin-Fläche als geführter Hub

### IST-Stand (verifiziert)

- `/dashboard/settings` gruppiert **nur seine 8 internen Tabs** (Brain/API/Dream/Kanzlei/Team/
  ACLs/SCIM/Account) in drei Gruppen ("Persönlich"/"Kanzlei"/"Sicherheit") — das war TODO 15,
  Runde 1.
- Die eigentliche Verwaltungsfläche ist **viel größer** und liegt zum großen Teil **außerhalb**
  von `/settings`, flach in der Sidebar unter `ADMIN_SECTION`
  (`src/components/dashboard/sidebar.tsx:537-655`, 19 Einträge, keine Gruppierung, keine
  Rollen-/Größen-Kennzeichnung außer den bestehenden `allowed`-Rollen auf den Settings-Unterseiten
  selbst) sowie in den Sidebar-Sektionen **Billing** (6 Einträge) und **Compliance** (6 Einträge).
- Namens-Hygiene ist bereits **teilweise** erledigt: "Altlasten" → **"Bestandsakten"**
  (`content/dashboard.ts:69`) und "Controlling" → **"Kanzlei-Kennzahlen"**
  (`content/dashboard.ts:741`) sind bereits umbenannt. Bleibt zu prüfen: weitere Fachbegriffe ohne
  Erklärung (Verfahrensdoku, GoBD, SCIM, DATEV) — siehe B.3.
- **Drei Routen sind aus jeder Navigation (Sidebar + Command-Palette) unerreichbar**, nur per
  direkter URL aufrufbar: `/dashboard/bea`, `/dashboard/deep-analysis`, `/dashboard/translate`.
  Das ist mehr als ein Namensproblem — das sind lauffähige Features, die kein Nutzer findet.
  (`altlasten` ist dagegen bewusst nur über die Command-Palette erreichbar — das ist in Ordnung,
  siehe unten.)

### Zielbild

Eine dedizierte **Verwaltungs-Übersichtsseite** (`/dashboard/settings` wird zum Hub, die
bisherigen Tabs bleiben als Unterbereich "Konto & Kanzlei" erhalten), die **alle**
settings-/compliance-/integrations-artigen Routen als durchsuchbare, nach Zielgruppe
gruppierte Kachel-Liste zeigt — nicht nur die 8 Tabs. Die Sidebar selbst wird schlanker (nur die
wirklich täglich gebrauchten Admin-Punkte bleiben dort direkt sichtbar), der Rest zieht in den Hub
um, ist aber weiterhin über Command-Palette und Hub gleichermaßen auffindbar.

### B.1 — Vollständige Inventur & Zielgruppen-Tier je Route

Jede der folgenden Routen bekommt ein Tier-Attribut. Drei Tiers (analog zur Terminologie aus
TODO 14, damit Nutzer ein wiedererkennbares Konzept haben):

**Tier `quick-start`** (jede Kanzlei ab Tag 1, ohne Vorwissen bedienbar):
`settings` (Account/Kanzlei/Team-Tabs), `settings/security`, `team`, `billing`, `api-keys`
(nur falls Integration genutzt wird → siehe B.2 Konditional-Hinweis), `onboarding`.

**Tier `erweitert`** (ab ~10 Personen / spezialisierte Rollen relevant):
`connectors`, `settings/scim`, `monitoring`, `monitoring/engine`, `analytics`
(bereits konsolidiert, siehe vorherige Runde), `adoption-analytics` — **Achtung:** in
`dashboard-todo-verification-2026-07-04.md` als bereits dedupliziert dokumentiert; bei der Inventur
verifizieren, dass das noch stimmt, nicht erneut duplizieren — `litigation-analytics`,
`portfolio-insights`, `reports`, `rag-eval`, `chat/analytics`, `chat/compare`, `agents`,
`workflows/builder`, `experience`, `shared-spaces`, `client-portal`, `mobile`,
`mobile/pipeline`, `signature`, `version-history`, `vault` (Konfig-Anteil, nicht die tägliche
Nutzung), `cost-calculator`, `process-strategy`, `verfahrensdoku`.

**Tier `dach-integration`** (nur relevant mit deutschem/österreichischem/schweizer
Praxis-Kontext, klar so labeln):
`settings/kanzlei` (DATEV-Feld, Tarifmodell), `datev-export`, `bea` _(derzeit tot, siehe B.4)_,
`elster`, `import-kanzlei`, `compliance`, `compliance/ai-act`, `compliance/retention`,
`anonymize`, `data-export`, `email-import`, `whatsapp`, `whatsapp/templates`,
`calendar-export`, `judgements-sync`, `judgements-db` (falls nicht schon im Research-Hub
konsolidiert — mit Runde-1-Stand abgleichen), `word-addin`, `directory`, `opponents`,
`altlasten`/Bestandsakten.

**Tier `system`** (kein Nutzer-Tuning, nur Sichtbarkeit für Transparenz/Audit):
`audit`, `settings/ai-model` (Modellwahl ist zwar Kanzlei-Entscheidung, aber selten geändert —
bewusst hier statt quick-start, damit Quick-Start wirklich in < 1 Stunde durchlaufbar bleibt).

_(Diese Zuordnung ist der Ausgangspunkt für die Umsetzung — beim Bauen gegen echte Nutzungsdaten/
Kundenfeedback validieren, nicht blind übernehmen. Wichtig ist die Tier-Struktur selbst, nicht jede
Einzelzuordnung in Stein gemeißelt.)_

### B.2 — Datenmodell für die Tier-Zuordnung

**Datei:** `src/components/dashboard/sidebar.tsx` (NavItem-Interface, vermutlich nahe den
bestehenden `NavItem`/`NavSection`-Typdefinitionen am Dateianfang).

1. `NavItem` um `tier?: "quick-start" | "erweitert" | "dach-integration" | "system"` erweitern.
2. Jedem Eintrag in `ADMIN_SECTION`, den Billing- und Compliance-Sektionen sowie den bisher
   unerreichbaren drei Routen (nach B.4-Reparatur) das passende Tier aus B.1 zuweisen.
3. **Konditionale Sichtbarkeit statt Löschen:** Ein Onboarding-Flag
   (`kanzlei.uses_datev`, `kanzlei.uses_bea`, `kanzlei.uses_whatsapp` — als neue Felder im
   Kanzlei-Settings-Objekt, analog zu bestehenden Onboarding-Antworten) blendet
   `dach-integration`-Einträge, die auf explizit abgewählte Werkzeuge zurückgehen, im Hub in eine
   eingeklappte "weitere Integrationen"-Gruppe statt sie zu verstecken — sie bleiben aber immer per
   Suche erreichbar. Nichts wird für Nutzer, die es doch brauchen, unerreichbar gemacht.

### B.3 — Neue Hub-Seite statt reiner Tab-Leiste

**Datei:** `src/app/dashboard/settings/page.tsx` umbauen zu einem zweistufigen Layout:

1. **Oberste Ebene:** Kachel-Raster, gruppiert nach den vier Tiers aus B.1, mit
   Ein-Satz-Beschreibung pro Kachel (das im ursprünglichen Audit explizit vermisste Kontextwissen —
   z. B. bei `dach-integration`-Kacheln ein kleiner Hinweis "nur relevant, wenn Ihre Kanzlei DATEV/
   beA/ELSTER nutzt"). Freitext-Suche oben (nutzt dieselbe Fuzzy-Logik wie die Command-Palette,
   ggf. denselben Suchindex wiederverwenden statt eine zweite Implementierung zu bauen).
2. **Zweite Ebene:** Die bestehenden 8 Account/Kanzlei/Sicherheits-Tabs bleiben als eigener
   Reiter "Konto & Kanzlei" innerhalb des Hubs erhalten (kein Bruch bestehender Bookmarks/Tests —
   `sidebar.test.tsx` und ggf. weitere Settings-Tests laufen weiter gegen dieselbe Route).
3. Rollenbasierte Sichtbarkeit (das bestehende `allowed`-Array-Muster aus
   `settings/page.tsx:57-107`) wird auf die Hub-Kacheln erweitert — ein `assistant`-Nutzer sieht
   z. B. keine SCIM-Kachel, aber weiß nicht mal, dass es sie gibt (kein "gesperrt"-Icon für Dinge
   außerhalb der eigenen Rolle, um Verwirrung zu vermeiden).
4. **Sidebar-Entlastung:** `ADMIN_SECTION` in `sidebar.tsx` wird auf die `quick-start`-Tier-Einträge
   plus einen einzelnen neuen Punkt **"Alle Einstellungen"** (Link zum Hub) reduziert. Die
   Billing- und Compliance-**Sektionen** bleiben als eigene Sidebar-Sektionen bestehen (sie sind
   bereits sinnvoll benannt und nicht das Kernproblem), aber jeder ihrer Einträge bekommt ebenfalls
   das Tier-Attribut für die Hub-Darstellung — Sidebar und Hub greifen auf dieselbe Datenquelle zu,
   keine zweite Liste pflegen.

### B.4 — Die drei toten Routen reparieren

**Nicht löschen — anbinden.** Es sind lauffähige Features (siehe vorheriger IST-Audit:
`bea` = beA-Integration-Setup real, `translate` = Übersetzungs-Tool real, `deep-analysis` =
Cross-Doc-Analyse). "Beste Lösung" heißt: sichtbar machen, nicht verstecken oder wegwerfen.

1. `bea` → Tier `dach-integration`, Eintrag in `ADMIN_SECTION` bzw. im Hub unter "beA & Kanzlei-Post".
2. `deep-analysis` → gehört logisch zu Analyze/Case-Scanner — als weiterer Eintrag in der
   "Litigation & Court"-Sidebar-Sektion (`NAV_SECTIONS`) ergänzen, nicht im Admin-Hub (es ist ein
   Arbeits-Tool, kein Verwaltungs-Tool).
3. `translate` → gehört zu "Documents & Drafting" (Sidebar-Sektion) — dort als Eintrag ergänzen,
   ebenfalls kein Admin-Tool.
4. Für alle drei: Command-Palette-Eintrag ergänzen (Muster aus dem bestehenden `altlasten`-Eintrag
   in `command-palette.tsx:223-230` übernehmen), damit sie auch per `Cmd+K` auffindbar sind, egal
   ob sie im Hub oder in einer Arbeits-Sektion landen.

### B.5 — Naming-Durchgang zu Ende bringen

`content/dashboard.ts` Vollständigkeits-Check (die zwei bekannten Fälle sind bereits erledigt):

1. Für jeden `dach-integration`- und `system`-Tier-Eintrag: Tooltip/Untertitel ergänzen, der in
   einem Satz erklärt, wofür der Punkt gut ist und wann er NICHT gebraucht wird (Muster: "DATEV-
   Export — nur relevant, wenn Ihre Kanzlei DATEV zur Finanzbuchhaltung nutzt").
2. `verfahrensdoku`, `SCIM`, `GoBD`-Erwähnungen (in Compliance-Texten), `RAG-Eval` auf
   verständliche deutsche Erklärung prüfen — nicht zwingend umbenennen (manche Begriffe wie SCIM
   oder DATEV sind feststehende Fachbegriffe, die Zielnutzer kennen), aber jeweils mit einem
   Tooltip/Untertitel versehen, wenn noch nicht vorhanden.
3. Ergebnis der Namens-Prüfung tabellarisch in dieser Datei nachtragen (Abschnitt "B — Naming-Log"
   unten anlegen), damit nachvollziehbar bleibt, was geprüft und was bewusst unverändert gelassen
   wurde.

### B — Definition of Done

- [ ] `tsc --noEmit` clean.
- [ ] `sidebar.test.tsx` weiterhin grün, plus neuer Test `settings-hub.test.tsx`: Hub zeigt alle
      vier Tiers, Rollenfilter greift, Suche findet einen Eintrag aus jedem Tier.
- [ ] Neuer Test, der sicherstellt, dass **jede** Route unter `src/app/dashboard/**` entweder (a)
      in der Sidebar, (b) im Settings-Hub oder (c) in der Command-Palette referenziert ist — verhindert,
      dass in Zukunft wieder eine tote Route wie `bea`/`deep-analysis`/`translate` entsteht
      (Implementierung: Verzeichnis-Scan gegen die drei Registries, analog zum bestehenden
      Muster in `sidebar.test.tsx`).
- [ ] Manueller Check im Preview: Hub öffnen, in jedem Tier mind. eine Kachel anklicken → korrekte
      Zielseite; Rolle `assistant` simulieren → SCIM/Billing-Kacheln nicht sichtbar; `bea`,
      `deep-analysis`, `translate` über Cmd+K auffindbar.
- [ ] Kein Duplikat wie vormals `analytics`/`adoption-analytics` erneut eingeführt (Gegenprobe: Diff
      gegen die in `dashboard-todo-verification-2026-07-04.md` dokumentierte bereinigte Liste).

---

## Reihenfolge

Teil A und Teil B sind unabhängig voneinander umsetzbar (unterschiedliche Dateien, kein
gemeinsamer State) — können parallel bearbeitet werden, wenn zwei Agents zur Verfügung stehen.
Innerhalb Teil A: A.1 → A.2 (Datenfluss vor Darstellung) → A.5 (Hook extrahieren, sobald Chat
funktioniert) → A.3, A.4 (auf den fertigen Hook aufsetzen). Innerhalb Teil B: B.1 (Inventur) →
B.2 (Datenmodell) → B.3 (Hub-UI) und B.4 (tote Routen) parallel → B.5 (Naming) zuletzt, da es von
der finalen Struktur aus B.3 abhängt (Tooltips brauchen die endgültigen Kachel-Texte).

Nach Abschluss beider Teile: vollständiger Verifikationsdurchlauf wie in den vorherigen Runden
(`tsc --noEmit`, komplette Testsuite, Cross-Check jeder "Definition of Done"-Checkbox gegen den
tatsächlichen Diff — nicht gegen die Behauptung des Agents).
