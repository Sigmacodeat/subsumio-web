#!/usr/bin/env bash
#
# Subsumio Deploy Script
# Commits all changes, pushes to main, and deploys to Hetzner.
#
# Usage:
#   bash scripts/deploy.sh                    # auto-commit + push + deploy
#   bash scripts/deploy.sh "fix: something"   # custom commit message
#   DEPLOY_HOST=root@subsum.io bash scripts/deploy.sh
#
set -euo pipefail

# ── Config ──
REMOTE_HOST="${DEPLOY_HOST:-root@subsum.io}"
REMOTE_DIR="${DEPLOY_DIR:-/opt/subsumio}"
COMPOSE_FILE="${DEPLOY_COMPOSE:-server/deploy/hetzner/docker-compose.yml}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# ── Colors ──
red()   { printf "\033[31m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
yellow(){ printf "\033[33m%s\033[0m\n" "$*"; }
bold()  { printf "\033[1m%s\033[0m\n" "$*"; }

# ── Step 1: Check for changes ──
if git diff --quiet HEAD -- && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  yellow "No uncommitted changes. Deploying current HEAD to Hetzner..."
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

# ── Step 5: Deploy to Hetzner ──
bold "→ SSH to $REMOTE_HOST — pulling + rebuilding..."
green "  Remote: $REMOTE_DIR"
green "  Compose: $COMPOSE_FILE"

ssh "$REMOTE_HOST" "cd $REMOTE_DIR && \
  git pull origin main && \
  docker compose -f $COMPOSE_FILE up -d --build && \
  docker image prune -f"

green "✓ Deploy complete!"

# ── Step 6: Health check ──
bold "→ Health check..."
sleep 3
if curl -fsS "https://subsum.io/api/health" >/dev/null 2>&1; then
  green "✓ https://subsum.io/api/health → 200 OK"
else
  red "✗ Health check failed — check logs:"
  yellow "  ssh $REMOTE_HOST 'cd $REMOTE_DIR && docker compose -f $COMPOSE_FILE logs --tail=50 web'"
fi

if curl -fsS "https://api.subsum.io/health" >/dev/null 2>&1; then
  green "✓ https://api.subsum.io/health → 200 OK"
else
  yellow "  ⚠ Engine health check failed (may still be starting up)"
fi

bold "Done. 🚀"
