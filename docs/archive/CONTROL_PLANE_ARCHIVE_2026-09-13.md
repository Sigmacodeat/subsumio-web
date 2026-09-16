# Control-plane archive manifest

Status: removed from the active Subsumio Kanzlei build on 2026-09-13.

Canonical source snapshot: annotated Git tag
`archive/control-plane-pre-focus-2026-09-13` at commit `de18f8cf9c`.

## Boundary

The public Kanzlei deployment must contain tenant-facing legal workflows, not
the SaaS operator console. The operator dashboard pages were removed in the
previous pilot-focus block. This block removes their now-orphaned web API
adapters as well as standalone RAG/release-evaluation endpoints.

Archived surfaces include:

- backup, SaaS usage, token usage, spend caps and user-operator APIs;
- corpus steward, chunk inspector, RAG optimizer and corpus-pipeline APIs;
- model vetting, fine-tuning, feedback triage and regression-mining APIs;
- the complete `/api/monitoring/*` operator API collection;
- `/api/rag-eval`, `/api/release-gate`, and `/api/eval/gate`;
- the unused public/admin feature-flag routes and their client hooks;
- obsolete browser API clients, operator-only libraries and E2E tests.

The active Next.js API surface dropped from 477 to 412 route handlers.

## Retained

### Operator console (ops host only)

The operator console lives at `/ops` and is served exclusively on the ops host
(`OPS_HOSTS`, production `ops.subsum.eu`) to platform operators (e-mail
allowlist plus 2FA). The web API adapters it uses are kept and gated by the
`platform.operator` route action, which no Kanzlei role grants and which API
keys cannot use:

- backup, disaster recovery, SLO, queue health;
- SaaS usage and margins, token usage, spend caps, user management;
- corpus steward (`corpus-files/*`, corpus alerts, pipeline, chunk inspector and
  chunk quality, corpus command center) and feature flags;
- `/api/admin/audit-export`, `/api/admin/data-export`, `/api/admin/data-delete`:
  they address arbitrary brains or users and are therefore operator-only.

### Kanzlei deployment

- `/api/admin/ip-allowlist` for Kanzlei security settings;
- `/api/admin/eval-gate` (firm admin) for the Kanzlei monitoring workspace;
- firm-wide data portability export and backup under `/api/data-export/*`
  (firm admins);
- `/api/internal/*` for authenticated engine-to-web callbacks;
- `/api/cron/*` because both `vercel.json` and the Hetzner `supercronic`
  deployment actively schedule these routes. Every cron route is guarded by
  the shared fail-closed `validateCronAuth` contract.

### Archived

The remaining evaluation, quality-trend, guardrail-statistics, RAG optimizer,
model vetting, fine-tuning, regression mining, decision record, dissensus,
feedback triage, SaaS invoice and settlement queue adapters stay removed, as do
the public feature-flag check route and its client hook.

## Recovery

Restore an archived file with:

```bash
git checkout archive/control-plane-pre-focus-2026-09-13 -- <path>
```

No database rows, tenant data, backups, quality snapshots or corpus files were
deleted. This change removes HTTP adapters and dead source modules only.
