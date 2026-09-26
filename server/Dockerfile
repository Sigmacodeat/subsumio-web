# Subsumio Engine — production container.
#
# Runs the HTTP API (OAuth 2.1 + web-api) with the minion worker in-process
# (`serve --http --with-worker`) so dashboard agents actually execute. Bun runs
# the TypeScript directly — no compile step, and the bundled skills/ + schema
# packs ship in the image.
#
# Build context is the server/ directory. Deploy on Netcup via
# server/deploy/netcup/deploy-code.sh (compose: deploy/netcup/docker-compose.yml), or any Docker host.

# Same Bun as the web image and CI — a floating `oven/bun:1` pulled whatever
# 1.x was current at build time.
FROM oven/bun:1.3.13

WORKDIR /app

# System deps for scanned-document OCR: poppler-utils (pdftoppm/pdfimages)
# renders scanned PDF pages at the scan's own resolution, Tesseract with the
# German model recognizes them on this host (no document leaves the server),
# GraphicsMagick decodes TIFF/BMP for the vision fallback. Without these, OCR
# of image-only PDFs degrades to "no text extracted" (reported, never silent).
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    graphicsmagick ghostscript poppler-utils pst-utils qpdf \
    tesseract-ocr tesseract-ocr-deu \
    libreoffice-core libreoffice-writer libreoffice-calc libreoffice-impress \
    postgresql-client \
  && rm -rf /var/lib/apt/lists/*

# Dependency layer (cached unless package.json/bun.lock change).
# patches/ must land before bun install — package.json's patchedDependencies
# points at patch files that bun resolves during install.
COPY package.json bun.lock ./
COPY patches ./patches
# No fallback: a lockfile that does not match package.json fails the build
# instead of silently resolving newer dependency versions.
RUN bun install --frozen-lockfile --production

# App source (skills/, schema packs, src/ …).
COPY . .

ENV NODE_ENV=production \
    GBRAIN_HOME=/data \
    PORT=3131

# /data persists the embedded PGLite store + config when no external
# DATABASE_URL is provided. Mount a volume here in production. Some migration
# smoke checks invoke `gbrain` directly, so expose the same CLI path used by the
# entrypoint.
#
# The engine parses untrusted uploads (LibreOffice, Ghostscript, qpdf,
# readpst), so it runs as an unprivileged user: it can write /data (its
# volume), its home and /tmp, but not the application code under /app.
# deploy-code.sh hands ownership of the existing data volume to this uid
# before the first switch (ENGINE_UID must match there).
RUN groupadd --system --gid 10001 engine \
  && useradd --system --uid 10001 --gid engine --create-home --home-dir /home/engine \
    --shell /usr/sbin/nologin engine \
  && mkdir -p /data \
  && chown engine:engine /data \
  && chmod +x docker-entrypoint.sh \
  && printf '%s\n' '#!/usr/bin/env sh' 'exec bun run /app/src/cli.ts "$@"' > /usr/local/bin/gbrain \
  && chmod +x /usr/local/bin/gbrain
VOLUME ["/data"]
USER engine
ENV HOME=/home/engine

EXPOSE 3131

# Liveness: the HTTP API exposes GET /health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3131)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["bash", "docker-entrypoint.sh"]

# Last on purpose: a per-deploy value here keeps every layer above cached.
# The commit this image was built from (set by server/deploy/netcup/deploy-code.sh).
# Without it the label inherited from the base image named a foreign revision.
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.revision=$GIT_SHA
