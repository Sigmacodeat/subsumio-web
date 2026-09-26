# Deploying Subsumio (go-live runbook)

For DACH legal workloads, the recommended production path is the full
self-hosted EU stack (production runs on Netcup): Next.js dashboard, engine,
worker, Postgres+pgvector, and Caddy on one box. The older split path
(frontend on Vercel, engine elsewhere) still works for small files, but it
puts browser uploads through Vercel Function limits.

Vercel can't host the engine (it's a long-running process + worker, not a
serverless function). A single EU VM avoids that split and keeps large
legal-document uploads on one host.

---

## Architecture

```
Browser ─► subsum.io (Caddy) ─► web:3000 (Next.js) ─► engine:3131
                          └──► api.subsum.io (Caddy) ─┘
                                                     └─► Postgres+pgvector
```

The shared secret (`SUBSUMIO_WEB_API_KEY`) authorizes web-to-engine calls.
`SUBSUMIO_REQUIRE_TENANT=true` makes every request prove its tenant — mandatory
for the hosted SaaS.

---

## Option A — Netcup (EU, empfohlen für Subsumio)

Single EU box running Next.js web + Postgres+pgvector + engine+worker + Caddy
(auto-HTTPS). EU/Germany data residency is the legal confidentiality argument,
avoids Vercel upload caps, and is the cheapest path to **sellable storage** with
real margin. Deploys upload a clean copy of one commit to `/opt/subsumio` —
full runbook + server layout:

➡️ **[`server/deploy/netcup/RUNBOOK.md`](../server/deploy/netcup/RUNBOOK.md)**

```bash
bash scripts/deploy.sh            # deploy origin/main (clean tree, HEAD == origin/main; never commits/pushes)
# or directly:
sh server/deploy/netcup/deploy-code.sh          # full deploy
sh server/deploy/netcup/deploy-code.sh --app    # web + engine only
```

## Option B — any Docker host / VPS

```bash
cd server
docker build -t subsumio-engine .
docker run -d --name subsumio-engine -p 3131:3131 \
  -v subsumio_data:/data \
  -e SUBSUMIO_WEB_API_KEY=$(openssl rand -hex 32) \
  -e SUBSUMIO_REQUIRE_TENANT=true \
  -e OPENAI_API_KEY=<your key> \
  -e DATABASE_URL=<postgres url>   `# omit for embedded PGLite on the volume` \
  subsumio-engine
```

---

## Wire the frontend

On the recommended self-hosted stack these variables live in
`server/deploy/netcup/.env` and are consumed by Docker Compose:

| Variable                     | Value                                       |
| ---------------------------- | ------------------------------------------- |
| `APP_DOMAIN`                 | public dashboard domain, e.g. `subsum.io`   |
| `ENGINE_DOMAIN`              | public engine domain, e.g. `api.subsum.io`  |
| `SUBSUMIO_API_URL`           | `http://engine:3131` inside Compose         |
| `SUBSUMIO_WEB_API_KEY`       | shared web-to-engine secret                 |
| `SUBSUMIO_AUTH_DATABASE_URL` | Compose Postgres URL for the user/org store |
| `NEXT_PUBLIC_APP_URL`        | `https://subsum.io`                         |
| `AUTH_SECRET`                | `openssl rand -hex 32`                      |

The Compose file sets the internal URLs automatically; fill the secrets in
`.env`, then run `docker compose up -d --build`.

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
- **Reverse proxy.** Caddy (the compose default) has **no** request-body size limit
  out of the box, so 1 GB uploads pass through to the web container. If you put
  nginx, Cloudflare, or another proxy in front, raise that layer's body limit too.

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

PDFs **with** a text layer, DOCX, EML, XLSX extract with no system deps. Pages of
a PDF whose text layer is missing, glyph garbage or a failed scanner OCR layer are
rendered with `pdftoppm` at the scan's own resolution and OCR'd page by page:

- `GBRAIN_OCR_ENGINE=auto` (default) uses **local Tesseract** (`deu+eng`) when it
  is installed — no document leaves the host — and falls back to the configured
  vision model otherwise. `local` forbids the model, `vision` forces it.
- Each OCR page carries `[OCR-Seite · Erkennungssicherheit NN %]`; the page's
  frontmatter records `ocr_engine`, `ocr_confidence_mean` and `ocr_confidence_min`.
  A misread "§" in front of a norm citation ("8 1295 ABGB") is corrected.
- System deps `poppler-utils`, `tesseract-ocr`, `tesseract-ocr-deu`,
  `graphicsmagick` are baked into the engine image (Dockerfile). If you run the
  engine outside that image, install them.
- `GBRAIN_OCR_MAX_PAGES` (default 100) caps how many pages are OCR'd synchronously
  per document, so a huge scanned bundle can't time out the upload. Pages beyond
  the cap aren't searchable (a note is added to the extracted text).

---

## Smoke test

```bash
# 1. Engine is alive
curl -s https://<engine-url>/health        # → ok

# 2. Frontend reaches the engine
#    Sign up at https://subsum.io/signup, then in the dashboard:
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
DATABASE_URL=<engine postgres url> bun run server/scripts/auto-embed-pg.ts
```

---

## Still owner-only (accounts, not code)

- Domain (subsumio.com/.de/.ai) + email; point DNS A-records to the server.
- Stripe (products/prices + `STRIPE_*` keys + webhook → `/api/stripe/webhook`).
- Resend (`RESEND_API_KEY` + verified `MAIL_FROM` domain) for digests/invites.
- Upstash Redis (`UPSTASH_REDIS_REST_*`) for distributed rate limiting.
- WorkOS (SSO/SCIM) and SOC 2 — only when the first enterprise lead asks.
