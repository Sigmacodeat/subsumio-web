# Subsumio — Single Source of Truth (SSOT) Audit

> **Diese Datei ersetzt alle vorherigen Audit-, Gap-, Status- und Analyse-Dokumente.**
> Sie ist gegen den tatsächlichen Codestand verifiziert. Frühere Root-Audits
> (`AUDIT_*`, `SIGMABRAIN_*`, `ENGINE_*`, `FORK_ANALYSIS_*`, `FRONTEND_AUDIT_*`,
> `FULL_SYSTEM_AUDIT_*`, `STATE_OF_THE_ART_*`) wurden entfernt, weil sie veraltete,
> teils falsche Behauptungen enthielten (siehe §6). Release-Historie lebt in
> `CHANGELOG.md`, offene Arbeit in `TODOS.md`. **Nur diese Datei beschreibt den
> aktuellen Ist-Zustand.**

- **Stand:** 2026-06-22
- **Version (`VERSION`):** `0.42.38.0`
- **Verifikationsbasis:** Code-Scan + `bun run typecheck` (web + server) grün,
  `bun run build` grün (118 Seiten), fokussierte Unit-Suiten grün (311 + 79 + 10 Tests
  in den letzten Läufen). Quelle: `docs/audits/KANZLEI_OS_UNFINISHED_WORKFLOW_AUDIT_2026-06-22.md`.

---

## 1. Was Subsumio ist

Legal-AI-Plattform für DACH-Kanzleien. **Architektur:** Next.js-15-Web-App
(`src/`) + separate „Subsumio Engine" (`server/src/`, ein gbrain-Fork: Postgres +
pgvector, Hybrid-RAG, Knowledge-Graph mit typisierten Kanten). Die Web-App proxyt
über `createEngineProxy` mit einer mehrschichtigen Guard-Chain (Auth → RBAC →
Quota → Citation-Gate → Audit) an die Engine.

## 2. Codestand in Zahlen (verifiziert)

| Metrik                                                   | Wert                                          |
| -------------------------------------------------------- | --------------------------------------------- |
| Frontend-Dateien (`src/`, TS/TSX)                        | 999                                           |
| Engine-Core (`server/src/`)                              | 755 Dateien, ~180.000 Zeilen                  |
| API-Routes (`src/app/api/**/route.ts`)                   | 183                                           |
| Dashboard-Seiten                                         | ~75                                           |
| Testdateien gesamt                                       | 1.515 (davon 1.309 Server-Unit, 16 E2E-Specs) |
| Offene `TODO`/`FIXME`/`not implemented`-Marker in `src/` | 0                                             |
| Routes mit 501/NotImplemented                            | 4 (bewusst, z. B. optionale Connector-Pfade)  |

**Urteil:** Reife, tief implementierte Plattform — kein MVP. Dünne API-Routes sind
Engine-Proxys, keine Stubs.

## 3. Feature-Abdeckung (real im Code)

- **Brain/Intelligence:** RAG-Query, Knowledge-Graph, Tabular Review, Due Diligence,
  Contract Redline/Draft, Conflict-Check (Kollisionsprüfung), Obligation-Extract,
  Risk-Analysis, Memo, Precedent/Statute-Search, Anonymisierung, Summarize, Translate.
- **DACH-Spezifika (Burggraben):** beA, DATEV, RVG-Abrechnung, Judikatur-Sync (AT/DE),
  Fristenerkennung + Cron-Reminders, Verfahrensdoku.
- **SaaS-Layer:** Auth (Session, WorkOS SSO/SAML, TOTP-2FA, SCIM), RBAC/ACLs,
  Stripe-Billing + Quota, Audit-Hash-Chain, GDPR-Export/-Deletion, Client-Portal,
  Mandanten-Kommunikation (Email-Tracking, WhatsApp-Kanzlei-OS).
- **Integrationen:** DocuSign, DMS (iManage/NetDocuments), Microsoft 365, Word/Outlook-Add-in.
- **Plattform:** PWA + native iOS/Android (Capacitor), Realtime (SSE/Presence).

## 4. Production-Readiness (verifiziert)

| Bereich                                                  | Stand                               | Beleg                                                                                                                         |
| -------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Security-Header (CSP, HSTS, X-Frame, Permissions-Policy) | ✅ **vollständig**                  | `next.config.ts:26-66`                                                                                                        |
| Branding-Bereinigung                                     | ✅ **im Wesentlichen erledigt**     | nur 2 `SigmaBrain`-Vorkommen in 1 src-Datei (`src/lib/engine.ts`); 7 interne `gbrain`-Refs in Lib-Dateien (nicht user-facing) |
| Typecheck (web + server)                                 | ✅ grün                             | letzter Lauf                                                                                                                  |
| Production-Build                                         | ✅ grün (118 Seiten)                | letzter Lauf                                                                                                                  |
| Guard-Chain / RBAC / Quota-Atomicity / Audit-Chain       | ✅ solide                           | Code review                                                                                                                   |
| Citation-Gate (Anti-Halluzination)                       | ✅ erzwungen (`citationGate: true`) | Legal-Routes                                                                                                                  |

## 5. Offene Lücken bis 100% Marktreife (priorisiert)

Die Lücke ist **nicht „Features fehlen", sondern „End-to-End-Härtung + Trust-Signale".**

**P0 — Vor breitem Kanzlei-Rollout**

- [ ] Compliance-Zertifizierung starten: **SOC 2 Type II, ISO 27001, ISO 42001** (AI-Governance) — Branchen-Table-Stakes 2026, alle Top-Konkurrenten haben sie.
- [ ] Echte E2E-Integrationen abschließen: Microsoft-365-Live-Consent, beA-Live-Prozess, SMTP/Mailbox, Zahlungs-/Mahnlauf, DMS-Push (Quelle: 06-22-Audit).
- [ ] Reste-Branding final: `src/lib/engine.ts` (`SigmaBrain`) + 7 interne `gbrain`-Refs neutralisieren.

**P1 — Wettbewerbsfähigkeit**

- [ ] Billing vervollständigen (Proration, Seat-Management, Dunning/Failed-Payment, Webhook-Idempotenz).
- [ ] Test-Coverage kritischer Flows: Multi-Tenant-Isolation (Cross-Tenant-Leak), Auth, Billing-Webhook, Quota-Atomicity.
- [ ] Vault-Skalierung auf 100k-Dokument-Collections lasttesten (Harvey/Legora-Benchmark).
- [ ] Accessibility-Sweep (WCAG) über alle Dashboard-Seiten.
- [ ] Monitoring/Observability: Engine-Health-Dashboards, Alerting, SLO-Tracking.

**P2 — Differenzierung / Burggraben**

- [ ] Verlags-Content-Partnerschaft (Antwort auf Noxtua-MANZ/Beck): kuratierte AT/DE-Kommentar-/Judikaturquellen.
- [ ] „Sovereign EU"-Positionierung code-seitig belegen (EU-Region-Pinning, Datenresidenz).
- [ ] Collaboration/Real-time (Comments/Presence) produktiv härten.

## 6. Wettbewerbsvergleich (Stand 2026)

| Anbieter                             | Positionierung                                 | Subsumio-Verhältnis                                                                 |
| ------------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Harvey** ($11 Mrd., 100k+ Anwälte) | US-Enterprise; Vault/Knowledge/Workflow-Agents | Funktional nahe; DACH-Tiefe voraus; Skala/Trust hinten                              |
| **Legora** ($5,6 Mrd., $100M ARR)    | EU agentic OS (aOS), Tabular Review, DMS       | **Direktester Konkurrent**; Feature-Parität gegeben, Reife/UX-Gap                   |
| **CoCounsel** (Thomson Reuters)      | Westlaw-Research-Tiefe                         | Research-DB-Tiefe voraus; du hast eigenen AT/DE-Corpus                              |
| **Noxtua** (+MANZ/Beck)              | Souveräne DACH-Rechts-KI                       | **Gefährlichster DACH-Konkurrent** — Verlags-Content + Souveränität als deine Lücke |
| **RA-MICRO / DATEV Anwalt**          | Etablierte Kanzleisoftware                     | Verankerte Workflows; du differenzierst über KI-Tiefe                               |

**Kernurteil:** Subsumio ist funktional auf Legora/Harvey-Klasse mit einem echten
DACH-Burggraben (beA/RVG/DATEV/Judikatur), den Harvey/Legora nicht haben. Reifegrad-
Lücke ≈ 80 % Härtung & Trust, nicht Funktionalität.

## 7. Warum die alten Audits entfernt wurden (Belege für Drift)

Die gelöschten Root-Audits behaupteten u. a.:

- „**CSP-Header fehlen (P0)**" → **FALSCH**: vollständig in `next.config.ts:43`.
- „**55 SigmaBrain-Vorkommen in 34 Dateien (P0)**" → **VERALTET**: real 2 Vorkommen in 1 src-Datei.
- „Billing 55 % Alpha", „SaaS-Layer 68 %" → Momentaufnahmen vom 19.06., überholt durch die 06-21/06-22-Arbeit.

Append-only-Audit-Wucherung (23 Root-Dateien + ~50 in `docs/audits/`) ist genau das
Anti-Pattern, das diese SSOT beseitigt. Historische Detail-Audits bleiben in der
Git-Historie abrufbar.
