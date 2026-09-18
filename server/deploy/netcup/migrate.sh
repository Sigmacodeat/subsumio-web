#!/bin/sh
# Moves Subsumio and Sanicura from the Hetzner server to the netcup server.
# Run as root on the OLD (Hetzner) server. Needs SSH from here to the new host:
#   NEW_HOST=root@<neue-ip> sh migrate.sh <phase>
#
# Phases, in this order:
#   images   copy the exact running images (the database keeps its extension
#            versions; no rebuild needed for the cutover)
#   files    copy /opt/caddy, /opt/sanicura, /opt/subsumio incl. the law corpus
#   presync  copy every data volume while everything keeps running
#   final    STOPS the old stacks, copies the last changes, leaves them stopped
#
# The old server's data is never deleted. To roll back, start the stacks there
# again and point DNS back.
set -eu

NEW_HOST="${NEW_HOST:?NEW_HOST=root@<neue-ip> setzen}"
PHASE="${1:?Phase angeben: images | files | presync | final}"
# Dedicated key for the move only; remove it from the new host afterwards.
SSH_KEY="${SSH_KEY:-/root/.ssh/netcup_migrate}"
SSH="ssh -i $SSH_KEY -o BatchMode=yes -o ServerAliveInterval=30 -o StrictHostKeyChecking=accept-new"
RSYNC="rsync -aHAX --numeric-ids --info=progress2 -e \"$SSH\""

# Every volume of the three stacks. Names are kept identical on the new host,
# because the compose files declare most of them as external.
volumes() {
  docker volume ls --format '{{.Name}}' | grep -E '^(hetzner_|subsumio-engine_|caddy-proxy_)'
}

case "$PHASE" in
  images)
    # Move exactly what runs now. Per container: the tags of its image, so the
    # compose files find them by name. When a container runs an image whose tag
    # has since moved (a newer build waiting, or a re-pulled base image), that
    # image has no tag left; it is committed under "<name>:migrated" and tagged
    # back to the compose name on the new host.
    for c in $(docker ps --format '{{.Names}}'); do
      id="$(docker inspect --format '{{.Image}}' "$c")"
      want="$(docker inspect --format '{{.Config.Image}}' "$c")"
      case "$want" in *:*) ;; *) want="$want:latest" ;; esac
      tags="$(docker image inspect --format '{{join .RepoTags " "}}' "$id" 2>/dev/null || true)"
      retag=""
      if [ -z "$tags" ]; then
        tags="${want%%:*}:migrated"
        echo "[images] $c läuft auf einem nicht mehr benannten Abbild, sichere es als $tags"
        docker commit "$c" "$tags" >/dev/null
        retag="$tags"
      fi
      echo "[images] $c -> $tags"
      # shellcheck disable=SC2086
      docker save $tags | gzip -1 | $SSH "$NEW_HOST" 'gunzip | docker load'
      if [ -n "$retag" ]; then
        $SSH "$NEW_HOST" "docker tag $retag $want"
      fi
    done
    ;;

  files)
    for dir in /opt/caddy /opt/sanicura /opt/subsumio; do
      echo "[files] $dir"
      eval "$RSYNC --delete --exclude '.claude/' $dir/ $NEW_HOST:$dir/"
    done
    ;;

  presync | final)
    if [ "$PHASE" = final ]; then
      echo "[final] alte Dienste werden gestoppt"
      docker compose -f /opt/caddy/docker-compose.yml stop
      docker compose -f /opt/subsumio/server/deploy/hetzner/docker-compose.yml stop
      docker compose -f /opt/sanicura/deploy/hetzner/docker-compose.yml stop
    fi
    for v in $(volumes); do
      src="$(docker volume inspect -f '{{.Mountpoint}}' "$v")"
      dst="$($SSH "$NEW_HOST" "docker volume create $v >/dev/null && docker volume inspect -f '{{.Mountpoint}}' $v")"
      echo "[$PHASE] $v"
      eval "$RSYNC --delete $src/ $NEW_HOST:$dst/"
    done
    if [ "$PHASE" = final ]; then
      echo "[final] Daten übertragen. Alte Dienste bleiben gestoppt; neuen Server starten."
    fi
    ;;

  *)
    echo "Unbekannte Phase: $PHASE" >&2
    exit 1
    ;;
esac
