#!/bin/sh
# Production readiness gate for the single-box Netcup deployment.
# Reads .env as data (never sources it) and refuses unsafe SaaS launches.
set -eu

env_file="${1:-.env}"
if [ ! -f "$env_file" ]; then
  echo "[preflight] ERROR: $env_file fehlt. Kopiere .env.example und setze Produktionswerte." >&2
  exit 1
fi

value() {
  key="$1"
  sed -n "s/^${key}=//p" "$env_file" | tail -n 1 | sed 's/^"//;s/"$//'
}

failed=0
require_value() {
  key="$1"
  val="$(value "$key")"
  if [ -z "$val" ]; then
    echo "[preflight] MISSING  $key" >&2
    failed=1
  else
    echo "[preflight] OK       $key"
  fi
}

require_exact() {
  key="$1"
  expected="$2"
  actual="$(value "$key")"
  if [ "$actual" != "$expected" ]; then
    echo "[preflight] INVALID  $key muss '$expected' sein (ist '${actual:-leer}')." >&2
    failed=1
  else
    echo "[preflight] OK       $key=$expected"
  fi
}

echo "[preflight] Prüfe Production-Konfiguration: $env_file"
for key in \
  APP_DOMAIN ENGINE_DOMAIN POSTGRES_PASSWORD SUBSUMIO_WEB_API_KEY \
  AUTH_SECRET SUBSUMIO_INTERNAL_SECRET SUBSUMIO_ENCRYPTION_KEY CRON_SECRET \
  ENGINE_WEBHOOK_API_KEY OPENROUTER_API_KEY BACKUP_RESTIC_REPOSITORY \
  BACKUP_RESTIC_PASSWORD SUBSUMIO_STORAGE_ENCRYPTION_KEY \
  RESEND_API_KEY MAIL_FROM RESEND_WEBHOOK_SECRET; do
  require_value "$key"
done

require_exact SUBSUMIO_REQUIRE_TENANT true
require_exact SUBSUMIO_AI_PROVIDER openrouter
require_exact SUBSUMIO_EMBEDDING_MODEL openrouter:openai/text-embedding-3-small
require_exact SUBSUMIO_EMBEDDING_DIMENSIONS 1536
require_exact SUBSUMIO_WEB_URL http://web:3000

require_value PLATFORM_OPERATOR_EMAILS

# Backups: an offsite repo is the goal, a local encrypted copy the minimum.
# A production launch without either loses a firm's files on one disk failure.
if [ -z "$(value BACKUP_RESTIC_REPOSITORY)" ]; then
  if [ -n "$(value BACKUP_LOCAL_PASSPHRASE)" ]; then
    echo "[preflight] WARN     kein Offsite-Backup (BACKUP_RESTIC_REPOSITORY) — nur lokale Kopie."
  else
    echo "[preflight] MISSING  Backup: weder BACKUP_RESTIC_REPOSITORY noch BACKUP_LOCAL_PASSPHRASE." >&2
    failed=1
  fi
fi

free_pct="$(df -P / | awk 'NR==2 {print 100 - int($5)}' | tr -d '%')"
if [ -n "$free_pct" ] && [ "$free_pct" -lt 15 ]; then
  echo "[preflight] MISSING  Nur ${free_pct} % Plattenplatz frei. Ein Rebuild braucht ~6 GB." >&2
  failed=1
else
  echo "[preflight] OK       Plattenplatz frei: ${free_pct} %"
fi

corpus_dir="$(value LAW_CORPUS_HOST_DIR)"
corpus_dir="${corpus_dir:-/opt/subsumio-data/law-corpus}"
case "$corpus_dir" in
  /opt/subsumio/*)
    echo "[preflight] INVALID  LAW_CORPUS_HOST_DIR liegt im Git-Checkout ($corpus_dir). Erst move-corpus-out-of-repo.sh ausführen." >&2
    failed=1
    ;;
  *)
    if [ -d "$corpus_dir" ] && [ -n "$(ls -A "$corpus_dir" 2>/dev/null)" ]; then
      echo "[preflight] OK       LAW_CORPUS_HOST_DIR=$corpus_dir"
    else
      echo "[preflight] MISSING  Korpus-Verzeichnis $corpus_dir fehlt oder ist leer." >&2
      failed=1
    fi
    ;;
esac

backup_repo="$(value BACKUP_RESTIC_REPOSITORY)"
case "$backup_repo" in
  s3:*)
    require_value BACKUP_S3_ACCESS_KEY_ID
    require_value BACKUP_S3_SECRET_ACCESS_KEY
    ;;
esac

if [ "$failed" -ne 0 ]; then
  echo "[preflight] BLOCKED: Produktion nicht starten. Fehlende Werte im Passwortmanager erzeugen und in .env setzen." >&2
  exit 1
fi

if command -v docker >/dev/null 2>&1; then
  docker compose --env-file "$env_file" config -q
  echo "[preflight] OK       docker compose config"
else
  echo "[preflight] WARN     Docker nicht installiert; Compose-Syntax nicht geprüft." >&2
fi

echo "[preflight] PASSED: Konfigurations-Gate erfüllt. Danach Backup-Snapshot und Live-Smoke-Test prüfen."
