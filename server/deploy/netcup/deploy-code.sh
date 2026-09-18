#!/bin/sh
# Deploys the committed repository state (HEAD) to the netcup server.
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
# in /opt/caddy. Start only these.
SERVICES="db clamav engine web cron backup corpus-pipeline"
BUILD="web engine corpus-pipeline"

build_only=0
[ "${1:-}" = "--build" ] && build_only=1

if [ -n "$(git status --porcelain --untracked-files=no -- . ':!next-env.d.ts' ':!tsconfig.json')" ]; then
  echo "[deploy] Hinweis: nicht committete Änderungen werden NICHT ausgerollt (nur HEAD)." >&2
fi
sha="$(git rev-parse --short HEAD)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
git archive --format=tar.gz HEAD > "$tmp/release.tar.gz"
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
ssh "$HOST" "cd $APP-new/$H && docker compose -p subsumio-engine build $BUILD"

if [ "$build_only" = 1 ]; then
  echo "[deploy] Gebaut, nicht umgeschaltet. Umschalten: ohne --build erneut ausführen."
  exit 0
fi

echo "[deploy] umschalten …"
ssh "$HOST" "APP=$APP H=$H SERVICES='$SERVICES'" 'sh -s' <<'REMOTE'
set -eu
rm -rf "$APP-prev"
mv "$APP" "$APP-prev"
mv "$APP-new" "$APP"
cd "$APP/$H"
docker compose -p subsumio-engine up -d --no-build $SERVICES
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
