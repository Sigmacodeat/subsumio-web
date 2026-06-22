# Subsumio Kanzlei-OS v3 — Tagesgeschäft Komplett

## Ziel
Die letzten 4 Lücken für vollumfängliches Kanzlei-Tagesgeschäft schließen.

---

## AP5: Multi-User / Rollen & Berechtigungen

### Datenmodell
- `User.role` erweitert: `"admin" | "lawyer" | "assistant" | "client_viewer"`
- Default für neue User: `lawyer`
- Berechtigungsmatrix:
  | Aktion | admin | lawyer | assistant | client_viewer |
  |---|---|---|---|---|
  | Rechnungen erstellen | ✅ | ✅ | ❌ | ❌ |
  | Rechnungen stornieren | ✅ | ✅ | ❌ | ❌ |
  | Rechnung senden (E-Mail) | ✅ | ✅ | ✅ | ❌ |
  | Zeiten erfassen (alle Akten) | ✅ | ✅ | ✅ | ❌ |
  | Zeiten erfassen (nur eigene) | ✅ | ✅ | ✅ | ❌ |
  | Fristen ändern | ✅ | ✅ | ✅ | ❌ |
  | Kontakte anlegen | ✅ | ✅ | ✅ | ❌ |
  | Portal-Link generieren | ✅ | ✅ | ❌ | ❌ |
  | Settings ändern | ✅ | ❌ | ❌ | ❌ |
  | User verwalten | ✅ | ❌ | ❌ | ❌ |

### UI-Änderungen
- `settings/page.tsx`: Tab "Team" mit User-Liste, Rolle ändern, Einladung
- `cases/[slug]/page.tsx`: Buttons deaktivieren wenn `!canEdit`
- `invoicing/page.tsx`: Buttons deaktivieren wenn `!canInvoice`
- `contacts/page.tsx`: "Anlegen" nur wenn `canEdit`

### API
- `GET /api/team` — User-Liste (nur admin)
- `POST /api/team/role` — Rolle ändern (nur admin)

---

## AP6: E-Mail-Versand (Rechnung an Mandant)

### Datenmodell
- `KanzleiSettings` erweitert:
  - `smtpHost?: string`
  - `smtpPort?: string`
  - `smtpUser?: string`
  - `smtpPassword?: string`
  - `smtpSecure?: boolean`
  - `emailFrom?: string`

### API
- `POST /api/invoices/send` — Rechnung als E-Mail an Mandant
  - Body: `{ invoiceSlug, toEmail }`
  - Baut E-Mail mit PDF-Anhang
  - Nutzt SMTP aus KanzleiSettings
  - Speichert `email_sent_at`, `email_sent_to`

### UI
- `invoicing/page.tsx`: "Per E-Mail senden"-Button neben PDF-Download
  - Dialog mit E-Mail-Adresse (default aus Kontakt)
  - Erfolg/Fehler-Toast

### Edge-Cases
- SMTP nicht konfiguriert → Fehlermeldung + Settings-Link
- Keine E-Mail-Adresse beim Kontakt → Input-Feld

---

## AP7: Mahnwesen

### Datenmodell
- `Invoice` erweitert:
  - `reminderCount?: number` (0, 1, 2, 3)
  - `reminderSentAt?: string[]`
  - `reminderFee?: number`

- Mahngebühren nach RVG § 11:
  - 1. Mahnung: 50 % Gebühr (mind. 20 €)
  - 2. Mahnung: 1,0 Gebühr
  - 3. Mahnung: 1,3 Gebühr

### API
- `POST /api/invoices/remind` — Mahnung generieren + E-Mail senden
  - Erhöht `reminderCount`
  - Berechnet Mahngebühr
  - Erzeugt Mahn-PDF
  - Sendet E-Mail mit Mahn-PDF

### UI
- `invoicing/page.tsx`: "Mahnung senden"-Button bei `status=overdue`
  - Zeigt Mahnstufe an (1., 2., 3. Mahnung)
  - Zeigt Mahngebühr an
  - Mahn-PDF Download

---

## AP8: E-Mail-Erinnerungen (Fristen)

### Architektur
- Cron-fähige API-Route: `POST /api/cron/deadline-reminders`
  - Prüft alle Fristen in den nächsten 3 Tagen
  - Sendet E-Mail an zuständigen Anwalt
  - Speichert `reminder_sent_at` in Deadline
- Dashboard: Button "Erinnerungen jetzt senden" für manuellen Trigger

### Datenmodell
- `DeadlineEntry` erweitert:
  - `reminder_sent_at?: string`

### UI
- `cases/[slug]/page.tsx`: Fristen-Tab zeigt Erinnerungs-Status
- `deadlines/page.tsx`: "Erinnerungen senden"-Button

---

## Reihenfolge
1. AP5 (Multi-User) — fundamentale Basis
2. AP6 (E-Mail-Versand) — nutzt SMTP-Config
3. AP7 (Mahnwesen) — baut auf E-Mail-Versand auf
4. AP8 (E-Mail-Erinnerungen) — baut auf SMTP + Cron auf

## Definition of Done
- [ ] TypeScript-Build fehlerfrei
- [ ] Keine `any`-Typen
- [ ] Berechtigungsprüfung überall
- [ ] Error-States für SMTP-Fehler
- [ ] Mahn-PDF mit korrekter Gebühr
