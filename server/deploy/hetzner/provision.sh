#!/usr/bin/env bash
# One-command Hetzner Cloud provisioning for the Subsumio full stack.
# Creates a firewall (22/80/443) + an EU server that auto-installs Docker.
#
# You do once, locally:
#   1. brew install hcloud                     # or see community.hetzner.com/tutorials
#   2. Hetzner Console → project → Security → API Tokens → create (Read & Write)
#        export HCLOUD_TOKEN=<that token>
#   3. Upload your SSH key:
#        hcloud ssh-key create --name subsumio-key \
#          --public-key-from-file ~/.ssh/id_ed25519.pub
# Then:
#   SSH_KEY=subsumio-key bash provision.sh
set -euo pipefail

: "${HCLOUD_TOKEN:?export HCLOUD_TOKEN=<your Hetzner API token> first}"
SSH_KEY="${SSH_KEY:?set SSH_KEY=<name of the ssh key you uploaded to hcloud>}"
SERVER_NAME="${SERVER_NAME:-subsumio}"
SERVER_TYPE="${SERVER_TYPE:-cax21}"   # ARM Ampere · 4 vCPU · 8 GB · 80 GB · ~€7.49/mo
LOCATION="${LOCATION:-fsn1}"          # Falkenstein, Germany — EU data residency
IMAGE="${IMAGE:-ubuntu-24.04}"
FW_NAME="${FW_NAME:-subsumio-fw}"
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "▶ Firewall ($FW_NAME): allow inbound 22, 80, 443"
hcloud firewall create --name "$FW_NAME" >/dev/null 2>&1 || true
for p in 22 80 443; do
  hcloud firewall add-rule "$FW_NAME" --direction in --protocol tcp --port "$p" \
    --source-ips 0.0.0.0/0 --source-ips ::/0 >/dev/null 2>&1 || true
done

echo "▶ Creating server: $SERVER_NAME ($SERVER_TYPE @ $LOCATION, $IMAGE)"
hcloud server create \
  --name "$SERVER_NAME" \
  --type "$SERVER_TYPE" \
  --image "$IMAGE" \
  --location "$LOCATION" \
  --ssh-key "$SSH_KEY" \
  --firewall "$FW_NAME" \
  --user-data-from-file "$HERE/cloud-init.yaml"

IP="$(hcloud server ip "$SERVER_NAME")"
cat <<EOF

✓ Server is up at: $IP

NEXT STEPS (≈10 min, mostly DNS wait):
  1. DNS — point your app and engine A-records at $IP
       e.g.  subsum.io      A  $IP
             api.subsum.io  A  $IP
  2. ssh root@$IP
  3. git clone <THIS_REPO_URL> /opt/subsumio
  4. cd /opt/subsumio/server/deploy/hetzner
     cp .env.example .env && nano .env      # fill APP_DOMAIN, ENGINE_DOMAIN + secrets
  5. docker compose up -d --build           # first build ~3-5 min
  6. curl https://subsum.io/api/health       # expect 200 once TLS issues
     curl https://api.subsum.io/health       # expect 200
  7. Import statutes (AT/DE/CH/EU) into shared read-only sources:
       cd /opt/subsumio
       docker compose -f server/deploy/hetzner/docker-compose.yml exec engine \\
         bun run server/scripts/import-statutes-split.ts --source law-at
       docker compose -f server/deploy/hetzner/docker-compose.yml exec engine \\
         bun run server/scripts/import-statutes-split.ts --source law-de
       docker compose -f server/deploy/hetzner/docker-compose.yml exec engine \\
         bun run server/scripts/import-statutes-split.ts --source law-ch
       docker compose -f server/deploy/hetzner/docker-compose.yml exec engine \\
         bun run server/scripts/import-statutes-split.ts --source law-eu
  8. Sign in at https://subsum.io/signup and run the dashboard smoke test.
EOF
