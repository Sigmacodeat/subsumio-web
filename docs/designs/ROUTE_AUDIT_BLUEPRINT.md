# Subsumio Route Audit — Blueprint & Implementation Plan

_Stand: Juni 2026 | Erstellt durch autonomen Principal-Engineer-Audit_

---

## 1. Bestand — 72 existierende Routen

| Gruppe     | Routen                                                                                                       | Status                               |
| ---------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| Auth       | login, signup, logout, me, forgot, reset, verify, 2fa/setup, 2fa/verify, sso/callback, sso/workos            | ✅ Solid                             |
| Brain Core | pages, search, think, upload, stats, graph, brains                                                           | ⚠️ Lücken                            |
| Legal AI   | conflict-check, anonymize, ai-deadlines, judgements-search, judgements-sync, tabular-review                  | ✅ Gut — fehlende Harvey-Äquivalente |
| Agents     | agents, agents/[slug]                                                                                        | ✅                                   |
| DMS        | dms/search, dms/import, dms/status                                                                           | ✅                                   |
| Org/Team   | org, org/invite, org/join, org/member                                                                        | ⚠️ Lücken                            |
| Portal     | portal/generate, portal/message, portal/messages, portal/revoke, portal/verify                               | ✅                                   |
| Invoices   | invoices/send, invoices/remind                                                                               | ⚠️ Bug                               |
| Billing    | billing/checkout, billing/webhook                                                                            | ✅                                   |
| Email      | email/messages, email/messages/[id], email/messages/[id]/reply, email-import                                 | ✅                                   |
| DocuSign   | docusign/auth, docusign/callback, docusign/disconnect, docusign/envelopes, docusign/status, docusign/webhook | ✅                                   |
| Settings   | settings/api-keys                                                                                            | 🔴 Sicherheitslücke                  |
| API Keys   | api-keys                                                                                                     | 🔴 Kritischer Bug                    |
| Data       | data-export/backup, data-export/gdpr                                                                         | ✅                                   |
| Audit      | audit                                                                                                        | ✅                                   |
| Cron       | cron/deadlines, cron/deadline-reminders, cron/case-law, cron/case-scanner                                    | ✅                                   |
| Infra      | usage, queries, demo, rag-eval, webhook                                                                      | ✅                                   |

---

## 2. Kritische Bugs (Breaking in Production)

### 🔴 BUG-1: `/api/api-keys` — In-Memory Store

- **Datei**: `src/app/api/api-keys/route.ts` Zeile 7
- **Code**: `const apiKeysStore = new Map<string, ApiKey>();`
- **Problem**: Keys verschwinden bei jedem Server-Neustart. In Serverless (Vercel) bei JEDEM Request eine neue Map.
- **Fix**: Persistenter Store (File-based dev / Postgres prod) — identisch zum `UserStore`-Pattern.

### 🔴 BUG-2: `/api/settings/api-keys` GET — Decrypted Keys im Response

- **Datei**: `src/app/api/settings/api-keys/route.ts` Zeile 75–84
- **Problem**: Gibt vollständig entschlüsselte API-Keys (OpenAI, Anthropic, ZeroEntropy) zurück. **Massive Sicherheitslücke**.
- **Fix**: Nur maskierte Version zurückgeben (z.B. `sk-...XXXX`).

### 🔴 BUG-3: `/api/invoices/send` — `logAudit` importiert aber nie aufgerufen

- **Datei**: `src/app/api/invoices/send/route.ts` Zeile 6
- **Problem**: `import { logAudit } from "@/lib/audit"` — kein einziger Aufruf im File. Kein Audit-Trail für Rechnungsversand.
- **Fix**: `void logAudit(...)` nach erfolgreichem Versand aufrufen.

### 🟡 BUG-4: `/api/brains` — Hardcoded Stub

- **Datei**: `src/app/api/brains/route.ts`
- **Problem**: Gibt immer `[{ name: "Haupt-Brain", engine: "pglite" }]` zurück. Kein echter Engine-Query.
- **Fix**: Engine-Proxy mit Fallback auf den bekannten Brain.

### 🟡 BUG-5: `/api/auth/me` — Nur GET, kein PATCH

- **Datei**: `src/app/api/auth/me/route.ts`
- **Problem**: Kein Profil-Update möglich (Name, Locale). User sind nach Signup in der Falle.
- **Fix**: PATCH-Handler mit Validierung.

---

## 3. Fehlende Routen — Harvey/Legora Competitive Gap

### Harvey Kernfunktionen (Stand Mai 2026)

- **Assistant**: Dokumente befragen, Entwürfe erstellen, strategische Beratung
- **Vault**: Sichere Massendokumentenanalyse
- **Workflow Agents**: Vorgefertigte + Custom Agents
- **Knowledge**: Rechtsprechungsrecherche (LexisNexis-Partnership, 8 Jurisdiktionen)
- **Ecosystem**: Word-Integration, API, Connectors

### Legora Kernfunktionen

- **Tabular Review**: Grid-Analyse (Dokumente × Fragen) ✅ haben wir
- **Portal**: Mandanten-Portal ✅ haben wir
- **Agentic Workflows**: Konfigurierbare Workflows ✅ partiell
- **Redlining**: Tracked Changes in Verträgen ❌ fehlt

### Fehlende Routes für Marktparität:

| Route                                | Harvey-Äquivalent         | Priorität                        |
| ------------------------------------ | ------------------------- | -------------------------------- |
| `GET/PATCH/DELETE /api/pages/[slug]` | Vault page ops            | 🔴 Kritisch (CRUD unvollständig) |
| `GET /api/health`                    | —                         | 🔴 Ops-Pflicht                   |
| `POST /api/legal/contract-draft`     | Assistant → Drafting      | 🔴 Core Legal AI                 |
| `POST /api/legal/document-review`    | Vault → AI Review         | 🔴 Core Legal AI                 |
| `POST /api/legal/due-diligence`      | Vault → Due Diligence     | 🔴 Core Legal AI                 |
| `POST /api/legal/risk-analysis`      | Assistant → Risk          | 🔴 Core Legal AI                 |
| `POST /api/legal/memo`               | Assistant → Memos         | 🟠 Legal Research                |
| `POST /api/legal/contract-redline`   | — (Legora differentiator) | 🟠 Redlining                     |
| `PATCH /api/team/role`               | Admin panel               | 🟡 Team Mgmt                     |

---

## 4. Architektur-Entscheidungen

### Neues RBAC-Schema (permissions.ts)

Neue `RouteAction`-Typen hinzufügen:

- `legal.contract_draft`
- `legal.document_review`
- `legal.due_diligence`
- `legal.risk_analysis`
- `legal.memo`
- `legal.redline`
- `team.role_change`

### API Key Store

Folgt dem `UserStore`-Pattern aus `src/lib/auth/store.ts`:

- Dev: JSON-File in `.data/api-keys.json`
- Prod: Postgres `sigmabrain_api_keys` Table
- Singleton mit `getApiKeyStore()`

### Neue Legal-AI-Routen Pattern

Alle neuen Legal-AI-Routen folgen dem etablierten Proxy-Pattern:

```typescript
requireEngineContext(req, "legal.<action>", "heavy")
→ engineConfigurationResponse()
→ validate body
→ proxy to ENGINE_URL/api/legal/<endpoint>
→ structured error handling
```

---

## 5. Definition of Done

- [x] Alle kritischen Bugs gefixt (BUG-1..5)
- [x] Alle neuen Routes implementiert und produktionsreif
- [x] Permissions-Matrix vollständig
- [x] Kein toter Import, kein ungenutzter Code
- [x] Jede Route: Auth + Rate-Limit + Quota (wo relevant) + Error-Handling
- [x] Neue Legal-AI-Routes: Streaming-Support wo möglich
- [x] Health-Check: Infra-Status aggregiert
