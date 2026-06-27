---
description: Selbst-Audit nach Optimierung - Phase 4-5 ( universell nach jedem /optimize-* Befehl ausführbar)
---

# Post-Optimization Audit & Stress-Test

> **Wann ausführen**: Direkt NACH jedem `/optimize-*` Befehl.
> Dieser Prompt verifiziert das Ergebnis systematisch und testet Edge-Cases.

## Phase 4 — Selbst-Audit

### 4.1 Checklist-Verifikation

Gehe JEDEN Punkt der Optimierungs-Checkliste aus dem ausgeführten `/optimize-*` Prompt durch:

- [ ] Wurde jeder Checklist-Punkt tatsächlich implementiert (nicht nur dokumentiert)?
- [ ] Gibt es Mock-Code, Platzhalter oder TODO-Kommentare?
- [ ] Sind alle Imports korrekt und am Datei-Anfang?
- [ ] Compiliert der Code ohne TypeScript-Errors?

### 4.2 Funktions-Audit

Beantworte für JEDE geänderte Datei:

- **Was kann ein Nutzer hier noch NICHT tun?**
- **Gibt es tote UI-Elemente** (Buttons ohne Handler, Links ohne Ziel)?
- **Gibt es inkonsistentes Verhalten** (z.B. Loading-State fehlt bei einer von 3 Aktionen)?
- **Würde ein Erstnutzer hier scheitern?** (Onboarding, Tooltips, Help-Text)
- **Entspricht es modernen SaaS-Standards?** (Vergleich: Linear, Notion, Stripe)

### 4.3 Code-Quality-Audit

- [ ] **Kein `any`** — alle Types explizit
- [ ] **Keine Magic Numbers** — Konstanten ausgelagert
- [ ] **Keine Duplikate** — DRY-Prinzip eingehalten
- [ ] **Error Boundaries** — try/catch an allen externen Calls
- [ ] **Loading States** — Skeleton/Spinner bei jeder Async-Operation
- [ ] **Empty States** — Illustration + CTA bei 0 Ergebnissen
- [ ] **Error States** — Retry-Button + User-friendly Message
- [ ] **Accessibility** — ARIA-Labels, Keyboard-Navigation, Focus-Trap
- [ ] **Responsive** — Mobile, Tablet, Desktop getestet

### 4.4 Test-Ausführung

Führe ALLE relevanten Test-Befehle aus dem `/optimize-*` Prompt aus:

```bash
# TypeScript Check
npx tsc --noEmit

# ESLint
npx eslint <scope-paths>

# Unit Tests
npx vitest run <scope>

# E2E Tests (falls verfügbar)
npx playwright test <scope>

# Build Check
npm run build
```

**Wenn ein Test fehlschlägt → zurück zur Implementierung, Fehler beheben, dann erneut auditen.**

---

## Phase 5 — Edge-Case & Stress-Test

### 5.1 Leere Daten

- [ ] Was passiert bei 0 Einträgen? (Empty State mit CTA)
- [ ] Was passiert bei null/undefined Werten? (Kein Crash, Graceful Fallback)
- [ ] Was passiert bei leerem Such-String? (Keine Error-Message, zeige alle)

### 5.2 Extreme Inhalte

- [ ] Sehr lange Texte (10.000+ Zeichen) — Word-Break, Truncation, Expand
- [ ] Sehr viele Einträge (1.000+ Rows) — Virtualization, Pagination, Lazy-Load
- [ ] Spezialzeichen (Emojis, Umlaute, Quotes, HTML) — Escaping, XSS-Schutz
- [ ] Unicode/RTL-Text — korrekte Darstellung

### 5.3 Schnelle Interaktion

- [ ] Rapid Klicking (10x schnell hintereinander) — Debounce, Disable während Request
- [ ] Doppel-Submit von Forms — Submit-Button disabled während Request
- [ ] Navigation während Loading — Abort Controller, Cleanup
- [ ] Gleichzeitige Edits — Optimistic UI + Conflict Resolution

### 5.4 Ungewöhnliche Reihenfolgen

- [ ] Delete → Undo → Delete → Undo (Mutation Queue korrekt?)
- [ ] Create → sofort Edit → Save (Race-Condition?)
- [ ] Filter setzen → Daten ändern → Filter noch korrekt?
- [ ] Tab schließen während Save — Warnung bei ungespeicherten Änderungen

### 5.5 Fehlerszenarien

- [ ] Netzwerk weg → Online-Indikator, Queue, Auto-Retry
- [ ] API 500 → User-friendly Error, Retry-Button, Support-Contact
- [ ] API 403 → Permission-Error, Hinweis auf benötigte Rolle
- [ ] API 429 → Rate-Limit-Message, Retry-After Countdown
- [ ] Timeout → Abbrechen-Button, Partial Results anzeigen

### 5.6 Security Edge-Cases

- [ ] XSS-Versuch in Input-Feldern — wird escaped?
- [ ] SQL-Injection in Such-Queries — wird parametrisiert?
- [ ] CSRF-Token abgelaufen — wird automatisch refreshed?
- [ ] Session abgelaumen mid-Action — wird Login-Flow getriggert?

---

## Phase 6 — Finaler System-Audit

### 6.1 Integration-Check

- [ ] Alle geänderten Module integrieren sauber mit Rest der Codebase?
- [ ] Gibt es Breaking Changes für andere Bereiche?
- [ ] Sind alle Shared Types/Interfaces aktualisiert?
- [ ] Werden andere Dashboard-Seiten beeinflusst?

### 6.2 Konsistenz-Check

- [ ] Visuelle Konsistenz: Spacing, Typo, Colors matchen Design-System?
- [ ] Funktionale Konsistenz: Gleiche Patterns wie in anderen Bereichen?
- [ ] State-Konsistenz: Globaler State korrekt bei Navigation zwischen Seiten?
- [ ] API-Konsistenz: Response-Format matcht andere Endpoints?

### 6.3 Go/No-Go Entscheidung

```
WENN alle Checks grün:
  → Status: PRODUKTIONSREIF
  → Summary: Was wurde optimiert, was wurde getestet, was ist das Ergebnis

WENN Checks rot:
  → Zurück zu /optimize-* und spezifische Probleme beheben
  → Danach erneut /verify-optimization ausführen
```

### 6.4 Dokumentation

- [ ] CHANGELOG-Eintrag falls relevant
- [ ] Breaking Changes dokumentiert
- [ ] Neue Patterns in CLAUDE.md oder docs/ aufgenommen (falls architektonisch relevant)
