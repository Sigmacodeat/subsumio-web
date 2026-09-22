#!/usr/bin/env bash
# E2E Postgres bootstrap — creates a throwaway `subsumio_e2e` database and
# applies the full engine schema (saas_*/auth tables included). Called by
# the Playwright webServer command before `next dev` starts. Idempotent:
# drop + create + migrate is deterministic and isolated from any real DB.
#
# Connection honors the standard PG* env vars (PGHOST/PGPORT/PGUSER/
# PGPASSWORD) — unset locally they hit the developer's unix socket; in CI
# they point at the postgres service container (TCP, password auth).
set -e

DB_NAME="${SUBSUMIO_E2E_DB:-subsumio_e2e}"
# Full URL for the engine schema bootstrap + the app's auth store. Defaults
# to the local socket-adjacent TCP URL; CI overrides with credentials via
# SUBSUMIO_E2E_DB_URL (kept in sync with playwright.config.ts).
DB_URL="${SUBSUMIO_E2E_DB_URL:-postgres://localhost:5432/${DB_NAME}}"

dropdb --if-exists "$DB_NAME" 2>/dev/null || true
createdb "$DB_NAME"

cd "$(dirname "$0")/../server"
GBRAIN_ENGINE=postgres \
GBRAIN_DATABASE_URL="$DB_URL" \
GBRAIN_BRAIN_ID=e2e \
GBRAIN_DATA_DIR="$(mktemp -d /tmp/gbrain-e2e-init-XXXXXX)" \
  bun run src/cli.ts stats >/dev/null
