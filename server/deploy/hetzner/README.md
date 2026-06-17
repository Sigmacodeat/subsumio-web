# Subsumio engine on Hetzner (EU) — production runbook

One Hetzner Cloud box runs the whole brain: **Postgres + pgvector**, the
**engine + ingestion worker** (parses PDFs, builds embeddings, answers queries),
and **Caddy** (automatic HTTPS). EU data residency (Germany) — the legal
confidentiality argument (§ 203 StGB / GDPR). The Next.js frontend stays on
Vercel and talks to this box over `SIGMABRAIN_API_URL`.

```
Browser ─► Vercel (Next.js) ──server-to-server──► api.subsum.io (Caddy) ─► engine:3131
                                                                            └─► Postgres+pgvector
```

## What you provide (I can't — needs your accounts)
| # | Thing | Where |
|---|---|---|
| 1 | **Hetzner Cloud** account + project + **API token** (Read & Write) | console.hetzner.cloud → Security → API Tokens |
| 2 | **SSH key** uploaded to hcloud | `hcloud ssh-key create …` |
| 3 | **DNS A-record** for the engine, e.g. `api.subsum.io` → server IP | your DNS / Vercel domains |
| 4 | **Anthropic API key** (answers) | console.anthropic.com |
| 5 | **OpenAI API key** (embeddings) — or Voyage | platform.openai.com |
| 6 | *(later)* **Cloudflare R2** keys for sellable file storage | Cloudflare dash → R2 |

## Steps
```bash
# ── locally, once ──
brew install hcloud
export HCLOUD_TOKEN=<token from step 1>
hcloud ssh-key create --name subsumio-key --public-key-from-file ~/.ssh/id_ed25519.pub

# ── create the server (firewall + Docker auto-installed) ──
cd server/deploy/hetzner
SSH_KEY=subsumio-key bash provision.sh        # prints the server IP + next steps

# ── point DNS: api.subsum.io  A  <that IP> ── (wait for it to resolve)

# ── on the box ──
ssh root@<IP>
git clone <this repo> /opt/subsumio
cd /opt/subsumio/server/deploy/hetzner
cp .env.example .env && nano .env             # ENGINE_DOMAIN + the 4 secrets
docker compose up -d --build                  # ~3-5 min first build
docker compose logs -f engine                 # watch migrations + "serve"

# ── verify ──
curl https://api.subsum.io/health             # → 200

# ── wire the frontend (Vercel → Settings → Environment Variables) ──
SIGMABRAIN_API_URL=https://api.subsum.io
SIGMABRAIN_WEB_API_KEY=<same value as GBRAIN_WEB_API_KEY in .env>
# + an auth DB:  SIGMABRAIN_AUTH_DATABASE_URL=<a Postgres for frontend auth>
# then redeploy the Vercel project.
```

## Sizing
- Start: **CAX21** (4 vCPU / 8 GB / 80 GB, ~€7.49/mo). Handles the pilot + several firms.
- Grow: **CAX31** (8 vCPU / 16 GB) when embeddings/indexes need headroom.
- **Sellable storage:** attach a **Hetzner Volume** (€0.044/GB/mo) for the vault, or
  move files to **Cloudflare R2** (no egress fees → best resale margin). Until then,
  files live on the `engine-data` Docker volume on the box disk — fine for the pilot.

## Day-2
- Update: `git pull && docker compose up -d --build`
- Backups: `docker compose exec db pg_dump -U sigmabrain sigmabrain > backup.sql` (cron it)
- Logs: `docker compose logs -f engine`
- The engine auto-applies schema migrations on every boot (idempotent).
