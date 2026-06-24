# Subsumio full stack on Hetzner (EU) — production runbook

One Hetzner Cloud box runs the full product: **Next.js dashboard**, **Postgres +
pgvector**, the **engine + ingestion worker** (parses PDFs, builds embeddings,
answers queries), and **Caddy** (automatic HTTPS). EU data residency (Germany)
is the legal confidentiality argument (§ 203 StGB / GDPR), and this avoids
Vercel Function body limits for large legal-document uploads.

```
Browser ─► subsum.io (Caddy) ─► web:3000 (Next.js) ─► engine:3131
                          └──► api.subsum.io (Caddy) ─┘
                                                     └─► Postgres+pgvector
```

## What you provide (I can't — needs your accounts)

| #   | Thing                                                                                    | Where                                         |
| --- | ---------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1   | **Hetzner Cloud** account + project + **API token** (Read & Write)                       | console.hetzner.cloud → Security → API Tokens |
| 2   | **SSH key** uploaded to hcloud                                                           | `hcloud ssh-key create …`                     |
| 3   | **DNS A-records** for the app and engine, e.g. `subsum.io` + `api.subsum.io` → server IP | your DNS                                      |
| 4   | **Anthropic API key** (answers)                                                          | console.anthropic.com                         |
| 5   | **OpenAI API key** (embeddings) — or Voyage                                              | platform.openai.com                           |
| 6   | _(later)_ **Cloudflare R2** keys for sellable file storage                               | Cloudflare dash → R2                          |

## Steps

```bash
# ── locally, once ──
brew install hcloud
export HCLOUD_TOKEN=<token from step 1>
hcloud ssh-key create --name subsumio-key --public-key-from-file ~/.ssh/id_ed25519.pub

# ── create the server (firewall + Docker auto-installed) ──
cd server/deploy/hetzner
SSH_KEY=subsumio-key bash provision.sh        # prints the server IP + next steps

# ── point DNS: subsum.io and api.subsum.io  A  <that IP> ── (wait for it to resolve)

# ── on the box ──
ssh root@<IP>
git clone <this repo> /opt/subsumio
cd /opt/subsumio/server/deploy/hetzner
cp .env.example .env && nano .env             # APP_DOMAIN, ENGINE_DOMAIN + secrets
docker compose up -d --build                  # ~3-5 min first build
docker compose logs -f web engine             # watch Next boot + engine migrations

# ── verify ──
curl https://subsum.io/api/health             # → 200
curl https://subsum.io/api/readiness          # → 200/degraded, not 503
curl https://api.subsum.io/health             # → 200
```

## Sizing

- Start: **CAX21** (4 vCPU / 8 GB / 80 GB, ~€7.49/mo). Handles the pilot + several firms.
- Grow: **CAX31** (8 vCPU / 16 GB) when embeddings/indexes need headroom.
- **Sellable storage:** attach a **Hetzner Volume** (€0.044/GB/mo) for the vault, or
  move files to **Cloudflare R2** (no egress fees → best resale margin). Until then,
  files live on the `engine-data` Docker volume on the box disk — fine for the pilot.

## Day-2

- Update: `git pull && docker compose up -d --build`
- Backups: `docker compose exec db pg_dump -U subsumio subsumio > backup.sql` (cron it)
- Logs: `docker compose logs -f web engine`
- The engine auto-applies schema migrations on every boot (idempotent).

## Large uploads

The full Hetzner stack keeps the browser upload path on this box:

`Browser → Caddy → web:3000 /api/upload → engine:3131`

The default limit is 1 GB (`MAX_UPLOAD_BYTES=1073741824`,
`NEXT_PUBLIC_DIRECT_UPLOAD_MAX_BYTES=1073741824`,
`GBRAIN_MAX_UPLOAD_BYTES=1073741824`). If you put another proxy/CDN in front of
the box, raise that layer's body limit too or large uploads will fail before the
Next.js handler sees them.
