#!/usr/bin/env bash
# Sigmabrain Engine container entrypoint.
#
#   1. Pick the storage engine:
#        - DATABASE_URL set  → Postgres + pgvector (recommended for multi-tenant SaaS)
#        - DATABASE_URL unset → embedded PGLite on the GBRAIN_HOME volume (/data)
#   2. Apply schema migrations (idempotent).
#   3. Start the HTTP API + in-process minion worker, listening on $PORT / 0.0.0.0.
set -euo pipefail

PORT="${PORT:-3131}"
GBRAIN_HOME="${GBRAIN_HOME:-/data}"

if [ -z "${DATABASE_URL:-}${GBRAIN_DATABASE_URL:-}" ]; then
  # PGLite mode: write a minimal config once so the engine doesn't default to Postgres.
  mkdir -p "$GBRAIN_HOME"
  if [ ! -f "$GBRAIN_HOME/config.json" ]; then
    echo "[entrypoint] no DATABASE_URL → embedded PGLite at $GBRAIN_HOME/brain"
    printf '{"engine":"pglite","database_path":"%s/brain"}\n' "$GBRAIN_HOME" > "$GBRAIN_HOME/config.json"
  fi
else
  echo "[entrypoint] DATABASE_URL present → Postgres engine"
fi

echo "[entrypoint] applying schema migrations…"
bun run src/cli.ts apply-migrations || bun run src/cli.ts migrate || {
  echo "[entrypoint] WARNING: migration command returned non-zero; serve will retry pending migrations on boot." >&2
}

echo "[entrypoint] starting HTTP API + in-process worker on 0.0.0.0:$PORT"
exec bun run src/cli.ts serve --http --with-worker --bind 0.0.0.0 --port "$PORT"
