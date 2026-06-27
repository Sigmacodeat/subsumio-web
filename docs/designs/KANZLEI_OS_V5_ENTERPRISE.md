# Subsumio Kanzlei-OS v5 — Enterprise / Großkanzlei (10+ Personen)

## Warum ist 10+ anders als 5?

| Aspekt                      | 1–5 Personen                | 10+ Personen                                         |
| --------------------------- | --------------------------- | ---------------------------------------------------- |
| **Konkurrierende Zugriffe** | Selten, manuell koordiniert | Täglich, erfordert Live-Sync                         |
| **Rechnungslegung**         | Eine Rechnung = eine Akte   | Teilrechnungen, Sammelrechnungen, Gutschriften       |
| **Arbeitszeiterfassung**    | Einfache Stundenerfassung   | Leistungsziele, Umsatz pro Anwalt, Controlling       |
| **Büromanagement**          | Nicht nötig                 | Raumbelegung, Urlaubsplanung, Sitzungsdienste        |
| **Compliance**              | GoBD reicht                 | Vier-Augen-Prinzip, Audit-Trail, Verschlüsselung     |
| **Performance**             | Kein Thema                  | Pagination, Caching, DB-Optimierung                  |
| **Multi-Standort**          | Eine Kanzlei                | Zwei Standorte = getrennte Daten + Zentralverwaltung |

---

## AP1: Live-Sync (Conflict Resolution)

### Problem

Anwalt A und Anwalt B bearbeiten gleichzeitig dieselbe Akte → wer gewinnt?

### Lösung

- **Optimistic Locking**: `version` Feld in jedem BrainPage
- **Live-Sync**: WebSocket/SSE für Echtzeit-Updates
- **Conflict UI**: "Anwalt B hat diese Akte gerade geändert. Zusammenführen?"
- **Last-Write-Wins** mit Warnung (für v1 akzeptabel)

### Datenmodell

```
BrainPage.version: number (auto-increment)
BrainPage.lastModifiedBy: userId
BrainPage.lastModifiedAt: ISO timestamp
```

---

## AP2: Audit-Trail (Unveränderliches Log)

### Problem

"Wer hat wann was geändert?" — Pflicht bei >10 Personen + Compliance.

### Lösung

- **`audit_log` Array** in jeder Akte: `{ action, user, timestamp, field, oldValue, newValue }`
- **Schreibschutz**: Audit-Log kann nie gelöscht werden
- **Filter**: Zeige nur Änderungen an Fristen, Zeiten, Status

### API

- `GET /api/cases/[slug]/audit` — Audit-Log für eine Akte

---

## AP3: Erweiterte Rechnungslegung

### Neue Features

- **Teilrechnung**: Rechnung für nur einen Teil der Zeiten/Auslagen
- **Sammelrechnung**: Mehrere Akten auf einer Rechnung
- **Gutschrift**: Negative Rechnung (Storno nach Zahlung)
- **Anzahlungsabrechnung**: Vorschuss wurde geleistet → Abrechnen

### Datenmodell

```
Invoice.type: "standard" | "teilrechnung" | "sammelrechnung" | "gutschrift"
Invoice.parentInvoiceId?: string (für Teilrechnungen)
Invoice.caseSlugs?: string[] (für Sammelrechnungen)
```

---

## AP4: Leistungscontrolling (Arbeitszeit & Umsatz)

### Neue Features

- **Stundenziel pro Anwalt**: z. B. 1.500 Std./Jahr
- **Umsatz pro Anwalt**: Summe aller Rechnungen × Honorar
- **Auslastung**: Gebuchte Stunden / Ziel-Stunden
- **Dashboard**: Top-Performer, Auslastungs-Heatmap

### UI

- Neuer Tab "Controlling" im Dashboard
- Monatliche/ jährliche Übersicht
- Export als CSV

---

## AP5: Multi-Brain / Multi-Standort

### Problem

Kanzlei hat Standort Wien und Standort Graz. Getrennte Daten, gemeinsame Verwaltung.

### Lösung

- **Brain-Auswahl**: Dropdown "Wien" vs "Graz"
- **Federated Search**: Suche über alle Brains gleichzeitig
- **Cross-Brain Linking**: Akte in Wien verlinkt mit Kontakt in Graz
- **Zentralverwaltung**: Admin sieht alle Brains, kann Nutzer zuweisen

---

## Implementierungs-Reihenfolge

1. **AP2 Audit-Trail** — schnell, hoher Compliance-Impact
2. **AP1 Live-Sync (basic)** — `version` Feld + Warnung bei Konflikt
3. **AP3 Erweiterte Rechnungslegung** — Teilrechnung + Sammelrechnung
4. **AP4 Controlling** — Stundenziele + Umsatz-Dashboard
5. **AP5 Multi-Brain** — größtes Feature, erst nach den anderen
