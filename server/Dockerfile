# Subsumio Engine — production container.
#
# Runs the HTTP API (OAuth 2.1 + web-api) with the minion worker in-process
# (`serve --http --with-worker`) so dashboard agents actually execute. Bun runs
# the TypeScript directly — no compile step, and the bundled skills/ + schema
# packs ship in the image.
#
# Build context is the server/ directory. Deploy via Railway (railway.json),
# Fly (fly.toml), or any Docker host. See docs/DEPLOY_ENGINE.md.

FROM oven/bun:1

WORKDIR /app

# System deps for scanned-PDF OCR: pdf2pic rasterizes pages via GraphicsMagick +
# Ghostscript; poppler-utils provides pdfinfo/pdftoppm as a fallback rasterizer.
# Without these, OCR of image-only PDFs silently degrades to "no text extracted".
RUN apt-get update \
  && apt-get install -y --no-install-recommends graphicsmagick ghostscript poppler-utils \
  && rm -rf /var/lib/apt/lists/*

# Dependency layer (cached unless package.json/bun.lock change).
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production || bun install --production

# App source (skills/, schema packs, src/ …).
COPY . .

ENV NODE_ENV=production \
    GBRAIN_HOME=/data \
    PORT=3131

# /data persists the embedded PGLite store + config when no external
# DATABASE_URL is provided. Mount a volume here in production. Some migration
# smoke checks invoke `gbrain` directly, so expose the same CLI path used by the
# entrypoint.
RUN mkdir -p /data \
  && chmod +x docker-entrypoint.sh \
  && printf '%s\n' '#!/usr/bin/env sh' 'exec bun run /app/src/cli.ts "$@"' > /usr/local/bin/gbrain \
  && chmod +x /usr/local/bin/gbrain
VOLUME ["/data"]

EXPOSE 3131

# Liveness: the HTTP API exposes GET /health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3131)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["bash", "docker-entrypoint.sh"]
