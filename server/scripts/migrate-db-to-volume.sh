#!/usr/bin/env bash
# migrate-db-to-volume.sh — migrate hetzner_db-data to a larger Hetzner Volume
#
# This script:
#   1. Creates a Hetzner Volume (e.g. 100GB)
#   2. Attaches it to the server
#   3. Stops the DB container
#   4. Copies the DB data to the new volume
#   5. Updates docker-compose.yml to use the new volume
#   6. Starts the DB container
#
# PREREQUISITES:
#   - hcloud CLI installed and authenticated
#   - SSH access to the server
#   - Docker Compose stack running
#
# Usage:
#   hcloud volume create --name subsumio-db-data --size 100 --server <server-id>
#   ssh subsumio 'bash -s' < server/scripts/migrate-db-to-volume.sh
#
# Or run locally with:
#   VOLUME_SIZE=100 SERVER_ID=<id> bash server/scripts/migrate-db-to-volume.sh
set -euo pipefail

VOLUME_SIZE="${VOLUME_SIZE:-100}"
VOLUME_NAME="${VOLUME_NAME:-subsumio-db-data}"
COMPOSE_DIR="/opt/subsumio/server/deploy/hetzner"
OLD_VOLUME="hetzner_db-data"

echo "═══════════════════════════════════════════════════════════"
echo "  Subsumio DB Volume Migration"
echo "  Old: ${OLD_VOLUME} (Docker named volume on system disk)"
echo "  New: ${VOLUME_NAME} (${VOLUME_SIZE}GB Hetzner Volume)"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Step 1: Check if Hetzner Volume is already attached
echo "Step 1: Checking for attached Hetzner Volume..."
VOLUME_DEVICE=$(lsblk -o NAME,SIZE,MOUNTPOINT -b | grep -E "^sd[b-z]" | head -1 | awk '{print $1}' || true)

if [ -z "$VOLUME_DEVICE" ]; then
  echo "  ⚠️  No unmounted Hetzner Volume found."
  echo "  Create and attach one first:"
  echo "    hcloud volume create --name ${VOLUME_NAME} --size ${VOLUME_SIZE} --server <server-id>"
  echo "  Then re-run this script."
  exit 1
fi

VOLUME_PATH="/dev/${VOLUME_DEVICE}"
echo "  Found volume device: ${VOLUME_PATH}"
echo ""

# Step 2: Format and mount the volume
echo "Step 2: Formatting and mounting volume..."
if ! blkid "${VOLUME_PATH}" | grep -q ext4; then
  echo "  Formatting ${VOLUME_PATH} as ext4..."
  mkfs.ext4 -F "${VOLUME_PATH}"
fi

MOUNT_POINT="/mnt/db-data"
mkdir -p "${MOUNT_POINT}"
if ! mountpoint -q "${MOUNT_POINT}"; then
  mount "${VOLUME_PATH}" "${MOUNT_POINT}"
fi

# Add to fstab for persistence
FSTAB_ENTRY="${VOLUME_PATH} ${MOUNT_POINT} ext4 defaults 0 2"
if ! grep -q "${MOUNT_POINT}" /etc/fstab; then
  echo "${FSTAB_ENTRY}" >> /etc/fstab
fi
echo "  Mounted at ${MOUNT_POINT}"
echo ""

# Step 3: Stop the DB container
echo "Step 3: Stopping DB container..."
cd "${COMPOSE_DIR}"
docker compose stop db
echo "  DB stopped."
echo ""

# Step 4: Copy data from old Docker volume to new mount
echo "Step 4: Copying DB data to new volume..."
OLD_VOLUME_PATH=$(docker volume inspect "${OLD_VOLUME}" | grep Mountpoint | awk -F'"' '{print $4}')
echo "  Source: ${OLD_VOLUME_PATH}"
echo "  Target: ${MOUNT_POINT}"

# Use rsync for reliable copy with progress
rsync -aHAX --info=progress2 "${OLD_VOLUME_PATH}/" "${MOUNT_POINT}/"
echo "  Copy complete."
echo ""

# Step 5: Create new Docker volume pointing to the mount
echo "Step 5: Creating Docker volume for Hetzner Volume..."
# Remove old volume reference from compose, create a bind-mount based volume
# We'll use a docker volume with local driver + bind option
docker volume rm subsumio-engine_db-data 2>/dev/null || true

# Update docker-compose.yml: change db-data from external to bind mount
# The compose file uses external:true with name hetzner_db-data
# We replace it with a bind mount to /mnt/db-data
echo "  Updating docker-compose.yml..."

# Backup the compose file
cp docker-compose.yml docker-compose.yml.bak.$(date +%s)

# Use sed to replace the db-data volume definition
# Old:
#   db-data:
#     external: true
#     name: hetzner_db-data
# New:
#   db-data:
#     driver: local
#     driver_opts:
#       type: none
#       o: bind
#       device: /mnt/db-data
python3 -c "
import re
with open('docker-compose.yml') as f:
    content = f.read()
old = '''  db-data:
    external: true
    name: hetzner_db-data'''
new = '''  db-data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/db-data'''
content = content.replace(old, new)
with open('docker-compose.yml', 'w') as f:
    f.write(content)
print('  docker-compose.yml updated')
"
echo ""

# Step 6: Start the DB container
echo "Step 6: Starting DB container with new volume..."
docker compose up -d db
echo "  Waiting for DB to be healthy..."
sleep 10
docker compose ps db
echo ""

# Step 7: Verify
echo "Step 7: Verifying..."
docker compose exec -T db pg_isready -U subsumio -d subsumio
echo ""

# Step 8: Disk usage
echo "Step 8: Disk usage:"
df -h / "${MOUNT_POINT}"
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  Migration complete!"
echo "  DB data is now on a ${VOLUME_SIZE}GB Hetzner Volume."
echo "  System disk is freed from DB storage."
echo ""
echo "  To verify: docker compose exec db psql -U subsumio -d subsumio -c 'SELECT count(*) FROM pages;'"
echo ""
echo "  Old Docker volume '${OLD_VOLUME}' still exists but is unused."
echo "  After verifying everything works, remove it with:"
echo "    docker volume rm ${OLD_VOLUME}"
echo "═══════════════════════════════════════════════════════════"
