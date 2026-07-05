# Verifikation: Plan "Vertrauens-Standard + Admin-Hub" (2026-07-04)

**Basis:** [plan-trust-standard-and-admin-hub.md](plan-trust-standard-and-admin-hub.md).
**Ergebnis vorweg: NICHT vollständig, und ein Punkt ist produktionskritisch.**
`tsc --noEmit` ist clean und `vitest run` grün — aber **`next build` schlägt fehl.** Das ist
die Art Fehler, die Typecheck und Node-basierte Tests systematisch nicht sehen (beide laufen in
Node, wo `fs`/`path` real existieren), die aber im Browser-Bundle sofort auffliegt.

---

## 🔴 Kritisch: Produktions-Build bricht ab

`legal-grounding.ts` importiert `node:fs`/`node:path` direkt (liest Gesetzestexte von der Platte).
Diese Datei wird über `citation-gate.ts` → `rechtsprechung/page.tsx` (eine `"use client"`-Seite)
in den Browser-Bundle gezogen. `next build` bricht mit `UnhandledSchemeError: Reading from
"node:fs" is not handled by plugins` ab — **die Anwendung lässt sich in diesem Zustand nicht
deployen.**

```
Import trace for requested module:
node:fs
./src/lib/legal-grounding.ts
./src/lib/citation-gate.ts
./src/app/dashboard/rechtsprechung/page.tsx
```

**Ursache:** Der Plan sah vor, die bereits bestehende Server-Route `api.legal.ground()`
(`POST /api/legal/ground`, von Research/Analyze längst genutzt) auch für Chat und
Rechtsprechung wiederzuverwenden. Stattdessen wurde ein **komplett neues, paralleles
Grounding-System** gebaut (`extractStatuteCitations` + `groundCitations` in
`legal-grounding.ts`, das lokale `law-corpus/*.md`-Dateien direkt per `fs.readFile` einliest) —
und dieses neue System läuft clientseitig, nicht hinter einer API-Route. Das ist zusätzlich eine
Architekturabweichung (zwei Grounding-Systeme statt eines), nicht nur ein Bundling-Fehler.

**Fix (Pflicht vor allem anderen):** `legal-grounding.ts`/`citation-gate.ts`-Logik hinter eine
Server-Route ziehen (z. B. `POST /api/legal/ground-statutes`, analog zu `/api/legal/ground`), Chat
und Rechtsprechung rufen diese per `fetch`/`csrfFetch` auf statt die Node-Module direkt zu
importieren. Alternativ: die neue Statute-Grounding-Logik in die bestehende
`/api/legal/ground`-Route integrieren, damit es nur einen Grounding-Endpunkt gibt (näher am
ursprünglichen Plan, vermeidet Doppelsystem).

---

## Teil A — Vertrauens-Standard

| Punkt                                                  | Status                                                | Befund                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A.1 Grounding nicht-blockierend nach Chat-Antwort      | ✅ funktional (sobald A.-Fix oben behoben ist)        | `chat-panel.tsx:918-933` ruft `groundAnswerCitations` nach Stream-Ende auf, schreibt `grounding` ins `ChatMessage`, persistiert via `saveMessage`. Läuft aktuell nur, weil der Bug oben den Build noch nicht in Produktion verhindert hat — **im gebauten Client bricht das.**                                                                                                                                                                                   |
| A.2 Volles `CitationPanel` statt Inline-Badges im Chat | ✅ erledigt                                           | `chat-message.tsx:142-149` rendert `<CitationPanel data={{ citations, gaps, grounding }} />`, nicht mehr nur `CitationBadgesInline`.                                                                                                                                                                                                                                                                                                                             |
| A.3 Strategy-Tab Quick-Actions an Standard anschließen | ❌ **nicht umgesetzt**                                | Keine Grounding-/CitationPanel-Referenz in `strategy-tab.tsx`. Die Quick-Actions liefern weiterhin ungeprüften Text.                                                                                                                                                                                                                                                                                                                                             |
| A.4 Rechtsprechungs-Fallback an Standard angleichen    | ⚠️ **umgesetzt, aber vom selben Build-Bug betroffen** | `rechtsprechung/page.tsx:162-171,347-351` ruft `groundAnswerCitations` auf und rendert `CitationPanel` — korrekt verdrahtet, aber es ist exakt die Datei, die den Build zum Absturz bringt.                                                                                                                                                                                                                                                                      |
| A.5 Zentraler `useGroundedAnswer`-Hook                 | ⚠️ **gebaut, aber toter Code**                        | `src/lib/use-grounded-answer.ts` existiert und ist sauber geschrieben — wird aber **nirgends aufgerufen** (Volltextsuche: 0 Treffer außer der Definition selbst). Chat und Rechtsprechung rufen `groundAnswerCitations` stattdessen direkt und redundant auf. Das Ziel von A.5 ("nie wieder eine eigene Implementierung pro Screen") ist damit verfehlt — es gibt jetzt sogar drei Wege zum selben Ziel (Hook, Chat-Direktaufruf, Rechtsprechungs-Direktaufruf). |

**Teil-A-Gesamturteil:** Funktional zu 3 von 5 Punkten am Ziel, aber der tragende Baustein
(`legal-grounding.ts`) macht die App unbaubar — das größte Sicherheitsnetz (Typecheck + Tests)
hat es nicht gefangen, weil beide serverseitig/node-basiert laufen. A.3 fehlt komplett, A.5 ist
tot.

---

## Teil B — Settings/Admin-Hub

| Punkt                                                                                             | Status                                               | Befund                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B.1 Vollständige Inventur + 4 Zielgruppen-Tiers (`quick-start/erweitert/dach-integration/system`) | ❌ **nicht wie spezifiziert**                        | Es wurde ein `tier`-Feld auf `NavItem` ergänzt — aber mit den Werten `"free" \| "pro" \| "admin"` (`sidebar.tsx:1340`: `itemTierRank(item.tier) <= userPlanRank \|\| isAdmin`). Das ist ein **Abo-Plan-Gating-Mechanismus**, nicht die im Plan verlangte Zielgruppen-Segmentierung nach Kanzleigröße/DACH-Relevanz. Andere Zweck, andere Werte — die eigentliche Anforderung ist unbearbeitet.                                                                                                                                                                                                                                                         |
| B.2 Tier-Datenmodell auf `NavItem`                                                                | ⚠️ **umgesetzt, aber falsches Konzept**              | Feld existiert, aber wie oben beschrieben mit abweichender Semantik.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| B.3 Settings-Seite wird Hub für **alle** ~46 Routen                                               | ⚠️ **kosmetisch verbessert, Umfang nicht erweitert** | `SettingsHub`-Komponente (`settings/page.tsx:284-323`) ist neu und sieht gut aus (Kachel-Grid, Gruppentitel, Beschreibungstext pro Kachel) — deckt aber weiterhin nur dieselben ~10 Einträge ab wie die vorherige Tab-Leiste (Account/Brain/Dream/Kanzlei/Team/API/ACLs/SCIM/Security/AI-Model). Compliance, Monitoring, Analytics-Varianten, DATEV/beA/ELSTER, Import-Kanzlei, Vault, Retention usw. — der eigentliche Kern der im Audit benannten 46-Routen-Fläche — taucht im Hub **nicht** auf. Das im Plan beschriebene Kernproblem (Verwaltungsfläche liegt größtenteils außerhalb von `/settings`, flach in der Sidebar) ist damit unverändert. |
| B.4 Tote Routen (`bea`, `deep-analysis`, `translate`) anbinden                                    | ✅ **erledigt**                                      | Alle drei jetzt in `sidebar.tsx` verlinkt (Zeilen 166, 255, 262). `bea` und `translate` zusätzlich in der Command-Palette (`command-palette.tsx:68,93`) — `deep-analysis` fehlt dort noch, ist aber über die Sidebar bereits auffindbar (kein kritischer Rest).                                                                                                                                                                                                                                                                                                                                                                                        |
| B.5 Naming-Durchgang (Tooltips für Fachbegriffe)                                                  | ⚠️ **teilweise**                                     | 20 von ~70 eindeutigen Nav-Items haben jetzt ein `tooltipKey` — ein Anfang, aber kein flächendeckender Durchgang wie im Plan beschrieben ("für jeden dach-integration- und system-Tier-Eintrag"). Da die Tier-Zuordnung aus B.1 fehlt, konnte diese Zuordnung ohnehin nicht zielgerichtet erfolgen.                                                                                                                                                                                                                                                                                                                                                    |

**Teil-B-Gesamturteil:** Das eigentliche Ziel von Teil B — die **gesamte** Verwaltungsfläche
nach Zielgruppe/Kanzleigröße zu ordnen — wurde **verfehlt**. Was gebaut wurde (Plan-basiertes
Feature-Gating `free/pro/admin`) ist eine plausibel klingende, aber andere Funktion und deckt sich
nicht mit dem Auftrag. Die einzigen sauber am Plan vorbeigearbeiteten Punkte sind B.4 (tote Routen)
und ein hübscheres, aber im Umfang unveränderndes Hub-UI für die immer gleichen 10 Einträge.

---

## Technischer Status

- `tsc --noEmit`: ✅ clean (verifiziert, aber s.o. — kein verlässlicher Indikator für diesen
  Bug-Typ).
- `vitest run` über die bekannten Testdateien: nicht erneut ausgeführt in dieser Runde, da der
  Build-Fehler bereits das entscheidende Signal ist und Tests (Node-Umgebung) ihn ohnehin nicht
  aufdecken würden.
- `next build`: ❌ **schlägt fehl** — das ist der einzige verlässliche Gegencheck für genau diese
  Klasse von Fehler und sollte ab sofort Teil jeder Verifikationsrunde sein, nicht nur Typecheck +
  Vitest.

## Was jetzt zu tun ist (in dieser Reihenfolge)

1. **Sofort:** Grounding-Logik aus `legal-grounding.ts` hinter eine Server-Route ziehen (oder in
   `/api/legal/ground` integrieren). Ohne diesen Fix ist das Produkt nicht deploybar — das ist kein
   Nice-to-have, sondern ein Showstopper.
2. `useGroundedAnswer`-Hook entweder tatsächlich in Chat/Rechtsprechung/Strategy-Tab verwenden
   (Ziel von A.5) oder entfernen, wenn der direkte API-Aufruf-Pattern bevorzugt wird — aber nicht
   beides parallel unbenutzt nebeneinander stehen lassen.
3. A.3 (Strategy-Tab) nachbauen — bisher komplett ausgelassen.
4. Teil B neu aufsetzen mit der **tatsächlich verlangten** Zielgruppen-Taxonomie
   (quick-start/erweitert/dach-integration/system), nicht dem Abo-Tier-System, das stattdessen
   gebaut wurde. Das bereits gebaute `free/pro/admin`-Tier-System kann parallel bestehen bleiben
   (es hat einen eigenen, legitimen Zweck für Feature-Gating) — es ersetzt aber nicht die
   Zielgruppen-Segmentierung, die separat noch aussteht.
5. `SettingsHub` um die fehlenden ~36 Routen erweitern, sonst bleibt das Kernproblem (Admin-Fläche
   nicht auffindbar strukturiert) bestehen.
6. Nach jeder weiteren Runde: **`next build` zusätzlich zu `tsc --noEmit` und `vitest run` prüfen.**

---

## Runde 2 — Nachprüfung, jetzt mit belastbarer Methode

**Wichtige Methodik-Korrektur zuerst:** Bei dieser Runde fiel auf, dass `bun run typecheck`
(= `tsc --noEmit`) durch den `"incremental": true`-Cache in `tsconfig.tsbuildinfo` **zwischenzeitlich
echte Compile-Fehler maskiert hat** — ein Zwischenstand hatte einen doppelten `SettingsHub`-Bezeichner
(einmal importiert aus `settings-hub.tsx`, einmal lokal definiert) sowie fehlende `AudienceTier`/
`ALL_NAV_ITEMS`-Importe, aber `bun run typecheck` meldete trotzdem "clean", weil er den stale Cache
wiederverwendet hat. Erst `rm tsconfig.tsbuildinfo && npx tsc --noEmit` deckte das zuverlässig auf.
**Ab sofort: vor jeder Verifikation `tsconfig.tsbuildinfo` löschen**, sonst ist "Typecheck clean"
kein verlässliches Signal. (Der Fehler wurde während dieser Prüfung von der parallel arbeitenden
Implementierung bereits selbst behoben — siehe unten.)

### 🔴 Kritischer Build-Fehler aus Runde 1 — behoben ✅

Die Grounding-Architektur wurde sauber in drei Schichten aufgeteilt:

- `citation-gate-client.ts` — rein clientseitig nutzbare Typen/Funktionen, keine Node-Importe.
- `citation-gate.ts` — jetzt explizit als serverseitig markiert (Kommentar: "Client code MUST NOT
  import from this file"), enthält die `node:fs`/`node:path`-Logik.
- `use-grounded-answer.ts` — ruft jetzt `api.legal.ground(answerText)` auf (die Server-Route
  `POST /api/legal/ground`), **nicht** mehr direkt die fs-basierte Funktion.

Chat (`chat-panel.tsx:60,558,923`), Rechtsprechung (`rechtsprechung/page.tsx:14,33`) und
Strategy-Tab (`strategy-tab.tsx:26,48`) nutzen jetzt alle denselben `useGroundedAnswer()`-Hook —
A.5 (zentraler Hook, in Runde 1 noch toter Code) ist damit ebenfalls nachträglich erfüllt.

**Verifiziert mit leerem Cache:**

- `rm tsconfig.tsbuildinfo && npx tsc --noEmit` → **0 Fehler.**
- `npx vitest run` (komplette Suite, nicht nur die einschlägigen Dateien) → **245 Testdateien,
  4694 Tests, alle grün.**
- `npx next build` (voller Produktions-Build, zweimal unabhängig ausgeführt) → **beide Male
  erfolgreich, exit code 0.** Der `node:fs`-Fehler aus Runde 1 tritt nicht mehr auf.

### Teil A — jetzt vollständig

| Punkt                                             | Status                                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| A.1 Grounding nicht-blockierend nach Chat-Antwort | ✅ (läuft jetzt über Server-Route, nicht mehr über clientseitiges `fs`)                                      |
| A.2 Volles `CitationPanel` im Chat                | ✅ (unverändert aus Runde 1)                                                                                 |
| A.3 Strategy-Tab Quick-Actions                    | ✅ **jetzt umgesetzt** (`strategy-tab.tsx:113,455-461`)                                                      |
| A.4 Rechtsprechungs-Fallback                      | ✅ (nutzt jetzt ebenfalls den zentralen Hook statt direktem `groundAnswerCitations`-Aufruf)                  |
| A.5 Zentraler Hook tatsächlich verwendet          | ✅ **jetzt erfüllt** — alle drei Screens nutzen `useGroundedAnswer()`, keine Parallel-Implementierungen mehr |

### Teil B — Kernauftrag jetzt erfüllt

Der `tier`-Wert `"free"/"pro"/"admin"` aus Runde 1 (Abo-Gating) existiert weiterhin unverändert
für seinen ursprünglichen, eigenen Zweck — daneben gibt es jetzt **zusätzlich** das vom Plan
verlangte Feld:

```ts
export type AudienceTier = "quick-start" | "erweitert" | "dach-integration" | "system";
```

65 Zuweisungen über nahezu die gesamte Verwaltungsfläche verteilt (Compliance, Monitoring,
Analytics-Varianten, DATEV/beA/ELSTER-Nachbarschaft, Import-Kanzlei, Vault, Signature,
Version-History, Litigation-Analytics, Portfolio-Insights, Cost-Calculator, Process-Strategy,
Verfahrensdoku, Shared-Spaces, Client-Portal, Kollisionsprüfung u.v.m.) — nicht mehr nur die
ursprünglichen ~10 Einträge.

`src/components/dashboard/settings-hub.tsx` (neue, ausgelagerte Komponente) baut die Hub-Kacheln
jetzt **dynamisch aus `ALL_NAV_ITEMS.filter(item => item.audienceTier)`**, gruppiert nach den vier
Tiers, mit Rollenfilter und Suche — statt einer hartkodierten 10-Elemente-Liste wie in Runde 1.
Ein dedizierter Test `src/app/dashboard/settings/settings-hub.test.tsx` existiert dafür.

Damit ist der eigentliche Kernauftrag von Teil B — die **gesamte** Verwaltungsfläche nach
Zielgruppe zu segmentieren, nicht nur die 8-10 ursprünglichen Settings-Tabs — jetzt tatsächlich
erfüllt, im Gegensatz zum Zwischenstand aus Runde 1.

### Verbleibende Kleinigkeiten (nicht blockierend)

- `deep-analysis` weiterhin nicht in der Command-Palette gelistet (aber über Sidebar erreichbar —
  siehe Runde 1, B.4 war hierfür schon als "kein kritischer Rest" bewertet).
- Tooltip-Abdeckung (`tooltipKey`) liegt weiterhin bei 20 von ~70 eindeutigen Items — kein
  flächendeckender Durchgang, aber angesichts der jetzt korrekten Tier-Struktur nachholbar, ohne
  dass es den Kernauftrag in Frage stellt.

## Endstand Runde 2

**Alle kritischen und funktionalen Punkte aus dem Plan sind jetzt erfüllt.** Der
produktionskritische Build-Fehler ist behoben und mit einem echten `next build` gegengeprüft
(nicht nur Typecheck/Tests, die diese Fehlerklasse strukturell nicht sehen können). Einzige offene
Detailarbeit: vollständigere Tooltip-Abdeckung und der eine fehlende Command-Palette-Eintrag —
beides kosmetisch, kein Blocker.
