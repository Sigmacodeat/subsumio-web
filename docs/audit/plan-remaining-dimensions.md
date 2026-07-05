# Was nach den 4 abgeschlossenen Runden noch offen ist (2026-07-05)

Die bisherigen vier Runden (IST-Audit → Fristensystem/P0-P2 → Vertrauens-Standard+Admin-Hub →
Daily-Use-Readiness) haben **Workflow-Vollständigkeit** hergestellt — jede Funktion, die ein
Anwalt im Alltag anfasst, funktioniert jetzt lückenlos und ist verifiziert. Das ist NICHT dasselbe
wie "marktreif in jeder Dimension". Folgende Dimensionen wurden bisher bewusst nicht geprüft:

## 1. Sicherheit (noch komplett ungeprüft)

Auth/RBAC-Durchsetzung über alle ~150 Routen hinweg, Input-Validierung an allen API-Boundaries,
Secrets-Handling (DocuSign/WhatsApp/SMTP-Tokens), Rate-Limiting, CSRF-Abdeckung außerhalb der
Screens, die wir zufällig gesehen haben, Mandantenportal-Token-Sicherheit (frisch gebaut — nie
sicherheitsseitig geprüft). **Empfehlung: `/security-review` als eigener Durchlauf, höchste
Priorität, weil das Portal + Trust-Accounts + Mandantendaten reale Angriffsfläche sind.**

## 2. Performance/Skalierung (ungeprüft)

Alles wurde mit einer kleinen/leeren Testdatenbank verifiziert. Ungeprüft: DB-Query-Muster bei
1000+ Akten (N+1-Risiko in `batch-list`-Aufrufen, die wir mehrfach gesehen haben), Bundle-Größe
nach all den neuen Komponenten, Ladezeiten der Insights-Engine (berechnet aktuell live pro
Request), Core Web Vitals.

## 3. Barrierefreiheit (nur ein Datenpunkt bekannt)

Bekannt ist nur, dass Single-Key-Shortcuts laut Code-Kommentar WCAG-2.1.4-konform abschaltbar
sind — das ist ein Einzelfund, keine Prüfung. Tastaturnavigation, Screenreader-Labels, Farbkontrast
im Dark Mode: ungeprüft.

## 4. Echte End-to-End-Tests im Browser (ungeprüft)

Alle Verifikationen in den letzten vier Runden liefen über `tsc`/`vitest`/`next build` — nie
wurde ein Flow tatsächlich in einem Browser durchgeklickt. Besonders die frisch gebauten,
sicherheitsrelevanten Loops (Fristen-Sync zwischen den drei UIs, DocuSign-Signatur-Rückschluss,
Aktenschließungs-Checkliste, Mandantenportal-Upload) haben keinen einzigen Playwright-Test.
**Das ist der Punkt mit dem größten Rest-Risiko**, weil genau diese Loops in den letzten Runden
mehrfach "sah fertig aus, war es aber nicht" waren (Notfrist-Guard, tote Cron-Einträge) — ohne
echten Browser-Test verlassen wir uns weiterhin nur auf Code-Lesen.

## 5. Visuelles/Layout-Feinschliff (deine Frage: "pixelgenau")

Ja, das ist der logische nächste Schritt, sobald Backend/Workflow steht — aber das ist eine
andere Disziplin als alles bisher Gemachte (Code-Audit vs. visuelle Prüfung). Dafür gibt es im
Projekt bereits die passenden Werkzeuge: **`/design-review`** (visueller Polish-Audit) und
**`/qa`** (Klick-Test auf Bugs). Ich würde das NICHT durch weiteres Code-Grep simulieren, sondern
tatsächlich im Preview durchklicken/screenshotten — sonst wiederholen wir den Fehler, "fertig"
zu behaupten, ohne es gesehen zu haben.

## 6. Copilot — deine konkrete Frage

Solide, kein Stub, aber "perfekt" ist unbewiesen (siehe oben — nur Code gelesen, nicht bedient).
Konkrete Kandidaten für einen Polish-Durchgang: Resize-Grenzfälle, Mobile-Swipe-Drawer-Gefühl,
Activity-Modus-Vollständigkeit gegen alle Seiten (nicht nur Cases).

## 7. Kleinere, bisher nur am Rande gestreifte Bereiche

- **Onboarding-Wizard-Reibung** (aus Runde 1 bekannt: fragt mitten im Flow nach WhatsApp-Config,
  nie behoben)
- **Billing/Stripe-Integration** (Webhooks, Dunning bei fehlgeschlagener Zahlung, Upgrade/
  Downgrade) — nie tief geprüft
- **DSGVO-Datenexport** (Art. 20) — als "real" eingestuft, nie im Detail verifiziert
- **Team-/ACL-Rechtedurchsetzung** über alle Screens hinweg — nur stichprobenartig gesehen
- **i18n-Vollständigkeit** außerhalb des Portals — wir haben nur das Portal systematisch geprüft,
  nicht das gesamte Dashboard
- **Dokumentation** (`README.md`, `CLAUDE.md`, `docs/`) — laut Projektregeln muss nach jedem Ship
  `/document-release` laufen; bisher wurde nichts committed/geshippt, also noch nicht fällig, aber
  bei Erst-Ship ein Pflichtschritt

## Empfohlene Reihenfolge

1. **`/security-review`** — höchstes Risiko, nie geprüft, schnell durchführbar
2. **Playwright-E2E für die 4-5 kritischsten Loops** (Fristen-Sync, DocuSign, Aktenschließung,
   Portal-Upload) — schließt die Lücke "wir haben nie tatsächlich geklickt"
3. **`/design-review`** — dein "pixelgenau"-Wunsch, jetzt wo Backend steht der richtige Zeitpunkt
4. Performance/Skalierung — erst relevant, wenn reale Nutzungsdaten/Lasttests möglich sind
5. Rest (Onboarding, Billing, DSGVO, i18n-Vollsweep, a11y) — nachgelagert, kein Blocker für Go-Live
