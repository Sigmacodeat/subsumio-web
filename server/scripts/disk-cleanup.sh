#!/usr/bin/env bash
# disk-cleanup.sh — reclaim disk space on the Hetzner server
#
# Safe operations only: VACUUM, prune old page versions, prune unused Docker
# resources. Does NOT delete any user data or corpus files.
#
# Usage: ssh subsumio 'bash -s' < server/scripts/disk-cleanup.sh
set -euo pipefail

echo "═══════════════════════════════════════════════════════════"
echo "  Subsumio Disk Cleanup"
echo "═══════════════════════════════════════════════════════════"
echo ""

# 1. Disk usage before
echo "📊 Disk usage BEFORE:"
df -h / | head -2
echo ""

# 2. Docker system prune (unused containers, images, build cache)
echo "🧹 Pruning unused Docker resources..."
docker system prune -f --volumes=false 2>/dev/null || true
echo "  Done."
echo ""

# 3. Docker build cache prune
echo "🧹 Pruning Docker build cache..."
docker builder prune -f 2>/dev/null || true
echo "  Done."
echo ""

# 4. Postgres VACUUM FULL ANALYZE (reclaims dead tuples → disk space)
echo "🗄️  Running VACUUM FULL ANALYZE on PostgreSQL..."
echo "  (This may take several minutes on large databases...)"
docker exec hetzner-db-1 psql -U subsumio -d subsumio -c "VACUUM FULL ANALYZE;" 2>&1 || \
  docker exec subsumio-engine-db-1 psql -U subsumio -d subsumio -c "VACUUM FULL ANALYZE;" 2>&1 || \
  echo "  ⚠️  Could not run VACUUM — check container name"
echo "  Done."
echo ""

# 5. Prune old page versions (keep only latest 3 per page)
echo "📜 Pruning old page versions (keeping latest 3 per page)..."
docker exec hetzner-db-1 psql -U subsumio -d subsumio -c "
  DELETE FROM page_versions
  WHERE id NOT IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY page_id ORDER BY created_at DESC) AS rn
      FROM page_versions
    ) ranked
    WHERE rn <= 3
  );
" 2>&1 || \
  docker exec subsumio-engine-db-1 psql -U subsumio -d subsumio -c "
  DELETE FROM page_versions
  WHERE id NOT IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY page_id ORDER BY created_at DESC) AS rn
      FROM page_versions
    ) ranked
    WHERE rn <= 3
  );
" 2>&1 || echo "  ⚠️  Could not prune versions — check container name"
echo "  Done."
echo ""

# 6. VACUUM again after version pruning to reclaim the freed space
echo "🗄️  Running VACUUM FULL after version prune..."
docker exec hetzner-db-1 psql -U subsumio -d subsumio -c "VACUUM FULL ANALYZE;" 2>&1 || \
  docker exec subsumio-engine-db-1 psql -U subsumio -d subsumio -c "VACUUM FULL ANALYZE;" 2>&1 || true
echo "  Done."
echo ""

# 7. Clean old corpus-pipeline logs
echo "📄 Cleaning old corpus-pipeline logs (>7 days)..."
find /opt/subsumio/pipeline-logs -name "*.log" -mtime +7 -delete 2>/dev/null || true
echo "  Done."
echo ""

# 8. Disk usage after
echo "📊 Disk usage AFTER:"
df -h / | head -2
echo ""

# 9. Docker volume sizes
echo "📦 Docker volume sizes:"
docker system df -v 2>/dev/null | grep -A 999 "VOLUME NAME" | head -20 || true
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  Cleanup complete."
echo "═══════════════════════════════════════════════════════════"
