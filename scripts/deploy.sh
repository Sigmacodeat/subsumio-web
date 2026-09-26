#!/usr/bin/env bash
#
# Subsumio Deploy Script
# Deploys the reviewed, pushed state of main to the Netcup server — and only
# that. It never stages, commits or pushes: several sessions share this
# checkout, and "commit everything and push" once carried unrelated,
# half-finished work straight into production.
#
# Usage:
#   bash scripts/deploy.sh             # full deploy
#   bash scripts/deploy.sh --app       # web + engine, corpus pipeline keeps running
#   bash scripts/deploy.sh --web       # web app only
#   DEPLOY_HOST=subsumio-netcup bash scripts/deploy.sh
#
# Preconditions (checked, the script stops otherwise):
#   - clean working tree (no staged, unstaged or untracked changes)
#   - local HEAD equals origin/main (merge + push happen through review first)
#
# The actual build + switch happens in server/deploy/netcup/deploy-code.sh —
# it uploads a clean copy of origin/main to /opt/subsumio (no git checkout on
# the server) and is guarded by a deploy lock.
#
set -euo pipefail

REMOTE_HOST="${DEPLOY_HOST:-subsumio-netcup}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

red()   { printf "\033[31m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
yellow(){ printf "\033[33m%s\033[0m\n" "$*"; }
bold()  { printf "\033[1m%s\033[0m\n" "$*"; }

# ── Step 1: clean tree ──
if [ -n "$(git status --porcelain)" ]; then
  red "✗ Arbeitsbaum nicht sauber — Deploy abgebrochen. Nichts wird committet oder gepusht."
  git status --short >&2
  exit 1
fi

# ── Step 2: HEAD is exactly the pushed main ──
git fetch -q origin main
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  red "✗ HEAD ($(git rev-parse --short HEAD)) ist nicht origin/main ($(git rev-parse --short origin/main)) — Deploy abgebrochen."
  yellow "  Änderungen über Review nach main bringen, dann erneut starten."
  exit 1
fi

# ── Step 3: deploy ──
bold "→ Deploy von origin/main ($(git rev-parse --short HEAD)) nach $REMOTE_HOST …"
DEPLOY_HOST="$REMOTE_HOST" sh server/deploy/netcup/deploy-code.sh "$@"
green "✓ Deploy complete!"

# ── Step 4: health check ──
bold "→ Health check..."
sleep 3
if curl -fsS "https://subsum.io/api/health" >/dev/null 2>&1; then
  green "✓ https://subsum.io/api/health → 200 OK"
else
  red "✗ Health check failed — check logs:"
  yellow "  ssh $REMOTE_HOST 'docker logs subsumio-engine-web-1 --tail 50'"
fi

if curl -fsS "https://api.subsum.io/health" >/dev/null 2>&1; then
  green "✓ https://api.subsum.io/health → 200 OK"
else
  yellow "  ⚠ Engine health check failed (may still be starting up)"
fi
