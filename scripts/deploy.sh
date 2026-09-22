#!/usr/bin/env bash
#
# Subsumio Deploy Script
# Commits all changes, pushes to main, and deploys to the Netcup server.
#
# Usage:
#   bash scripts/deploy.sh                    # auto-commit + push + deploy
#   bash scripts/deploy.sh "fix: something"   # custom commit message
#   DEPLOY_HOST=subsumio-netcup bash scripts/deploy.sh
#
# The actual build + switch happens in server/deploy/netcup/deploy-code.sh —
# it uploads a clean copy of one commit to /opt/subsumio (no git checkout on
# the server) and is guarded by a deploy lock.
#
set -euo pipefail

# ── Config ──
REMOTE_HOST="${DEPLOY_HOST:-subsumio-netcup}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# ── Colors ──
red()   { printf "\033[31m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
yellow(){ printf "\033[33m%s\033[0m\n" "$*"; }
bold()  { printf "\033[1m%s\033[0m\n" "$*"; }

# ── Step 1: Check for changes ──
if git diff --quiet HEAD -- && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  yellow "No uncommitted changes. Deploying current HEAD to Netcup..."
else
  # ── Step 2: Stage everything ──
  bold "→ Staging all changes..."
  git add -A

  # ── Step 3: Commit ──
  COMMIT_MSG="${1:-chore: deploy $(date +%Y-%m-%d_%H:%M)}"
  bold "→ Committing: $COMMIT_MSG"
  git commit -m "$COMMIT_MSG"
fi

# ── Step 4: Push ──
bold "→ Pushing to origin/main..."
git push origin main
green "✓ Push complete"

# ── Step 5: Deploy to Netcup ──
bold "→ Deploying to $REMOTE_HOST via server/deploy/netcup/deploy-code.sh..."
DEPLOY_HOST="$REMOTE_HOST" sh server/deploy/netcup/deploy-code.sh

green "✓ Deploy complete!"

# ── Step 6: Health check ──
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

bold "Done. 🚀"
