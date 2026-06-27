# Subsumio Kanzlei-OS v4 — Tagesgeschäft Komplett

## Ziel

Die letzten 5 kritischen Lücken schließen, damit Subsumio für jede Kanzlei (Solo bis 5 Personen) das komplette Tagesgeschäft abdeckt.

---

## AP1: Zeiterfassung-Timer (Start/Stop/Reset)

### Datenmodell

- Timer-Läuft-State pro Akte (lokal im Component-State)
- `timerStartAt?: number` (Unix ms) in TimeEntry
- `timerRunning: boolean` pro Akte

### UI-Änderungen (Cases Detail → Zeiten-Tab)

- Start/Stop-Button neben der manuellen Eingabe
- Laufende Zeit-Anzeige (MM:SS)
- Bei Stop → Dialog: Beschreibung + Stundensatz
- Speichert als TimeEntry mit berechneten Minuten

### Edge-Cases

- Seite verlassen während Timer läuft → Warnung
- Browser-Refresh → Timer verloren (akzeptabel für v1)

---

## AP2: Offline-Schreiben (Mutation-Queue)

### Architektur

- IndexedDB-Store `mutations` (Queue von `{ id, type, slug, payload, createdAt }`)
- `useMutation` Hook ersetzt direkte `api.brain.*` Calls
- Bei Offline: Mutation in Queue speichern
- Bei Wiederverbindung: Queue abarbeiten (FIFO)

### Betroffene Mutationen

- `createPage` (Akte, Kontakt, Rechnung anlegen)
- `updatePage` (Akte bearbeiten, Zeit erfassen, Status ändern)
- `deletePage` (falls implementiert)

### UI

- Toast: "Offline — Änderungen werden bei Verbindung synchronisiert"
- Badge in Navbar zeigt ausstehende Mutationen an

---

## AP3: Automatische Fristen-Erinnerung (Vercel Cron)

### Architektur

- `vercel.json` mit `crons` Section
- `POST /api/cron/deadline-reminders` (existiert bereits)
- Täglich um 08:00 ausführen
- Prüft alle Fristen in den nächsten 3 Tagen
- Sendet E-Mail an Kanzlei-E-Mail-Adresse
- Speichert `reminder_sent_at`

### Konfiguration

- Kanzlei kann Zeitpunkt wählen (08:00, 09:00, etc.)
- Kanzlei kann Tage vor Frist wählen (1, 3, 7)

---

## AP4: Dokumenten-Upload

### Architektur

- `POST /api/upload` — Multipart-Form, speichert in Brain-Page
- Max 10MB pro Datei, erlaubt: PDF, DOC, DOCX, JPG, PNG
- Brain-Page `type: document` mit `file_name`, `file_size`, `mime_type`, `case_slug`
- Content = Base64-String (für PGLite-Speicherung)

### UI (Cases Detail → Dokumente-Tab)

- Drag & Drop Zone
- Datei-Liste mit Vorschau-Icon
- Download-Button
- Löschen-Button (nur Admin/Lawyer)

### Edge-Cases

- Datei zu groß → Fehlermeldung
- Ungültiger Typ → Fehlermeldung
- Base64-Storage limitiert auf ~5MB praktisch

---

## AP5: RVG/RATG Echte Gebührenberechnung

### Architektur

- `src/lib/rvg.ts` — RVG-Gebühren nach Streitwert (§13 RVG)
- Tabellen: Verfahrensgebühr, Terminsgebühr, Einigungsgebühr
- Ab 500€ bis 500.000€ Streitwert (lineare Interpolation)
- MwSt 19% auf Gebühren

### UI (Cases Detail → Kosten-Tab oder Rechnungserstellung)

- Streitwert eingeben
- Gebühren automatisch berechnen
- Als Rechnungsposition übernehmen

---

## Reihenfolge

1. AP1 (Zeiterfassung-Timer) — schnell, hoher Impact
2. AP2 (Offline-Schreiben) — kritisch, größtes Feature
3. AP3 (Automatische Erinnerungen) — schnell, kritisch
4. AP4 (Dokumenten-Upload) — mittel, wichtig
5. AP5 (RVG Berechnung) — groß, wichtig für DE

## Definition of Done

- [ ] TypeScript-Build fehlerfrei
- [ ] Keine `any`-Typen
- [ ] Error-States überall
- [ ] Offline-Fallback funktioniert
- [ ] Cron-Job läuft täglich
