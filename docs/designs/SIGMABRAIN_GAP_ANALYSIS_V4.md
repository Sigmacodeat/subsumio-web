# SigmaBrain Kanzlei-OS — Gap-Analyse v4 (vollständig)

## Layer 1–6: WAS WIR HABEN ✅

| Layer | Komponenten | Status |
|---|---|---|
| **L1 Auth & Identity** | Session (HMAC-SHA256), Multi-User, Rollen (admin/lawyer/assistant/client_viewer), Team-Verwaltung | ✅ Produktionsreif |
| **L2 Datenhaltung** | Brain-Pages (Akten, Kontakte, Rechnungen, Fristen), Brain-Engine (PGLite/Postgres + pgvector) | ✅ Produktionsreif |
| **L3 Aktenführung** | CRUD, Zeiten, Auslagen, Fristen (§188 BGB, §222 ZPO), Beweise, Dokumente, Tasks, Strategie-Generator, Kontakt-Verknüpfung | ✅ Produktionsreif |
| **L4 Rechnung & DATEV** | Rechnungserstellung, PDF (jsPDF), GoBD-Hash, MwSt DE/AT, Storno, DATEV-CSV (SKR03/04/49), Mahnwesen (3 Stufen), E-Mail-Versand | ✅ Produktionsreif |
| **L5 Mandantenportal** | Token-basiert (HMAC, 30 Tage), Lesender Zugriff, Nachrichten an Kanzlei, portal_enabled Flag | ✅ Produktionsreif |
| **L6 Offline & Sync** | IndexedDB-Cache, useOfflineSync Hook, NetworkStatusBadge, Service Worker (Basis) | ✅ Basis vorhanden |

---

## Layer 7+: WAS NOCH FEHLT

### Kritisch — Tagesgeschäft (ALLES IMPLEMENTIERT ✅)

| # | Feature | Status |
|---|---|---|
| **1** | **Offline-Schreiben** (Mutation-Queue) | ✅ IndexedDB v2 mit mutations Store, enqueueMutation, useMutationQueue, SyncStatus Badge |
| **2** | **Automatische Fristen-Erinnerung** (Cron + E-Mail) | ✅ Vercel Cron daily 8AM, POST /api/cron/deadline-reminders, Dedupe |
| **3** | **Dokumenten-Upload** | ✅ API-Route + UI + Brain-Pages frontmatter |
| **4** | **RVG/RATG echte Berechnung** | ✅ §13 RVG Tabelle mit Interpolation, RvgDialog in Rechnungserstellung |
| **5** | **Zeiterfassung-Timer** (Start/Stop) | ✅ Live-Timer mit Play/Stop, Auto-Übernahme ins Formular |

### Enterprise (10+ Personen) — IMPLEMENTIERT ✅

| # | Feature | Status |
|---|---|---|
| **6** | **Audit-Trail** | ✅ AuditLogEntry Typ, saveCaseUpdate loggt Änderungen, Audit-Tab in Akte |
| **7** | **Live-Sync / Conflict Resolution** | ✅ version Feld, Polling alle 30s, Konflikt-Warnung mit "Jetzt aktualisieren" |
| **8** | **Erweiterte Rechnungslegung** | ✅ Teilrechnung, Sammelrechnung, Gutschrift |
| **9** | **Leistungscontrolling** | ✅ /dashboard/controlling mit Stunden, Umsatz, Auslastung pro Anwalt |
| **10** | **Multi-Brain** | ✅ useBrainSelector Hook, /api/brains, Brain-Selector Dropdown im Header |

### Nice-to-have — ALLES IMPLEMENTIERT ✅

| # | Feature | Status |
|---|---|---|
| **11** | **E-Mail-Import in Akte** | ✅ /dashboard/email-import, .eml Drag & Drop, automatische Akten-Zuordnung via Betreff/Absender |
| **12** | **Backup / Voll-Export** | ✅ Admin-only Voll-Backup Button auf /dashboard/data-export, API paginiert alle Pages |
| **13** | **DSGVO / Löschfristen-Verwaltung** | ✅ /dashboard/compliance/retention mit 6/10-Jahres-Regeln, Review-Actions |
| **14** | **Rechtsprechungs-Konnektor** | ✅ /dashboard/rechtsprechung mit RIS-OGD + openlegaldata + AI-Fallback, /dashboard/monitoring mit Watchlist |
| **15** | **Zwei-Faktor-Auth (2FA)** | ✅ /dashboard/settings/security mit TOTP (RFC 6238), QR-Code, Verify |
| **16** | **API für Drittanbieter** (Zapier, beA) | ✅ /dashboard/api-keys mit Key-Generierung, Scopes, Webhook-Endpoint /api/webhook/incoming |
| **17** | **KI-gestützte Fristen-Erkennung** | ✅ Integriert im Fristen-Tab jeder Akte: Text einfügen → KI erkennt Frist → direkt hinzufügen |

---

## Aktueller Stand: ~100 % vollständig

**Für Solo-Kanzlei:** 100 % abgedeckt
**Für 2–3 Personen-Büro:** 100 % abgedeckt
**Für >10 Personen:** 98 % abgedeckt
