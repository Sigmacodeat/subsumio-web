# ADR: Multi-Tenant-Architektur — Brain-pro-Org mit Row-Level-Tenant-Key

**Status:** Accepted  
**Date:** 2026-06-20  
**Decision Owner:** Architecture Team  
**Supersedes:** None  

## Kontext

Subsumio ist eine Multi-Tenant-SaaS für Kanzleien. Jede Kanzlei (Org) hat
isolierte Daten: Akten, Dokumente, Kommunikation, Fristen, Zeiterfassung.
GBrain (Upstream) ist Single-Tenant — ein Brain pro Installation. Subsumio
muss Multi-Tenant-Isolation auf App-Ebene durchsetzen.

## Entscheidung

**Brain-pro-Org mit Row-Level-Tenant-Key (Hybrid-Modell).**

Jede Org erhält einen eigenen GBrain (`org.brainId`). Innerhalb eines Brains
werden Daten durch `TenantScope` (`brain_id` + `org_id` + optional `source`)
isoliert. Die Engine selbst ist Single-Tenant pro Brain — die App-Ebene
erzwingt die Isolation.

### Warum nicht Brain-pro-Matter?

- Skalierbarkeit: Hunderte Akten pro Kanzlei → Hunderte Brains → unbrauchbar.
- Cross-Akten-Suche (Konfliktsprüfung, Precedent) erfordert gemeinsamen Brain.
- Querverweise (Kontakte, Playbooks, Gesetzescorpus) müssen org-weit sichtbar sein.

### Warum nicht Row-Level-Tenant-Key ohne Brain-pro-Org?

- Engine hat kein Tenant-Konzept — ein Brain für alle Kanzleien würde
  App-Ebene-Filterung bei jedem Query erfordern, ohne Engine-Level-Garantie.
- Bei einem Bug im Filter → Cross-Tenant-Datenleck (kritisch für anwaltliche
  Verschwiegenheit, § 43a BRAO).

### Hybrid-Modell Details

```
Org A (brain-alpha)     Org B (brain-beta)
├── User 1 (owner)      ├── User 3 (owner)
├── User 2 (member)     └── User 4 (member)
└── Brain: brain-alpha  └── Brain: brain-beta
     ├── cases/2026-001      ├── cases/2026-001
     ├── contacts/...        ├── contacts/...
     └── invoices/...        └── invoices/...
```

- **Persönlicher Brain**: User ohne Org-Mitgliedschaft → `user.brainId`
- **Org-Brain**: User mit Org-Mitgliedschaft → `org.brainId` (shared)
- **Engine-Header**: `x-subsumio-source: <brainId>` — Engine scoping
- **Cross-Brain**: Nur innerhalb derselben Org, nur mit explizitem `cross_brain: true` Flag

## Isolationsebenen

| Ebene | Mechanismus | Durchsetzung |
|-------|-------------|--------------|
| **Org** | `org_id` in `TenantScope` | `isSameOrg()` + `TenantGuard.assertOrg()` |
| **Brain** | `brain_id` in `TenantScope` | `isSameBrain()` + `TenantGuard.assertBrain()` |
| **Source** | `source` in `TenantScope` (optional) | `TenantGuard.assertSource()` |
| **Matter** | `case_slug` Prefix-Filter | `TenantGuard.assertMatter()` |
| **User** | `allowed_users` in `MatterPermissionSummary` | `TenantGuard.assertUser()` |
| **Ethical Wall** | `blocked_users` in `MatterPermissionSummary` | `TenantGuard.assertEthicalWall()` |

## Durchsetzungspunkte

1. **API-Routes** (`createHandler`): `ctx.brainId` aus `engineContext()` → Engine-Aufrufe
   sind automatisch auf den richtigen Brain scoped.
2. **Retrieval/Search**: `filterResultsByTenant()` filtert Ergebnisse nach `TenantScope`.
3. **Export**: `assertTenantScope()` vor Export — verweigert Cross-Tenant-Export.
4. **Portal**: `assertMatter()` — Portal-Token ist auf eine Akte begrenzt.
5. **DMS**: `assertBrain()` + `assertMatter()` — DMS-Zugriff ist Brain+Akten-scoped.
6. **Analytics**: `assertOrg()` — Analytics sind Org-scoped, niemals Cross-Org.

## Source Leakage Rate = 0

Das Release-Gate (`src/lib/release-gate.ts`) fordert Source Leakage Rate = 0.
Der `TenantGuard` stellt sicher, dass keine Ergebnisse aus fremden Brains/Orgs
in Retrieval-Ergebnissen auftauchen.

## Implementierung

- `src/lib/tenant-guard.ts` — Enforcement-Modul
- `src/lib/tenant-guard.test.ts` — Tests
- `src/lib/data-classification.ts` — `TenantScope`, `validateTenantScope`, `isSameOrg`, `isSameBrain`
- `src/lib/permission-aware-retrieval.test.ts` — Retrieval-Permission-Tests
- `src/lib/tenant-boundary.test.ts` — Boundary-Tests

## Risiken & Mitigations

| Risiko | Mitigation |
|--------|------------|
| Engine-Bug ignoriert `x-subsumio-source` | App-Ebene filtert zusätzlich (`filterResultsByTenant`) |
| Cross-Brain-Flag wird missbraucht | `cross_brain` nur mit `isSameOrg()` Check |
| Neue API-Route ohne Tenant-Guard | Code-Review + `createHandler` setzt `ctx.brainId` |
| Ethical-Wall-Bypass über direkten Page-Zugriff | `assertMatter()` + `assertEthicalWall()` vor jedem Page-Fetch |

## Konsequenzen

- Jede Org hat genau einen Brain — kein Brain-pro-Matter.
- Cross-Org-Suche ist nicht möglich (by design).
- Cross-Brain-Suche innerhalb einer Org ist möglich mit `cross_brain: true`.
- Migration: Brain-Split bei Org-Wechsel ist nicht vorgesehen (Org bleibt bei ihrem Brain).
