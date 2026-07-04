# Fristen-Kette End-to-End-Audit — Erkennung → Berechnung → Kontrolle → Erinnerung

> **Datum:** 2026-07-04
> **Warum dieses Audit als nächstes:** Dashboard-UX (Audit 03.07.) und Ingestion/AT-Erkennung (Audit 04.07.) sind auditiert und gehärtet bzw. verplant. Die Fristen-Kette ist das höchste verbleibende **Haftungsrisiko** — eine verpasste Notfrist ist der teuerste Fehler einer Kanzlei, und sie ist das Kern-Verkaufsargument („Fristen-first") gegen Harvey & Co., die dieses Feld komplett ignorieren.
> **Scope:** Alle fünf Erkennungsquellen, beide Rechen-Engines, alle Speicherorte, Kontroll-Workflows (Vorfrist, Vier-Augen, Fristenbuch), Erinnerungswege (Cron-Digest, Notifications, ICS, WhatsApp), Dashboard-Sichtbarkeit.
> **Methodik:** Code-Trace mit Dateibezug; keine Live-Prüfung gegen Prod.

---

## 1. Executive Summary

**Gesamturteil: 68/100 — die schwächste der drei auditierten Ketten, aus demselben Grund wie bei der Ingestion: Die besten Bausteine existieren, sind aber nicht verbunden.**

Es gibt **zwei vollständige, voneinander getrennte Fristen-Systeme**:

|            | Web-System                                                                                                                                               | Engine-System                                                                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Berechnung | [legal-deadlines.ts](src/lib/legal-deadlines.ts): DE/AT/CH-Regeln (§§ ZPO/BGB, AT JN/AVG/BAO), Feiertage nach Bundesland/Kanton, § 188 BGB Monatsfristen | [frist-engine.ts](server/src/core/legal/frist-engine.ts): AT §§ 124–126 ZPO, § 222 ZPO verhandlungsfreie Zeit, § 89a GOG/ZustG-Zustellfiktionen, ARG-Feiertage |
| Erkennung  | [ai-deadline-detect.ts](src/lib/ai-deadline-detect.ts) (Regex + Zahlwörter) via Scan-Buttons                                                             | Pipeline Layer 5 + 5b (Sonnet-Extraktion + §-Cross-Check) → `deadline_calendar`-Pages                                                                          |
| Kontrolle  | `review_status` approve/reject im Akten-Tab, Audit-Log                                                                                                   | **Fristenbuch** ([fristenbuch.ts](server/src/core/legal/fristenbuch.ts)): Vorfrist (7 Tage, werktags), Vier-Augen-Eskalation ≤ 2 Werktage, ICS-Feed mit VALARM |
| Erinnerung | Cron-Digest (E-Mail + WhatsApp), Topbar-Notifications, Copilot-Alerts, ICS-Download                                                                      | `/api/legal/fristenbuch` + `/api/legal/deadlines.ics` (Abo-Feed)                                                                                               |

**Die zwei Systeme teilen keine Daten.** Das Dashboard konsumiert das Engine-Fristenbuch nirgends (0 Referenzen in `src/`). Der Cron-Digest, die Fristen-Seite, der Kalender-Export und die Notifications lesen nur `legal_case` + `legal_deadline` — Fristen, die die 7-Layer-Pipeline in `deadline_calendar`-Pages extrahiert, **erzeugen keine einzige Erinnerung**. Vorfrist und Vier-Augen-Prinzip — standesrechtlicher Kanzleistandard und im Marketing versprochen ([site.ts](src/content/site.ts)) — existieren im Web-Datenmodell überhaupt nicht.

| Stufe                        | Score | Kernbefund                                                                                                    |
| ---------------------------- | ----- | ------------------------------------------------------------------------------------------------------------- |
| Erkennung im Dokument        | 82    | Regex+Zahlwörter solide („binnen vier Wochen" inzwischen abgedeckt ✓), Layer 5b mit §-Cross-Check             |
| Berechnung (Engine)          | 95    | frist-engine AT-korrekt inkl. Zustellfiktionen — Referenzqualität                                             |
| Berechnung (Web/UI)          | 70    | Feiertags-Verschiebung faktisch deaktiviert (state-Param wird nie übergeben), kein Kanzlei-Rechtsraum-Setting |
| Kontrolle (Vorfrist/4-Augen) | 50    | Engine-Fristenbuch komplett, Web-Modell kennt beides nicht                                                    |
| Erinnerung                   | 72    | Digest/WhatsApp/Notifications funktionieren — aber nur für das Web-System                                     |
| Systemkonsistenz             | 45    | Zwei Wahrheiten, keine Synchronisation, divergierende Rechtssemantik                                          |

---

## 2. Die Kette, wie sie heute läuft (verifizierter Trace)

```
ERKENNUNG                          BERECHNUNG                      SPEICHER
─────────                          ──────────                      ────────
① Scan-Button (Fristen-Seite,     legal-deadlines.ts              legal_deadline-Pages
   Akten-Tab) → /api/legal/        computeDueDate(rule, start)     + legal_case.frontmatter
   ai-deadlines → Regex+Zahlwort   ⚠ OHNE state → Feiertage aus      .deadlines[]
② Schnellanalyse (Post-Upload) →   ⚠ verhandlungsfreie Zeit fehlt  + .suggested_deadlines[]
   case-writeback:                                                   (⚠ keine UI dafür)
   suggested_deadlines +           frist-engine.ts (Engine)
   high-urgency → legal_deadline   §89a GOG, §222 ZPO, §33 AVG     deadline_calendar-Pages
   mit review_status:unreviewed    ✓ AT-korrekt                      (⚠ nur Chronologie liest sie)
③ Pipeline Layer 5+5b (Sonnet,        │
   §-validiert) ────────────────────▶─┴─▶ Fristenbuch (Engine):
④ ERV-Connector: Zustellfiktion           Vorfrist + Vier-Augen + ICS/VALARM
   § 89a GOG ✓ (Engine)                   ⚠ /api/legal/fristenbuch + deadlines.ics:
⑤ QuickCreate-Dialog (manuell,              VOM DASHBOARD NIE AUFGERUFEN
   DEADLINE_RULES-Picker)
                                   ERINNERUNG (liest NUR legal_case + legal_deadline)
KONTROLLE                          ├─ /api/cron/deadlines: Täglicher Digest (Mail+WhatsApp)
review_status approve/reject       ├─ /api/cron/deadline-reminders (Button „Erinnerungen senden")
im Akten-Fristen-Tab ✓             ├─ Topbar-Notifications (≤3 Tage / überfällig) ✓
Audit-Log (withDeadlineAudit) ✓    ├─ Copilot Proactive Alerts ✓
Vorfrist ✗   Vier-Augen ✗          └─ Kalender-Export-Seite: eigenes ICS aus legal_deadline
Fristenbuch-Ansicht ✗                 (⚠ Engine-ICS mit Vorfrist-VALARM ungenutzt)
```

---

## 3. Befunde

### P0 — Fristen ohne Erinnerung, Kontrolle ohne Modell

**F1 — Pipeline-Fristen erreichen keine einzige Erinnerungsfläche.**
Layer 5 extrahiert Fristen mit Sonnet, Layer 5b validiert sie gegen Paragraphen, das Ergebnis landet in `deadline_calendar`-Pages. Diese werden im gesamten Web-Code **nur von der Chronologie** gelesen ([chronology/route.ts](src/app/api/legal/chronology/route.ts)). Der tägliche Digest ([cron/deadlines/route.ts:49](src/app/api/cron/deadlines/route.ts)), die Fristen-Seite, der Kalender-Export und die Topbar-Notifications lesen ausschließlich `legal_case` + `legal_deadline`. **Eine Frist, die nur die Pipeline erkannt hat, löst nie eine Mail, nie eine Notification, nie einen Kalendereintrag aus.** Das Engine-Fristenbuch, das genau diese Pages klassifiziert und als ICS mit Vorfrist-VALARM serviert, hat null Aufrufer im Dashboard.

**F2 — Vorfrist und Vier-Augen-Prinzip fehlen im Web-Datenmodell.**
Beides ist standesrechtlicher Kanzleiorganisations-Standard (und Voraussetzung dafür, dass die Haftpflicht im Ernstfall zahlt), beides ist im Engine-Fristenbuch fertig implementiert (Vorfrist 7 Tage auf Werktag gezogen, Eskalation „kritisch ≤ 2 Werktage → Vier-Augen"), beides wird im Marketing versprochen — und beides kommt in `legal_deadline`, im QuickCreate-Dialog, auf der Fristen-Seite und im Cron **nicht vor** (einzige Fundstelle in `src/`: der Marketing-Text). Eine Frist kann heute von derselben Person angelegt und als erledigt markiert werden, ohne dass irgendjemand zweites draufschaut und ohne Vorfrist-Warnung.

### P1 — Berechnungs-Korrektheit im UI

**F3 — Feiertags-Verschiebung ist im Dashboard faktisch deaktiviert.**
`computeDueDate(rule, startDate, state?)` verschiebt Fristenden nur dann über Feiertage hinweg, wenn `state` (Bundesland/Kanton) übergeben wird — sonst nur Sa/So. Beide UI-Aufrufer ([deadlines/page.tsx:97](src/app/dashboard/deadlines/page.tsx), [DeadlineQuickCreateDialog.tsx:98](src/components/legal/DeadlineQuickCreateDialog.tsx)) übergeben **nie** einen state, und es gibt **kein Kanzlei-Setting** für Land/Bundesland/Kanton. Der ehrliche Hinweis („Gesetzliche Feiertage manuell prüfen") steht nur in der Berechnungsnotiz. Für eine AT-Kanzlei heißt das: Allerheiligen, Mariä Empfängnis etc. werden nie berücksichtigt — das angezeigte Fristende ist an solchen Tagen falsch (zu früh = konservativ, aber falsch im Fristenbuch).

**F4 — Divergierende Rechtssemantik zwischen den zwei Rechen-Engines.**
Die Web-Bibliothek rechnet AT-Fristen als generische Kalendertage; die verhandlungsfreie Zeit (§ 222 ZPO AT, 15.7.–17.8.), die Zustellfiktionen (§ 89a GOG, § 17/26 ZustG) und § 33 AVG-Sonderregeln existieren **nur** in der Engine-frist-engine. Der QuickCreate-Dialog nutzt die schwächere Web-Berechnung; das ERV-validierte Zustelldatum (der fristauslösende Tag!) wird beim manuellen Anlegen nicht als Fristbeginn angeboten, obwohl es als Page-Frontmatter vorliegt. Zwei Engines für dieselbe Rechtsfrage bedeuten außerdem: Sie driften unbemerkt auseinander (dieselbe Krankheit wie beim Pricing, die CLAUDE.md-weit per „eine kanonische Tabelle" gelöst wurde).

**F5 — `suggested_deadlines` versickern teilweise.**
Die Schnellanalyse schreibt erkannte Fristen als `suggested_deadlines` in die Akten-Frontmatter; nur high/critical-Fälle werden zusätzlich als `legal_deadline` mit `review_status: "unreviewed"` angelegt ([case-writeback.ts](src/lib/legal/case-writeback.ts)). Der Approve/Reject-Workflow im Akten-Fristen-Tab funktioniert ✓ — aber die **nicht**-dringenden Vorschläge haben keinerlei UI (0 Referenzen auf `suggested_deadlines` in Komponenten) und die globale Fristen-Seite unterscheidet unreviewed nicht sichtbar von bestätigten Fristen.

### P2 — Feinschliff

**F6 — `absolute_date_at`-Regel deutlich schwächer als die DE-Variante** ([ai-deadline-detect.ts:125](src/lib/ai-deadline-detect.ts)): nur `bis|frist|termin` als Trigger, während die DE-Regel ein breites Kontextfenster hat. AT-Formulierungen („längstens", „spätestens am", „binnen … ab Zustellung") gehören in beide.

**F7 — Zwei ICS-Wahrheiten.** Die Kalender-Export-Seite baut ein eigenes ICS aus `legal_deadline` (Download, ohne Vorfrist/VALARM); die Engine serviert ein Abo-fähiges ICS **mit** Vorfrist-VEVENTs und VALARMs. Nutzer bekommen die schlechtere Variante.

**F8 — Erledigt-Semantik im Digest:** `classify()` wertet `doneFlag === "done"`, die Fristen-Seite kennt aber auch andere Status — Konsistenz der Status-Vokabulare zwischen Frontmatter-Fristen, `legal_deadline` und Fristenbuch einmal festziehen.

**Positiv (nicht anfassen):** Zahlwort-Erkennung („binnen vier Wochen" — der P2 aus dem Live-Audit vom 30.06. ist **behoben**), Monatsfristen nach § 188 Abs. 2 BGB statt 30-Tage-Naivität, `noRoll` für Verjährung, Audit-Log auf Fristen-Aktionen, WhatsApp-Digest mit Template-Fallback, Dedupe des Digests pro Brain/Tag.

---

## 4. Härtungs-Blueprint

### Phase A — Eine Fristen-Wahrheit (P0, ~2–3 Tage)

- [ ] **A1** Sync-Schritt am Pipeline-Ende: Layer-5-Einträge aus `deadline_calendar` als `legal_deadline`-Pages materialisieren (`review_status: "unreviewed"`, `source: "pipeline"`, Dedupe gegen bestehende per Datum+Akte+Normbezug) — damit greifen Digest, Notifications, Fristen-Seite und Kalender sofort
- [ ] **A2** Alternativ/zusätzlich: Fristen-Seite + Cron auf `/api/legal/fristenbuch` als aggregierende Lesequelle umstellen (Engine kennt beide Welten) — Entscheidung dokumentieren, nicht beides halb
- [ ] **A3** Kalender-Export-Seite: Engine-ICS (`/api/legal/deadlines.ics`) als Abo-URL anbieten (mit Vorfrist-VALARM), Download-ICS als Fallback behalten
- **Akzeptanz:** Eine ausschließlich von der Pipeline erkannte Frist erscheint im nächsten Täglichen Digest und in der Topbar-Notification.

### Phase B — Vorfrist + Vier-Augen ins Produkt (P0, ~2–3 Tage)

- [ ] **B1** Datenmodell: `vorfrist_date` (Default: Fälligkeit − 7 Tage, auf Werktag gezogen — Logik aus fristenbuch.ts übernehmen) + `second_check: { by, at } | null` auf `legal_deadline`
- [ ] **B2** QuickCreate + Fristen-Seite: Vorfrist-Feld (vorbefüllt, editierbar); „Erledigt"-Aktion bei Notfristen (`DEADLINE_RULES`-Flag ergänzen) erfordert zweiten Nutzer oder expliziten Einzelfreigabe-Override mit Audit-Eintrag
- [ ] **B3** Cron + Notifications: Vorfrist als eigene Warnstufe („Vorfrist heute") vor der kritisch-Stufe
- [ ] **B4** Fristenbuch-Ansicht: chronologisches, filterbares Fristenbuch (Druck/PDF-tauglich) — Kanzleien müssen es bei Haftungsfällen vorlegen können; Datenquelle aus Phase A
- **Akzeptanz:** Jede Notfrist trägt Vorfrist + Vier-Augen-Status; das Fristenbuch ist als Liste exportierbar.

### Phase C — Rechtsraum-korrekte Berechnung (P1, ~2 Tage)

- [ ] **C1** Kanzlei-Setting „Rechtsraum": Land (DE/AT/CH) + Bundesland/Kanton in den Kanzlei-Einstellungen; als Default in beide `computeDueDate`-Aufrufe durchreichen
- [ ] **C2** AT-Berechnung an die Engine delegieren: für `jurisdiction: at` einen Engine-Endpoint auf frist-engine-Basis nutzen (Zustellfiktion, verhandlungsfreie Zeit, § 33 AVG) statt der Web-Duplikat-Semantik; Web-Lib bleibt für DE/CH + Offline-Fallback
- [ ] **C3** ERV-Zustelldatum als Fristbeginn: Hat die Akte eine ERV-Page, bietet QuickCreate deren `zustellDatum` als vorbefüllten Fristbeginn an (mit § 89a-GOG-Hinweis)
- [ ] **C4** Drift-Guard: Parity-Test Web-Lib ↔ frist-engine für die gemeinsamen Regelfälle (analog Engine-Parity-Pattern)
- **Akzeptanz:** AT-Berufungsfrist mit Ende in der verhandlungsfreien Zeit bzw. an Allerheiligen wird im Dashboard identisch zur frist-engine berechnet.

### Phase D — Erkennung & Vorschlags-Workflow (P1, ~1–2 Tage)

- [ ] **D1** `absolute_date_at` auf DE-Niveau heben (+ „längstens", „spätestens am", Zustellungs-Trigger); Golden-Set mit AT-Bescheiden/Urteilen erweitern
- [ ] **D2** `suggested_deadlines`-UI: Vorschlagsliste im Akten-Fristen-Tab (auch nicht-dringende) mit Übernehmen/Verwerfen; Zähler-Badge
- [ ] **D3** Fristen-Seite: `review_status: unreviewed` sichtbar markieren (Badge) + Filter
- **Akzeptanz:** Kein erkannter Fristvorschlag ist ohne UI-Weg zur Bestätigung.

### Phase E — Konsistenz & Verifikation (P2, ~1 Tag)

- [ ] **E1** Status-Vokabular vereinheitlichen (Frontmatter-Fristen ↔ legal_deadline ↔ Fristenbuch) + Migrations-Normalisierung
- [ ] **E2** E2E-Test: Upload → Pipeline-Frist → Digest-Mail (Phase-A-Akzeptanz automatisiert)
- [ ] **E3** Cron-Verdrahtung dokumentieren/prüfen (supercronic auf Hetzner: läuft `/api/cron/deadlines` täglich? Monitoring-Check ergänzen)

**Aufwand gesamt: ~8–11 Personentage.** Reihenfolge: A vor B (B braucht die eine Wahrheit), C parallel möglich, D/E danach.

---

## 5. Was ausdrücklich NICHT umgebaut wird

- **frist-engine.ts** — die AT-Rechtslogik ist korrekt und vollständig; sie wird Konsument, nicht Baustelle.
- **Zahlwort-/Regex-Erkennung** — „binnen vier Wochen" u. ä. funktionieren; nur die AT-Absolute-Regel wird nachgezogen.
- **Approve/Reject + Audit-Log im Akten-Tab** — richtiges Muster, wird auf die Vorschlagsliste ausgeweitet statt ersetzt.
- **Digest-Infrastruktur** (Mail + WhatsApp, Dedupe) — funktioniert; bekommt nur die vollständige Datenbasis und die Vorfrist-Stufe.
