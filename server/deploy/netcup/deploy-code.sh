#!/bin/sh
# Deploys the pushed repository state (origin/main) to the netcup server.
#
# Run from the repository root on the Mac:
#   sh server/deploy/netcup/deploy-code.sh            # build and switch
#   sh server/deploy/netcup/deploy-code.sh --build    # build only, no switch
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
set -eu

HOST="${DEPLOY_HOST:-subsumio-netcup}"
APP=/opt/subsumio
H=server/deploy/hetzner
# The compose file also defines a legacy caddy service; the shared proxy lives
# in /opt/caddy. Start only db, clamav and these.
APP_SERVICES="engine web cron backup corpus-pipeline"
BUILD="web engine corpus-pipeline"

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
git archive --format=tar.gz "$REF" > "$tmp/release.tar.gz"
echo "[deploy] $sha hochladen …"
scp -q "$tmp/release.tar.gz" "$HOST:/root/subsumio-release.tar.gz"

ssh "$HOST" "APP=$APP H=$H SHA=$sha" 'sh -s' <<'REMOTE'
set -eu
rm -rf "$APP-new"
mkdir "$APP-new"
tar -xzf /root/subsumio-release.tar.gz -C "$APP-new"
echo "$SHA" > "$APP-new/DEPLOYED_COMMIT"
cp -p "$APP/$H/.env" "$APP-new/$H/.env"
chmod 600 "$APP-new/$H/.env"
[ -d "$APP/$H/imports" ] && cp -a "$APP/$H/imports" "$APP-new/$H/imports"
REMOTE

echo "[deploy] Abbilder bauen …"
ssh "$HOST" "cd $APP-new/$H && docker compose -p subsumio-engine build --build-arg GIT_SHA=$sha $BUILD"

if [ "$build_only" = 1 ]; then
  echo "[deploy] Gebaut, nicht umgeschaltet. Umschalten: ohne --build erneut ausführen."
  exit 0
fi

echo "[deploy] umschalten …"
ssh "$HOST" "APP=$APP H=$H APP_SERVICES='$APP_SERVICES'" 'sh -s' <<'REMOTE'
set -eu
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
