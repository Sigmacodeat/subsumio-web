# SaaS Admin Dashboard — Blueprint & Gap Audit

**Datum:** 2026-06-26  
**Status:** Audit der bestehenden Admin-Oberfläche + Blueprint für fehlende Features

---

## 1. Bestand — Was existiert heute

### Seiten

| Route            | Datei                            | Status                                      |
| ---------------- | -------------------------------- | ------------------------------------------- |
| `/admin`         | `src/app/admin/page.tsx`         | ✅ Kunden-Tabelle, Sales-Leads, Audit-Trail |
| `/admin/mailbox` | `src/app/admin/mailbox/page.tsx` | ✅ Eingehende E-Mails (Resend Receiving)    |

### Komponenten

| Datei                                     | Status                      |
| ----------------------------------------- | --------------------------- |
| `src/components/admin/audit-trail.tsx`    | ✅ Audit-Log mit Filterung  |
| `src/app/admin/mailbox/MailboxClient.tsx` | ✅ Mailbox-Client mit Reply |

### API-Routen

| Route                       | Status             |
| --------------------------- | ------------------ |
| `/api/audit`                | ✅ Audit-Log lesen |
| `/api/email/dev-catch`      | ✅ Dev-Mail-Catch  |
| `/api/email/webhook/resend` | ✅ Resend Webhook  |

### Features die funktionieren

- ✅ Kundenliste (Name, E-Mail, Plan, Rolle, Referrals, Registrierungsdatum)
- ✅ MRR-Berechnung (hartcodiert: pro=79€, team=290€ — **FALSCH**, sollte 890/1290 sein)
- ✅ Sales-Leads aus Marketing-Agent
- ✅ Audit-Trail mit Filterung
- ✅ Mailbox für eingehende E-Mails
- ✅ Middleware-Schutz: `session.role !== "admin"` → redirect

---

## 2. Gap-Analyse — Was fehlt für ein vollständiges SaaS Admin

### 🔴 Kritisch (P0)

#### 2.1 User-Management (CRUD)

- **Fehlt:** User bearbeiten (Plan ändern, Rolle ändern, User deaktivieren/aktivieren)
- **Fehlt:** User-Suche und Filterung (nach Plan, Rolle, Status)
- **Fehlt:** User-Detail-Ansicht (Brain-ID, Org, API-Keys, 2FA-Status, letzte Aktivität)
- **Fehlt:** Password-Reset für User (Admin-Force-Reset)
- **Fehlt:** User löschen (DSGVO-konform)
- **Code-Ort:** `src/app/admin/page.tsx` — nur read-only Tabelle
- **API-Need:** `PATCH /api/admin/users/[id]`, `DELETE /api/admin/users/[id]`

#### 2.2 Plan-Management

- **Fehlt:** Plan für User ändern (Upgrade/Downgrade ohne Stripe)
- **Fehlt:** Plan-Limits überschreiben (Custom-Limits pro User)
- **Fehlt:** Trial-Verwaltung (Trial starten, verlängern, beenden)
- **Fehlt:** MRR-Berechnung korrigieren (aktuell hartcodiert mit falschen Werten)
- **Code-Ort:** `src/app/admin/page.tsx:69` — `u.plan === "pro" ? 79 : u.plan === "team" ? 290 : 0`
- **Soll:** MRR aus `BILLABLE_PLANS.monthlyEur` berechnen

#### 2.3 Billing & Stripe-Management

- **Fehlt:** Stripe-Kunden-Suche (Customer ID, Subscription Status)
- **Fehlt:** Subscription kündigen/pausieren (Admin-Override)
- **Fehlt:** Refunds auslösen
- **Fehlt:** Invoice-Übersicht pro User
- **Fehlt:** Stripe-Webhook-Logs
- **Code-Ort:** Neu — `src/app/admin/billing/`

### 🟡 Wichtig (P1)

#### 2.4 System-Health & Monitoring

- **Fehlt:** Engine-Status (Online/Offline, Version, Latency)
- **Fehlt:** Database-Health (Connections, Slow Queries, Disk Usage)
- **Fehlt:** Container-Status (CPU, Memory, Disk)
- **Fehlt:** Error-Rate (Sentry-Integration)
- **Fehlt:** API-Response-Times
- **Code-Ort:** Neu — `src/app/admin/system/`

#### 2.5 Feature-Flags & Konfiguration

- **Fehlt:** Feature-Flags togglen (pro User, pro Org, global)
- **Fehlt:** Maintenance-Mode aktivieren
- **Fehlt:** Environment-Variablen anzeigen (read-only, maskiert)
- **Fehlt:** Cron-Job-Status (Last Run, Next Run, Duration)
- **Code-Ort:** Neu — `src/app/admin/config/`

#### 2.6 Usage & Quota-Management

- **Fehlt:** Usage-Übersicht aller User (Queries, Storage, WhatsApp)
- **Fehlt:** Quota-Overrides pro User
- **Fehlt:** Usage-Alerts konfigurieren
- **Fehlt:** Overage-Costs-Bericht
- **Code-Ort:** Neu — `src/app/admin/usage/`

### 🟢 Nice-to-Have (P2)

#### 2.7 Org-Management

- **Fehlt:** Organisationen listen/bearbeiten
- **Fehlt:** Org-Owner ändern
- **Fehlt:** Shared-Brain-Status
- **Fehlt:** Seat-Verwaltung
- **Code-Ort:** Neu — `src/app/admin/orgs/`

#### 2.8 Security & Compliance

- **Fehlt:** Active-Sessions pro User (Session-Liste, Force-Logout)
- **Fehlt:** 2FA-Status aller User
- **Fehlt:** API-Key-Management (alle API-Keys listen, revoke)
- **Fehlt:** IP-Allowlist-Verwaltung
- **Fehlt:** DSGVO-Export/Delete pro User
- **Fehlt:** Audit-Log-Export (CSV/JSON)
- **Code-Ort:** Neu — `src/app/admin/security/`

#### 2.9 Communications

- **Fehlt:** E-Mail-Templates bearbeiten (Welcome, Reset, Digest)
- **Fehlt:** Broadcast-Email an alle User
- **Fehlt:** WhatsApp-Status (Connected, Queue, Errors)
- **Code-Ort:** Neu — `src/app/admin/comms/`

#### 2.10 Analytics & Insights

- **Fehlt:** Activation-Funnel (Signup → Onboarding → First Query)
- **Fehlt:** Retention-Curve
- **Fehlt:** Churn-Tracking
- **Fehlt:** Feature-Usage-Heatmap
- **Fehlt:** Conversion-Rate (Free → Pro → Team)
- **Code-Ort:** Neu — `src/app/admin/analytics/`

---

## 3. Architektur-Blueprint

### Datei-Struktur

```
src/app/admin/
├── page.tsx                    # Dashboard-Übersicht (Stats + Quick-Actions)
├── users/
│   ├── page.tsx                # User-Liste mit Suche/Filter
│   └── [id]/page.tsx           # User-Detail (Bearbeiten, Sessions, Usage)
├── billing/
│   ├── page.tsx                # Stripe-Übersicht (MRR, Subscriptions, Invoices)
│   └── [userId]/page.tsx       # Billing-Detail pro User
├── system/
│   └── page.tsx                # Health, Engine, DB, Cron-Status
├── config/
│   └── page.tsx                # Feature-Flags, Maintenance-Mode, Env-Vars
├── usage/
│   └── page.tsx                # Usage-Übersicht aller User
├── orgs/
│   ├── page.tsx                # Org-Liste
│   └── [id]/page.tsx           # Org-Detail
├── security/
│   └── page.tsx                # Sessions, 2FA, API-Keys, IP-Allowlist
├── comms/
│   └── page.tsx                # E-Mail-Templates, Broadcast, WhatsApp-Status
├── analytics/
│   └── page.tsx                # Funnel, Retention, Churn, Conversion
├── mailbox/                    # ✅ Existiert bereits
│   ├── page.tsx
│   └── MailboxClient.tsx
└── layout.tsx                  # Admin-Shell mit Sidebar-Navigation

src/components/admin/
├── audit-trail.tsx             # ✅ Existiert bereits
├── admin-sidebar.tsx           # Neu: Navigation zwischen Admin-Bereichen
├── admin-stat-card.tsx         # Neu: Wiederverwendbare Stat-Karte
├── user-table.tsx              # Neu: User-Tabelle mit Suche/Filter
├── user-detail-form.tsx        # Neu: User-Bearbeitungsformular
├── system-health-card.tsx      # Neu: Health-Check-Karte
├── feature-flag-toggle.tsx     # Neu: Feature-Flag-Switch
├── usage-bar-chart.tsx         # Neu: Usage-Visualisierung
└── plan-badge.tsx              # Neu: Plan-Badge mit Farbe

src/app/api/admin/
├── users/
├── [id]/route.ts               # PATCH (update), DELETE (deactivate)
├── billing/
├── system/health/route.ts      # GET: Engine, DB, Container-Status
├── config/feature-flags/route.ts # GET/PUT: Feature-Flags
└── analytics/funnel/route.ts   # GET: Activation-Funnel
```

### Admin-Layout

```
┌─────────────────────────────────────────────────────┐
│  Admin Dashboard                          [← Dashboard] │
├──────────┬──────────────────────────────────────────┤
│          │                                              │
│ Overview │  Stats: Users | MRR | Active | Churn       │
│ Users    │                                              │
│ Billing  │  ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│ System   │  │ Kunden  │ │ MRR     │ │ Active  │      │
│ Config   │  │   42    │ │ 4.2k€   │ │   38    │      │
│ Usage    │  └─────────┘ └─────────┘ └─────────┘      │
│ Orgs     │                                              │
│ Security │  [Tabelle / Charts / Forms]                 │
│ Comms    │                                              │
│ Analytics│                                              │
│ Mailbox  │                                              │
│ Audit    │                                              │
│          │                                              │
└──────────┴──────────────────────────────────────────┘
```

---

## 4. Priorisierung & Implementierungs-Reihenfolge

### Phase 1 (Sofort — P0)

1. **Admin-Layout mit Sidebar** — `src/app/admin/layout.tsx`
2. **User-Management CRUD** — Liste + Detail + Edit + Deactivate
3. **MRR-Korrektur** — `BILLABLE_PLANS.monthlyEur` statt hartcodiert
4. **Plan-Override** — Admin kann Plan ohne Stripe ändern

### Phase 2 (Kurzfristig — P1)

5. **System-Health** — Engine, DB, Cron-Status
6. **Usage-Übersicht** — Alle User, Quota-Overrides
7. **Feature-Flags** — Toggle pro User/Org/Global

### Phase 3 (Mittelfristig — P2)

8. **Security-Center** — Sessions, 2FA, API-Keys
9. **Analytics** — Funnel, Retention, Churn
10. **Org-Management** — Vollständige Org-Verwaltung
11. **Comms** — Templates, Broadcast

---

## 5. Bekannte Bugs im aktuellen Code

| Bug                                                 | Datei                    | Zeile | Fix                                                  |
| --------------------------------------------------- | ------------------------ | ----- | ---------------------------------------------------- |
| MRR falsch berechnet (79€/290€ statt 890€/1290€)    | `src/app/admin/page.tsx` | 69    | `BILLABLE_PLANS[plan].monthlyEur` verwenden          |
| Plan "firm" existiert nicht in `Plan` type          | DB (subsumio_users)      | —     | Auf "pro" oder "team" setzen                         |
| Kein Admin-Layout (keine Sidebar, keine Navigation) | `src/app/admin/`         | —     | `layout.tsx` erstellen                               |
| Keine User-Aktionen (nur Read-Only)                 | `src/app/admin/page.tsx` | —     | Edit/Delete API + UI                                 |
| Email-Verifizierung nicht gesetzt nach Signup       | DB                       | —     | Auto-Verify für Admin oder Verifizierungs-Flow fixen |
