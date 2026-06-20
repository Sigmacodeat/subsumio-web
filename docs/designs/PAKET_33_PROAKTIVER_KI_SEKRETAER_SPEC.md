# Paket 33 — Technische Spezifikation: Proaktiver KI-Sekretär (WhatsApp × Superbrain Fusion)

Datum: 2026-06-20  
Status: Entwurf (Spec vor Implementierung, gemäß Paket-0-Done-Kriterium)  
Action-Plan: `docs/audits/LEGAL_AI_ACTION_TODO_PLAN_2026-06-20.md` (Paket 33)  
Vision: `docs/designs/KANZLEI_OS_WHATSAPP_SUPERBRAIN_BLUEPRINT.md` (Sprint 4 "Automatisierung")  
Owner: TBD · Release: R4 · Priorität: P1 (Permission-Gate P0 innerhalb des Pakets)

## 1. Ziel und USP-Abgrenzung

Subsumio wird die erste Legal-AI, die das berechtigungsbewusste Kanzlei-Superbrain (Paket 31)
mit einer **proaktiven, immer erreichbaren Sekretärin auf WhatsApp** verschmilzt: nicht nur ein
Bot, der antwortet, wenn man fragt, sondern eine Sekretärin, die sich von selbst meldet
(Tagesbriefing, Fristen, "neues Dokument in Akte X — freigeben?", Konflikttreffer) — gegroundet
aus dem echten Aktenkontext, permission-scoped, auditierbar und per Antwort/Approval direkt vom
Handy steuerbar.

WhatsApp ist **Transportkanal**, nicht System of Record. System of Record bleibt das Superbrain.

Abgrenzung (keine Doppelimplementierung):

| Paket                  | Verantwortung                                                                                                                                                                                | Was Paket 33 NICHT neu baut      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 7A WhatsApp-Härtung    | reaktive Intents, Tests, Audit, Media                                                                                                                                                        | Intent-Parser, Media-Scan, Dedup |
| 29 Notification Center | In-App-Center + Event-Bus + Push-Bridge                                                                                                                                                      | den Event-Bus selbst             |
| 31 Superbrain          | Matter Context API, Permission-aware Retrieval, Gap Detection                                                                                                                                | Retrieval/Graph/Context-Engine   |
| 23 Ethics              | Privilege-Labels, Ethical Walls                                                                                                                                                              | das Wall-Modell                  |
| 3 Workflow             | Approval Gates                                                                                                                                                                               | die Approval-State-Machine       |
| **33 (dieses)**        | **Fusion: WhatsApp als 3. Kanal des Event-Bus, gespeist aus Superbrain-Befunden, permission-scoped auf die WhatsApp-Identität, mit Outbound-Template-/Consent-Infra und Approval-Rückkanal** | —                                |

## 2. Ist-Zustand (Code-Realität, verifiziert 2026-06-20)

Vorhanden und wiederverwendbar:

- `src/lib/whatsapp/send.ts` — `sendWhatsAppText`, `sendWhatsAppTemplate`, `sendWhatsAppInteractive`
  (Buttons/Listen), `sendWhatsAppMedia`, `sendWhatsAppMessage`. **Outbound-Primitive sind da.**
- `src/lib/whatsapp/flow-send.ts`, `flow-definitions.ts`, `flow-crypto.ts` — WhatsApp Flows.
- `src/lib/whatsapp/verify.ts` — `resolveSender(phone)`, `loadAllowedSenders()`.
- `src/lib/whatsapp/types.ts` — `WhatsAppSenderBinding { phone, brainId, userId?, name?, role? }`.
- `src/lib/legal-chat/actions.ts` (1840 Zeilen) — 25+ `ParsedIntent`-Varianten inkl. `brain_query`,
  `search`, `conflict_check`. Jeder Handler nutzt `sender.brainId` → `engineHeadersForBrain(brainId)`.
- `src/app/api/whatsapp/webhook/route.ts` — Inbound, Voice-Transkription, Dedup, Signaturprüfung.
- `src/app/api/notifications/route.ts` — bereits über `createHandler` (Paket 29 Startpunkt).
- Cron: `src/app/api/cron/deadline-reminders/route.ts` (heute **nur E-Mail** via `nodemailer`),
  `src/app/api/cron/deadlines/route.ts` (ruft WhatsApp-Send).

Lücken (was Paket 33 schließt):

1. **Identität ist env-basiert, nicht DB-basiert.** `resolveSender()` liest entweder eine
   JSON-Env-Liste oder fällt auf `WHATSAPP_DEFAULT_BRAIN_ID` + einen einzigen Default-Anwalt zurück.
   `role` existiert im Typ, wird aber nirgends erzwungen. Kein Matter-Scope, keine Ethical Walls.
2. **`brain_query`/`search` sind nicht an Paket 31 gebunden.** Sie proxyen direkt mit `brainId`,
   ohne Matter Context API Contract, ohne Permission-aware Retrieval, ohne Leak-Gate.
3. **Kein einheitlicher Outbound-Kanal.** Proaktive Benachrichtigung ist über Cron verstreut und
   inkonsistent (E-Mail vs. WhatsApp), nicht am Notification-Event-Bus.
4. **Keine WhatsApp-Business-Outbound-Infra.** Kein 24h-Fenster-Tracking, keine Template-Registry,
   kein Consent-Modell.
5. **Kein Approval-Rückkanal.** Buttons können gesendet werden, aber Button-Replies sind nicht an
   Approval Gates (Paket 3) gebunden.

## 3. Architektur

```
                         ┌─────────────────────────────┐
   Superbrain (P31) ───▶ │   Notification Event Bus     │ ◀── Workflow (P3), Fristen (P20),
   Gap Detection         │        (Paket 29)            │     Portal (P18), Filing (P22)
   Matter Context API    └──────────────┬──────────────┘
                                        │  ein Event, drei Kanäle
                   ┌────────────────────┼────────────────────┐
                   ▼                    ▼                    ▼
              In-App (P29)         Mobile-Push (P16)   WhatsApp-Sekretär (P33)
                                                            │
                                          ┌─────────────────┴─────────────────┐
                                          ▼                                   ▼
                              Outbound-Gate (24h/Template/Consent)   Approval-Rückkanal
                              ↓                                       (Button/Flow → P3)
                              sendWhatsAppTemplate / Interactive
```

Inbound (Permission-Pfad) bleibt:

```
WhatsApp In ─▶ webhook ─▶ resolveSenderIdentity(phone)  [DB, P0-SECR-002]
                          ├─ verifizierte Identität + Rolle + Org/Matter-Scope + Walls
                          └─▶ parseIntent ─▶ brain_query/search ─▶ Matter Context API (P31)
                                                                   └─ permission-scoped, Leak=0
```

## 4. Datenmodell (Persistenzvertrag nach Paket 0B)

Alle neuen Modelle: Tenant-Key = `orgId`/`brainId`; relationale Tabelle (nicht Brain-Frontmatter,
da auth-/consent-kritisch); jede Mutation erzeugt Audit-Event (Paket 10).

### 4.1 `whatsapp_identity` (ersetzt env-basierte Bindung)

| Feld                  | Typ                 | Notiz                                                  |
| --------------------- | ------------------- | ------------------------------------------------------ |
| `id`                  | uuid                | PK                                                     |
| `org_id` / `brain_id` | string              | Tenant-Key                                             |
| `phone_hash`          | string              | HMAC-SHA256 (nie Klartext speichern; vgl. `phoneHash`) |
| `user_id`             | string              | verifizierte Anwalts-/Mitarbeiter-Identität            |
| `role`                | enum                | `admin` \| `lawyer` \| `assistant`                     |
| `matter_scope`        | string[] \| `"all"` | erlaubte Akten (Default: rollenbasiert)                |
| `verified_at`         | timestamp           | Verifikation via OTP/Portal-Link, nicht env-Vertrauen  |
| `status`              | enum                | `active` \| `suspended` \| `revoked`                   |

`resolveSender()` wird zu `resolveSenderIdentity()`: DB-Lookup statt env, mit Fallback-Verbot in Prod.

### 4.2 `whatsapp_consent`

| Feld                       | Typ       | Notiz                                                                      |
| -------------------------- | --------- | -------------------------------------------------------------------------- |
| `subject_type`             | enum      | `lawyer` \| `client` (getrennte Trust-Tiers)                               |
| `subject_ref`              | string    | user_id bzw. client_id                                                     |
| `phone_hash`               | string    | HMAC                                                                       |
| `opt_in_at` / `opt_out_at` | timestamp | Widerruf jederzeit                                                         |
| `scope`                    | enum[]    | z.B. `daily_briefing`, `deadline_alert`, `doc_approval`, `client_reminder` |
| `consent_proof`            | jsonb     | Quelle/Zeit/Text des Opt-ins (DSGVO-Nachweis)                              |

### 4.3 `whatsapp_template`

| Feld              | Typ    | Notiz                                        |
| ----------------- | ------ | -------------------------------------------- |
| `name`            | string | Meta-Template-Name                           |
| `category`        | enum   | `utility` \| `marketing` \| `authentication` |
| `approval_status` | enum   | `approved` \| `pending` \| `rejected` (Meta) |
| `locale`          | string | `de`, `de_AT`, …                             |
| `body_params`     | jsonb  | Parameter-Schema                             |

### 4.4 `whatsapp_window` (24h-Customer-Service-Fenster)

| Feld              | Typ                                         | Notiz                                   |
| ----------------- | ------------------------------------------- | --------------------------------------- |
| `phone_hash`      | string                                      |                                         |
| `last_inbound_at` | timestamp                                   | letzte eingehende Nutzernachricht       |
| → abgeleitet      | `window_open = now - last_inbound_at < 24h` | bestimmt: Freitext vs. Template Pflicht |

### 4.5 `whatsapp_outbound_log`

Jeder business-initiierte Versand: `phone_hash`, `template_name?`, `channel_event_id`,
`within_window` (bool), `consent_id`, `sent_at`, `status`, `audit_id`. → Beweis für Compliance.

## 5. Komponenten und Tasks (Ticket-Mapping)

### P0-SECR-002 — Permission-aware WhatsApp-Sekretär (Sicherheits-Gate, P0)

- `src/lib/whatsapp/identity.ts` neu: `resolveSenderIdentity(phone): Promise<SenderIdentity | null>`
  (DB-Lookup `whatsapp_identity`, kein env-Fallback in Prod).
- `brain_query`/`search`/`conflict_check`/`document_fetch`/`case_*`-Intents in
  `src/lib/legal-chat/actions.ts` laufen über den **Matter Context API Contract** (Paket 31 Task 17)
  statt `engineHeadersForBrain(brainId)` direkt — mit `userId`, `role`, `matter_scope`, Ethical Walls.
- Source Leakage Rate = 0: Cross-Tenant-/Cross-Matter-Leak-Tests speziell für den WhatsApp-Pfad
  (`src/lib/legal-chat/actions.test.ts` erweitern + neue `permission-leak.test.ts`).
- **Abhängigkeit:** Paket 31 Matter Context API muss existieren. Bis dahin: `brain_query` über
  WhatsApp auf `matter_scope`-gefilterten Lookup beschränken und Leak-Test als Gate pinnen.

### P1-SECR-001 — WhatsApp am Notification-Event-Bus

- WhatsApp-Channel-Adapter konsumiert dieselben Events wie In-App/Push (Paket 29).
- `cron/deadline-reminders` (nur E-Mail) + `cron/deadlines` auf den gemeinsamen Bus konsolidieren;
  keine Doppellogik, ein Event → konfigurierbare Kanäle pro Empfänger.

### P1-SECR-003 — WhatsApp-Business-Outbound-Infra

- `src/lib/whatsapp/outbound-gate.ts` neu: vor jedem business-initiierten Send prüfen
  (a) `whatsapp_window` offen? → Freitext erlaubt; sonst (b) approved Template Pflicht;
  (c) `whatsapp_consent` für `scope` vorhanden? (d) Quiet Hours/Eskalation; → sonst block + Log.
- Template-Registry-Sync mit Meta-Status; `whatsapp_outbound_log` schreibt jeden Versand.

### P1-SECR-004 — Proaktives Tagesbriefing

- `src/app/api/cron/daily-briefing/route.ts` neu (cron-auth via `validateCronAuth`).
- Pro Anwalt: heutige Fristen, offene Approvals, neue Dokumente, Konflikttreffer, dringende
  Mandantennachrichten — aus Matter Context (Paket 31), mit Citation/Grounding (Paket 1).
- Konfigurierbar: Zeit, Umfang, Akten-Scope, Kanäle. Geht durch das Outbound-Gate.

### P1-SECR-005 — Approval-/Aktions-Rückkanal

- Button-/List-Replies (`WhatsAppButtonReplyMessage`/`WhatsAppListReplyMessage`) im Webhook auf
  Approval-Aktionen mappen → Paket 3 Approval Gates, Paket 22 Filing.
- Quick-Replies: Bestätigen/Ablehnen/Verschieben; jede Aktion auditiert (Paket 10).

### P1-SECR-006 — Sekretär-Eval-Gate

- Metriken in Eval-Pipeline (Paket 14/31): Proactive Precision (Anteil als nützlich markierter
  Pushes), Leak-Rate = 0, Consent-Compliance = 100%, Template-Window-Verletzungen = 0.

### (optional) Voice-Out

- Voice-In existiert (`transcribe.ts`); TTS für Briefings/Antworten evaluieren (nicht R4-blockierend).

## 6. Mandanten-Outbound (separater Trust-Tier)

Terminerinnerung, Dokumentenanforderung, Rechnungslink, Portal-Verknüpfung (Paket 18) NUR mit
explizitem Mandanten-Opt-in (`whatsapp_consent.subject_type = client`) + approved Template.
Strengere Freigabe als interne Anwalts-Kommunikation; Portal bleibt für vertrauliche Inhalte.

## 7. Compliance / Security

- Berufsgeheimnis: keine privilegierten Inhalte über WhatsApp ohne Wall-Prüfung; Klartext-Telefon
  nie persistieren (HMAC). Opt-in pro Kanzlei und pro Nutzer/Mandant, jederzeit widerrufbar.
- DSGVO: `consent_proof` als Nachweis; Auftragsverarbeitung Meta dokumentieren; Datenminimierung.
- AI Act Art. 50: AI-Kennzeichnung der Sekretärin in Outbound-Nachrichten.
- Audit: jeder Outbound, jede Identitätsänderung, jede Approval-Aktion → Hash-Chain (Paket 10).

## 8. Testplan (Done-Kriterien)

- Unit: `resolveSenderIdentity`, Outbound-Gate (Fenster/Template/Consent/Quiet-Hours-Matrix).
- Permission-Leak: Cross-Tenant/Cross-Matter über WhatsApp → 0 Treffer (blockierendes Gate).
- API: `cron/daily-briefing` (cron-auth, Grounding vorhanden), Webhook-Button→Approval.
- Eval: Proactive Precision, Leak-Rate, Consent-Compliance, Template-Window-Verletzungen.

## 9. Offene Entscheidungen

1. Identitäts-Verifikation: OTP über WhatsApp-Auth-Template vs. Portal-Link-Bestätigung?
2. Multi-Tenant (Paket 31 Task 19): Brain-pro-Org vs. Row-Level-Tenant-Key — bestimmt `matter_scope`-Durchsetzung.
3. Briefing-Default-Zeit/Quiet-Hours-Policy pro Kanzlei oder global?
4. Voice-Out: in R4 oder als Fast-Follow?

## 10. Risiken

Siehe Action-Plan "Risiken" (Paket-33-Zeilen): USP unverankert, Outbound rechtlich/technisch
unmöglich ohne Template/Consent, Brain-Query-Leak, Spam-Schleuder. Gegenmaßnahmen sind hier als
P0-SECR-002 (Leak-Gate), P1-SECR-003 (Outbound-Gate) und P1-SECR-006 (Anti-Spam-Eval) verankert.
