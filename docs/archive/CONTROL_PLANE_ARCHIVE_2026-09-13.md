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

## Retained in the Kanzlei deployment

- `/api/admin/audit-export`, `/api/admin/data-export`, and
  `/api/admin/data-delete` for tenant governance and legal compliance;
- `/api/admin/ip-allowlist` for Kanzlei security settings;
- `/api/admin/eval-gate` because the retained legal monitoring workspace uses
  it directly;
- `/api/admin/corpus-command-center` temporarily because the Hetzner corpus
  provisioning script calls it. This is the remaining extraction seam.
- `/api/internal/*` for authenticated engine-to-web callbacks;
- `/api/cron/*` because both `vercel.json` and the Hetzner `supercronic`
  deployment actively schedule these routes. Every cron route is guarded by
  the shared fail-closed `validateCronAuth` contract.

## Recovery

Restore an archived file with:

```bash
git checkout archive/control-plane-pre-focus-2026-09-13 -- <path>
```

No database rows, tenant data, backups, quality snapshots or corpus files were
deleted. This change removes HTTP adapters and dead source modules only.
