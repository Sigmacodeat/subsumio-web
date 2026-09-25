#!/bin/sh
# Deploys the pushed repository state (origin/main) to the netcup server.
#
# Run from the repository root on the Mac:
#   sh server/deploy/netcup/deploy-code.sh            # build and switch
#   sh server/deploy/netcup/deploy-code.sh --build    # build only, no switch
#   sh server/deploy/netcup/deploy-code.sh --web      # web app only, pipeline keeps running
#   sh server/deploy/netcup/deploy-code.sh --app      # web + engine, pipeline keeps running
#
# The server folder /opt/subsumio is always a clean copy of one commit — no git
# checkout, no leftovers from earlier versions. What lives only on the server
# is carried over explicitly: the compose .env and the import folder. Data
# lives outside the code folder (/opt/subsumio-data, Docker volumes).
#
# Layout on the server:
#   /opt/subsumio        current release (DEPLOYED_COMMIT names the commit)
#   /opt/subsumio-prev   the release before, for a quick way back
#   /opt/subsumio-new    only during a deploy
#   /opt/subsumio-deploy.lock   held for the length of one deploy
#
# ONE deploy at a time. Two runs used to share the upload path and the same
# folders: on 2026-09-20 two parallel deploys left /opt/subsumio with nothing
# but an empty server/ folder, so cron and backup restart-looped and the
# nightly deadline reminders stopped. The lock below makes the second run stop
# with a message instead of joining in, the upload gets a name of its own, and
# the switch refuses when the folder is no longer the one this run prepared
# against.
set -eu

# git archive roots the tarball at the current directory — running this from
# server/ ships a server-only release that then fails the remote layout
# checks. Anchor to the repo root so the script works from any cwd.
cd "$(git rev-parse --show-toplevel)"

HOST="${DEPLOY_HOST:-subsumio-netcup}"
APP=/opt/subsumio
H=server/deploy/netcup
# The compose file also defines a legacy caddy service; the shared proxy lives
# in /opt/caddy. Start only db, clamav and these.
APP_SERVICES="engine web cron backup corpus-pipeline"
BUILD="web engine corpus-pipeline"
# --web: rebuild and replace only the web app. The corpus pipeline keeps
# running (a full deploy interrupts multi-day RIS fetches). cron and backup
# bind-mount files from the code folder, so they are recreated too.
if [ "${1:-}" = "--web" ]; then
  APP_SERVICES="web cron backup"
  BUILD="web"
fi
# --app: like a full deploy, but the corpus pipeline is left alone. Use it
# while a multi-day RIS fetch is running — the pipeline container keeps its
# open files from the previous release folder and finishes its work; the next
# full deploy picks up the new code for it.
if [ "${1:-}" = "--app" ]; then
  APP_SERVICES="engine web cron backup"
  BUILD="web engine"
fi

build_only=0
[ "${1:-}" = "--build" ] && build_only=1

# Ships the PUSHED state (origin/main), never local HEAD: several sessions
# commit in this checkout, and an unpushed local commit once nearly shipped a
# web image without a production fix that was already on origin.
REF="${DEPLOY_REF:-origin/main}"
git fetch -q origin
if [ "$(git rev-parse HEAD)" != "$(git rev-parse "$REF")" ]; then
  echo "[deploy] Hinweis: lokaler Stand weicht von $REF ab — ausgerollt wird $REF." >&2
fi
sha="$(git rev-parse --short "$REF")"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# ── One deploy at a time ────────────────────────────────────────────────
# mkdir is atomic, so exactly one run wins. The loser prints who holds the
# lock and stops; it never removes a lock it does not own.
LOCK="$APP-deploy.lock"
owner="$(id -un)@$(hostname -s) $(date -u '+%Y-%m-%dT%H:%M:%SZ') $sha"
if ! ssh "$HOST" "mkdir '$LOCK' 2>/dev/null"; then
  held="$(ssh "$HOST" "cat '$LOCK/owner' 2>/dev/null" || true)"
  echo "[deploy] Es läuft bereits ein Deploy: ${held:-unbekannt}" >&2
  echo "[deploy] Warten, bis er fertig ist. Läuft sicher keiner mehr (Abbruch," >&2
  echo "         abgebrochene Verbindung), erst prüfen und dann freigeben:" >&2
  echo "           ssh $HOST 'ps -eo etime,args | grep -E \"docker compose|tar -xzf\" | grep -v grep'" >&2
  echo "           ssh $HOST 'rm -rf $LOCK'" >&2
  exit 1
fi
ssh "$HOST" "printf '%s\n' '$owner' > '$LOCK/owner'"
trap 'ssh "$HOST" "rm -rf \"$LOCK\"" >/dev/null 2>&1 || true; rm -rf "$tmp"' EXIT INT TERM

# The upload gets a name of its own: a second run must never overwrite the
# archive a first one is still unpacking.
remote_tar="/root/subsumio-release-$sha-$$.tar.gz"
git archive --format=tar.gz "$REF" > "$tmp/release.tar.gz"
echo "[deploy] $sha hochladen …"
scp -q "$tmp/release.tar.gz" "$HOST:$remote_tar"

ssh "$HOST" "APP=$APP H=$H SHA=$sha TAR=$remote_tar" 'sh -s' <<'REMOTE'
set -eu
[ -d "$APP" ] || { echo "[deploy] $APP fehlt — Server prüfen, nichts umgeschaltet." >&2; exit 1; }
[ -s "$APP/$H/.env" ] || { echo "[deploy] $APP/$H/.env fehlt — nichts umgeschaltet." >&2; exit 1; }
rm -rf "$APP-new"
mkdir "$APP-new"
tar -xzf "$TAR" -C "$APP-new"
rm -f "$TAR"
echo "$SHA" > "$APP-new/DEPLOYED_COMMIT"
# compose needs .env to resolve variables at build time; server/.dockerignore
# keeps it (and every nested .env) out of the image build context.
cp -p "$APP/$H/.env" "$APP-new/$H/.env"
chmod 600 "$APP-new/$H/.env"
# The import mirror is copied only after the build (see below), so it is never
# part of a build context.
# The release must be complete before anything is switched.
for f in package.json "$H/docker-compose.yml" "$H/crontab" "$H/.env" DEPLOYED_COMMIT; do
  [ -s "$APP-new/$f" ] || { echo "[deploy] Unvollständige Version: $f fehlt." >&2; exit 1; }
done
# What the switch will expect to find; it refuses if this changed meanwhile.
cat "$APP/DEPLOYED_COMMIT" 2>/dev/null > "$APP-new/PREVIOUS_COMMIT" || : > "$APP-new/PREVIOUS_COMMIT"
REMOTE

echo "[deploy] Abbilder bauen …"
ssh "$HOST" "cd $APP-new/$H && docker compose -p subsumio-engine build --build-arg GIT_SHA=$sha $BUILD"

# No environment file or import data may end up in an engine image.
check_images=""
for svc in $BUILD; do
  case "$svc" in engine | corpus-pipeline) check_images="$check_images subsumio-engine-$svc" ;; esac
done
if [ -n "$check_images" ]; then
  echo "[deploy] Abbilder auf Geheimnisse prüfen …"
  ssh "$HOST" "sh $APP-new/$H/check-image-secrets.sh$check_images" || {
    echo "[deploy] Abbild enthält .env/Importdaten — nichts umgeschaltet." >&2
    exit 1
  }
fi

ssh "$HOST" "APP=$APP H=$H" 'sh -s' <<'REMOTE'
set -eu
if [ -d "$APP/$H/imports" ] && [ ! -e "$APP-new/$H/imports" ]; then
  cp -a "$APP/$H/imports" "$APP-new/$H/imports"
fi
REMOTE

if [ "$build_only" = 1 ]; then
  echo "[deploy] Gebaut, nicht umgeschaltet. Umschalten: ohne --build erneut ausführen."
  exit 0
fi

echo "[deploy] umschalten …"
ssh "$HOST" "APP=$APP H=$H APP_SERVICES='$APP_SERVICES'" 'sh -s' <<'REMOTE'
set -eu
# Refuse when the current release is not the one this run prepared against —
# someone else switched in the meantime, and moving folders now would mix two
# deploys (that is how /opt/subsumio was emptied on 2026-09-20).
expected="$(cat "$APP-new/PREVIOUS_COMMIT" 2>/dev/null || echo "")"
current="$(cat "$APP/DEPLOYED_COMMIT" 2>/dev/null || echo "")"
if [ ! -d "$APP" ] || [ "$current" != "$expected" ]; then
  echo "[deploy] Der Server hat sich während des Baus verändert" >&2
  echo "         (erwartet: ${expected:-keine Marke}, gefunden: ${current:-keine Marke})." >&2
  echo "         Nichts umgeschaltet. Deploy erneut starten." >&2
  exit 1
fi
rm -f "$APP-new/PREVIOUS_COMMIT"
rm -rf "$APP-prev"
mv "$APP" "$APP-prev"
mv "$APP-new" "$APP"
cd "$APP/$H"
# Recreate everything that bind-mounts files from the code folder, even when
# its image did not change — otherwise it keeps reading $APP-prev.
docker compose -p subsumio-engine up -d --no-build db clamav
docker compose -p subsumio-engine up -d --no-build --force-recreate $APP_SERVICES
REMOTE

echo "[deploy] Warte auf Gesundheit …"
i=0
until [ "$(ssh "$HOST" "docker inspect -f '{{.State.Health.Status}}' subsumio-engine-web-1 subsumio-engine-engine-1" | sort -u)" = "healthy" ]; do
  i=$((i + 1))
  if [ "$i" -ge 36 ]; then
    echo "[deploy] web/engine nicht gesund nach 6 Minuten. Rückweg auf dem Server:" >&2
    echo "  mv $APP $APP-bad && mv $APP-prev $APP && cd $APP/$H && docker compose -p subsumio-engine up -d --build $BUILD" >&2
    exit 1
  fi
  sleep 10
done
echo "[deploy] OK — $sha läuft. Vorherige Version liegt in $APP-prev."
