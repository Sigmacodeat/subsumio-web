# SigmaBrain Kanzlei-OS v2 — Umsetzungs-Blueprint

## Ziel
Vier Features aus dem Statusbericht auf Produktionsreife heben. Jedes Paket ist vollständig (CRUD, Error, Empty, Edge-Cases), nicht fragmentiert.

---

## AP1: Kontakte in Akten verknüpfen

### Datenmodell
- `legal_case` Frontmatter erweitert:
  - `client_slug?: string` — Referenz auf `legal_contact` (role=client)
  - `opponent_slugs?: string[]` — Referenzen auf `legal_contact` (role=opponent)
  - `court_slug?: string` — Referenz auf `legal_contact` (role=court)
  - `own_lawyer_name?: string` — Bleibt als String (eigener Bearbeiter)
- Abwärtskompatibel: `client_name` bleibt als Fallback-String erhalten.

### UI-Änderungen
- `cases/[slug]/page.tsx`: Bearbeitungsmodus für Stammdaten
  - Dropdown "Mandant" mit Suche aus Kontakten
  - Dropdown "Gegner" (multi-select)
  - Dropdown "Gericht"
  - "Neuen Kontakt anlegen"-Shortcut
- `cases/page.tsx`: Mandanten-Name aus verknüpftem Kontakt anzeigen (mit Fallback)
- `contacts/page.tsx`: Verknüpfte Akten pro Kontakt anzeigen
- `invoicing/page.tsx`: Mandanten-Adresse aus Kontakt laden für Rechnungskopf

### API / Helpers
- Neue Helper: `resolveContact(slug) => ContactItem | null`
- Neue Helper: `resolveCaseContacts(casePage) => { client, opponents, court }`

---

## AP2: Mandantenportal mit Token-Login

### Architektur-Entscheidung
- Kein zweites Auth-System. Mandanten bekommen einen **zeitlich begrenzten Token** (JWT, 30 Tage) pro Akte.
- Token in URL: `/portal/[token]` → validiert → zeigt nur diese Akte.
- Token-Signierung mit HMAC-SHA256, separates Secret `PORTAL_TOKEN_SECRET`.

### Datenmodell
- Kein neues DB-Schema. Token ist stateless JWT.
- `legal_case` Frontmatter: `portal_enabled: boolean` (bereits vorhanden), `portal_token_expires?: string`

### API
- `POST /api/portal/generate` — Anwalt generiert Token für Akte (Session-auth)
- `GET /api/portal/verify?token=...` — Token validieren, Case-Daten zurückgeben
- `POST /api/portal/message` — Mandant sendet Nachricht (stored als Brain-Page type=portal_message)

### UI
- `app/portal/[token]/page.tsx` — Mandantenansicht
  - Akte-Header (nur Titel, Status, AZ)
  - Dokumentenliste (nur titel + download-link)
  - Fristen-Timeline (nur lesend)
  - Nachrichten-Thread (lesen + schreiben)
  - Keine Bearbeitung, kein Zugriff auf andere Akten
- `app/dashboard/cases/[slug]/page.tsx`: "Portal-Link generieren"-Button mit Copy-to-Clipboard

### Edge-Cases
- Abgelaufener Token → "Link ist abgelaufen, kontaktieren Sie Ihren Anwalt"
- Ungültiger Token → 404-Seite
- Akte gelöscht → "Akte nicht gefunden"

---

## AP3: DATEV-Export ausbauen

### Datenmodell
- `KanzleiSettings` erweitert:
  - `datevKontenrahmen?: "SKR03" | "SKR04" | "SKR49"` (Default: SKR03)
  - `datevSteuerberaterBeraterNr?: string`
  - `datevMandantenNr?: string`
- Neue Konstanzen:
  - `KONTENRAHMEN_SKR03`, `SKR04`, `SKR49` mit Konten für Honorar (8400/4400), Auslagen (4900/1800), USt (1776/1776)

### Export-Logik
- Erweiterte CSV-Spalten (DATEV-konformer):
  ```
  USt-ID;Datum;Belegnr;Buchungstext;Konto;Gegenkonto;Betrag;Steuerkennzeichen;Kostenstelle;Mandant;Stunden;Typ;Rechnungsnummer
  ```
- Steuerkennzeichen je nach USt-Satz:
  - 19% DE → Steuerkennzeichen: 19
  - 20% AT → Steuerkennzeichen: 20
  - 0% (Ausland) → Steuerkennzeichen: 0
- Periodenauswahl im UI (von/bis Monat)
- Nur abgerechnete (`billed: true`) Positionen
- Zusammenfassung pro Monat

### UI
- `datev-export/page.tsx`:
  - Dropdown Kontenrahmen
  - Input Berater-Nr / Mandanten-Nr
  - Date-Range-Picker (von/bis)
  - Vorschau-Tabelle mit allen Feldern
  - Download CSV (UTF-8-BOM für Excel)
  - Copy-to-Clipboard

---

## AP4: PDF-Rechnung

### Technologie
- Client-seitig: `jspdf` + `jspdf-autotable` (kein Server-Rendering nötig)
- Kein Puppeteer (zu schwer, braucht Chromium)

### PDF-Inhalt
- Kanzlei-Kopf (Name, Adresse, Email, Telefon, Kammer, USt-ID)
- Mandanten-Adresse (aus verknüpftem Kontakt)
- Rechnungsdetails (Nummer, Datum, Fälligkeit, AZ)
- Tabelle: Posten (Datum, Beschreibung, Stunden, Satz, Betrag)
- Tabelle: Auslagen (falls vorhanden)
- Summenblock (Honorar netto, Auslagen netto, MwSt, Vorschuss, Gesamtbetrag)
- Zahlungsinformationen (IBAN, BIC, Bank)
- Fußzeile (konfigurierbar)
- GoBD-Hash im Footer als maschinenlesbarer Hinweis

### UI
- `invoicing/page.tsx`: "PDF herunterladen"-Button neben Drucken
- Async-Generierung, Loading-State

---

## Abhängigkeiten
- AP1 muss vor AP2 (Kontakt-Referenzen für Portal-Adresse)
- AP1 muss vor AP4 (Mandanten-Adresse aus Kontakt für PDF)
- AP1 + AP3 sind unabhängig
- Reihenfolge: AP1 → AP3 → AP4 → AP2

## Definition of Done (gesamt)
- [ ] Alle 4 Pakete vollständig implementiert
- [ ] `npx tsc --noEmit` fehlerfrei
- [ ] Kein Mock-Data, keine Platzhalter-UI
- [ ] Error-States, Loading-States, Empty-States überall
- [ ] Edge-Cases behandelt (abgelaufene Tokens, fehlende Kontakte, leere Exporte)
- [ ] Keine `any`-Typen in neuem Code
- [ ] Alle neuen API-Routen mit Rate-Limiting
