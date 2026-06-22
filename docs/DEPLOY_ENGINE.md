# Deploying the Subsumio Engine (go-live runbook)

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
                │  x-subsumio-source: <brainId>          │
                │  Authorization: Bearer GBRAIN_WEB_API_KEY │
                └─ env: SUBSUMIO_API_URL, SUBSUMIO_WEB_API_KEY
                                                            └─ Postgres+pgvector (or PGLite volume)
```

The shared secret (`GBRAIN_WEB_API_KEY` on the engine == `SUBSUMIO_WEB_API_KEY`
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
   GBRAIN_HTTP_CORS_ORIGIN=https://subsumio.vercel.app
   OPENAI_API_KEY=<your key>          # or VOYAGE_API_KEY
   ```
   (`PORT` and `DATABASE_URL` are injected by Railway — don't set them.)
4. Deploy. Railway builds the Dockerfile, runs migrations via the entrypoint,
   and health-checks `/health`. Copy the public URL, e.g.
   `https://subsumio-engine-production.up.railway.app`.

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
docker build -t subsumio-engine .
docker run -d --name subsumio-engine -p 3131:3131 \
  -v subsumio_data:/data \
  -e GBRAIN_WEB_API_KEY=$(openssl rand -hex 32) \
  -e GBRAIN_REQUIRE_TENANT=true \
  -e OPENAI_API_KEY=<your key> \
  -e DATABASE_URL=<postgres url>   `# omit for embedded PGLite on the volume` \
  subsumio-engine
```

---

## Wire the frontend (Vercel)

Project **subsumio** → Settings → Environment Variables → **Production**:

| Variable                       | Value                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------- |
| `SUBSUMIO_API_URL`           | the engine URL from above                                                       |
| `SUBSUMIO_WEB_API_KEY`       | the **same** value as the engine's `GBRAIN_WEB_API_KEY`                         |
| `SUBSUMIO_AUTH_DATABASE_URL` | a Postgres URL for the user/org store (Neon/Supabase; can be the same Postgres) |
| `NEXT_PUBLIC_APP_URL`          | `https://subsumio.vercel.app` (or your domain)                                |
| `CRON_SECRET`                  | `openssl rand -hex 32` (for the Vercel crons in `vercel.json`)                  |

Then **redeploy** (push to `main` or Vercel → Redeploy). `AUTH_SECRET` is
already set.

---

## Large uploads (up to 1 GB)

The upload pipeline accepts files up to **1 GB** by default (agency level).
Limits are centralized and overridable per environment:

| Variable                  | Where   | Default              | Effect                                                                     |
| ------------------------- | ------- | -------------------- | -------------------------------------------------------------------------- |
| `MAX_UPLOAD_BYTES`        | web app | `1073741824` (1 GB)  | Max document size accepted by the Next.js validation + UI.                 |
| `MAX_IMAGE_BYTES`         | web app | `209715200` (200 MB) | Max image size.                                                            |
| `GBRAIN_MAX_UPLOAD_BYTES` | engine  | `1073741824` (1 GB)  | Max multipart body the engine `/api/upload` accepts. Keep ≥ the web limit. |

Operational notes for big files:

- **Concurrency is the RAM safeguard.** The web client staggers uploads — large
  files (≥ 50 MB) run **max 2 at once**, the rest queue behind them. Each in-flight
  upload buffers roughly once in the engine, so peak RAM ≈ one or two files. Size
  the box accordingly (a 1 GB upload needs a few GB of headroom).
- **ClamAV stream limit.** If you run a ClamAV daemon (`CLAMAV_HOST`), raise its
  per-stream caps or large files are rejected as `clamav_unreachable`. In
  `clamd.conf` set `StreamMaxLength 1024M` and `MaxFileSize 1024M`, then restart
  `clamd`. Without `CLAMAV_HOST`, the magic-byte/executable checks still run and
  have no size cap.
- **Reverse proxy.** Caddy (the Hetzner default) has **no** request-body size limit
  out of the box, so 1 GB uploads pass through. If you front the engine with nginx
  instead, set `client_max_body_size 1024m;`.

### Original-file storage (download / GoBD retention)

Every uploaded document's **original bytes** are persisted (not just the extracted
text), so the file can be downloaded unaltered later (§ 147 AO / GoBD). This uses
the engine's pluggable `StorageBackend` — the single source of truth for binary
files (`files` table + `src/core/storage.ts`):

- **Default — local volume (zero-config).** When no storage backend is configured,
  files are written under `${GBRAIN_HOME}/files` (i.e. on the `/data` volume).
  **Include `/data` in your backups** — it now holds the original case documents.
- **Object storage (S3 / MinIO / R2).** Set the `storage:` block in the engine's
  config (`gbrain.yml` / `config.storage`) with `backend: s3`, `bucket`, `endpoint`,
  and credentials. No code change — the upload + download paths pick it up.
- **Download** goes through the matter-scoped web route `/api/files/<slug>` →
  engine `/api/files/<slug>`; bytes are streamed and access is checked against the
  caller's matter scope (out-of-scope is indistinguishable from not-found).

### Scanned-PDF OCR

PDFs **with** a text layer, DOCX, EML, XLSX extract with no system deps. **Scanned
(image-only) PDFs** are rasterized + vision-OCR'd as a fallback:

- Requires `GBRAIN_EMBEDDING_IMAGE_OCR=true` **and** a vision-capable model key.
  Without OCR, scanned PDFs store a placeholder and aren't searchable.
- System deps `graphicsmagick`, `ghostscript`, `poppler-utils` are baked into the
  engine image (Dockerfile). If you run the engine outside that image, install them.
- `GBRAIN_OCR_MAX_PAGES` (default 100) caps how many pages are OCR'd synchronously
  per document, so a huge scanned bundle can't time out the upload. Pages beyond
  the cap aren't searchable (a note is added to the extracted text).

---

## Smoke test

```bash
# 1. Engine is alive
curl -s https://<engine-url>/health        # → ok

# 2. Frontend reaches the engine (after the Vercel redeploy)
#    Sign up at https://subsumio.vercel.app/signup, then in the dashboard:
#    /dashboard/upload a file → /dashboard/query a question → expect a cited answer.
```

First admin: the first signup becomes admin (see AUDIT.md). For an
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

- Domain (subsumio.com/.de/.ai) + email; add the domain in Vercel.
- Stripe (products/prices + `STRIPE_*` keys + webhook → `/api/stripe/webhook`).
- Resend (`RESEND_API_KEY` + verified `MAIL_FROM` domain) for digests/invites.
- Upstash Redis (`UPSTASH_REDIS_REST_*`) for distributed rate limiting.
- WorkOS (SSO/SCIM) and SOC 2 — only when the first enterprise lead asks.
