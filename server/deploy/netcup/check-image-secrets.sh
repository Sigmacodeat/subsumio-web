#!/bin/sh
# Refuses an engine image that carries environment files or firm import data.
# Run on the host after `docker compose build`, before switching:
#   sh check-image-secrets.sh subsumio-engine-engine [more images …]
# Exit 0: clean. Exit 1: a forbidden file is in an image (deploy must stop).
set -eu

[ "$#" -gt 0 ] || { echo "usage: $0 IMAGE [IMAGE …]" >&2; exit 2; }

status=0
for image in "$@"; do
  found="$(docker run --rm --network none --entrypoint sh "$image" -c '
    find /app -path /app/node_modules -prune -o \
      \( -name ".env" -o \( -name ".env.*" ! -name ".env.example" \) -o \( -type d -name imports \) \) \
      -print 2>/dev/null
  ')" || { echo "[check-image-secrets] $image konnte nicht geprüft werden." >&2; status=1; continue; }
  if [ -n "$found" ]; then
    echo "[check-image-secrets] $image enthält Dateien, die nicht ins Abbild gehören:" >&2
    echo "$found" | sed 's/^/  /' >&2
    status=1
  fi
done
exit "$status"
