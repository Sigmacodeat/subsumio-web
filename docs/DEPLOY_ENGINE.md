# Deploying the Sigmabrain Engine (go-live runbook)

The Next.js frontend is already on Vercel. This is the **only remaining piece**
to make the dashboard (search, Q&A, login persistence, billing) actually work:
host the engine and point the frontend at it.

Vercel can't host the engine (it's a long-running process + worker, not a
serverless function). Everything **code-side is done** — Dockerfile,
entrypoint, Railway/Fly config. You provide the accounts + secrets.

---

## Architecture

```
Browser ──► Vercel (Next.js)  ──server-to-server──►  Engine (this container)
                │  x-sigmabrain-source: <brainId>          │
                │  Authorization: Bearer GBRAIN_WEB_API_KEY │
                └─ env: SIGMABRAIN_API_URL, SIGMABRAIN_WEB_API_KEY
                                                            └─ Postgres+pgvector (or PGLite volume)
```

The shared secret (`GBRAIN_WEB_API_KEY` on the engine == `SIGMABRAIN_WEB_API_KEY`
on Vercel) is what authorizes the frontend. `GBRAIN_REQUIRE_TENANT=true` makes
every request prove its tenant — mandatory for the hosted SaaS.

---

## Option A — Railway (easiest)

1. **New project → Deploy from GitHub repo** → pick this repo, set **Root
   Directory = `server`** (so `server/railway.json` + `server/Dockerfile` apply).
2. **Add a Postgres plugin** (New → Database → PostgreSQL). Railway injects
   `DATABASE_URL` automatically. (Enable the `vector` extension once: open the
   Postgres shell → `CREATE EXTENSION IF NOT EXISTS vector;` — the engine
   migrations create the rest.)
3. **Variables** (Settings → Variables):
   ```
   GBRAIN_WEB_API_KEY=<openssl rand -hex 32>
   GBRAIN_REQUIRE_TENANT=true
   GBRAIN_HTTP_TRUST_PROXY=true
   GBRAIN_HTTP_CORS_ORIGIN=https://sigmabrain.vercel.app
   OPENAI_API_KEY=<your key>          # or VOYAGE_API_KEY
   ```
   (`PORT` and `DATABASE_URL` are injected by Railway — don't set them.)
4. Deploy. Railway builds the Dockerfile, runs migrations via the entrypoint,
   and health-checks `/health`. Copy the public URL, e.g.
   `https://sigmabrain-engine-production.up.railway.app`.

## Option B — Fly.io

```bash
cd server
fly launch --no-deploy            # uses fly.toml; creates the app + volume
fly secrets set \
  GBRAIN_WEB_API_KEY=$(openssl rand -hex 32) \
  OPENAI_API_KEY=<your key> \
  DATABASE_URL=<postgres url>      # omit to use the embedded PGLite volume
fly deploy
fly status                        # note the https://<app>.fly.dev URL
```

## Option C — Hetzner (EU, recommended for Subsumio)

Single EU box running Postgres+pgvector + engine+worker + Caddy (auto-HTTPS),
fully scripted. EU/Germany data residency is the legal confidentiality argument,
and the cheapest path to **sellable storage** with real margin. Full runbook +
the "what you provide" checklist:

➡️ **[`server/deploy/hetzner/README.md`](../server/deploy/hetzner/README.md)**

```bash
cd server/deploy/hetzner
export HCLOUD_TOKEN=<your Hetzner API token>
SSH_KEY=<your hcloud ssh key name> bash provision.sh   # creates firewall + server
# → point DNS, ssh in, cp .env.example .env, edit, docker compose up -d --build
```

## Option D — any Docker host / VPS

```bash
cd server
docker build -t sigmabrain-engine .
docker run -d --name sigmabrain-engine -p 3131:3131 \
  -v sigmabrain_data:/data \
  -e GBRAIN_WEB_API_KEY=$(openssl rand -hex 32) \
  -e GBRAIN_REQUIRE_TENANT=true \
  -e OPENAI_API_KEY=<your key> \
  -e DATABASE_URL=<postgres url>   `# omit for embedded PGLite on the volume` \
  sigmabrain-engine
```

---

## Wire the frontend (Vercel)

Project **sigmabrain** → Settings → Environment Variables → **Production**:

| Variable | Value |
|---|---|
| `SIGMABRAIN_API_URL` | the engine URL from above |
| `SIGMABRAIN_WEB_API_KEY` | the **same** value as the engine's `GBRAIN_WEB_API_KEY` |
| `SIGMABRAIN_AUTH_DATABASE_URL` | a Postgres URL for the user/org store (Neon/Supabase; can be the same Postgres) |
| `NEXT_PUBLIC_APP_URL` | `https://sigmabrain.vercel.app` (or your domain) |
| `CRON_SECRET` | `openssl rand -hex 32` (for the Vercel crons in `vercel.json`) |

Then **redeploy** (push to `main` or Vercel → Redeploy). `AUTH_SECRET` is
already set.

---

## Smoke test

```bash
# 1. Engine is alive
curl -s https://<engine-url>/health        # → ok

# 2. Frontend reaches the engine (after the Vercel redeploy)
#    Sign up at https://sigmabrain.vercel.app/signup, then in the dashboard:
#    /dashboard/upload a file → /dashboard/query a question → expect a cited answer.
```

First admin: the first signup becomes admin (see SIGMABRAIN_STATUS.md). For an
engine-side admin token use `GBRAIN_ADMIN_BOOTSTRAP_TOKEN`.

---

## Load the law corpus (optional, makes subsumption skills cite real §§)

Run once against the deployed engine's database (per-§ pages, embeddable):

```bash
# DE statutes split per § ; CH/GG per Art. (AT files are PDF dumps — re-run the
# fetcher first: bun run server/scripts/ingest-law-corpus.ts)
DATABASE_URL=<engine postgres url> bun run server/scripts/import-statutes-split.ts
# then embed what landed:
DATABASE_URL=<engine postgres url> bun run server/scripts/auto-embed-pending.ts
```

---

## Still owner-only (accounts, not code)

- Domain (sigmabrain.com/.de/.ai) + email; add the domain in Vercel.
- Stripe (products/prices + `STRIPE_*` keys + webhook → `/api/stripe/webhook`).
- Resend (`RESEND_API_KEY` + verified `MAIL_FROM` domain) for digests/invites.
- Upstash Redis (`UPSTASH_REDIS_REST_*`) for distributed rate limiting.
- WorkOS (SSO/SCIM) and SOC 2 — only when the first enterprise lead asks.
