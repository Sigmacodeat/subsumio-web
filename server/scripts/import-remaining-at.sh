#!/bin/bash
# Import remaining AT sources into local Postgres (no-embed)
cd /Users/msc/subsumio-web

bun run server/scripts/batch-import-from-disk.ts \
  --source law-at --disk-dir law-corpus/at \
  --batch-size 200 --sleep-ms 10 --no-embed > /tmp/import-law-at.log 2>&1

bun run server/scripts/batch-import-from-disk.ts \
  --source law-at-landesrecht --disk-dir law-corpus/at-landesrecht \
  --batch-size 200 --sleep-ms 10 --no-embed > /tmp/import-landesrecht.log 2>&1

bun run server/scripts/batch-import-from-disk.ts \
  --source law-at-staatsvertraege --disk-dir law-corpus/at-staatsvertraege \
  --batch-size 200 --sleep-ms 10 --no-embed > /tmp/import-staatsvertraege.log 2>&1

bun run server/scripts/batch-import-from-disk.ts \
  --source law-at-literatur --disk-dir law-corpus/at-literatur \
  --batch-size 100 --sleep-ms 10 --no-embed > /tmp/import-literatur.log 2>&1

echo "=== ALL REMAINING IMPORTS DONE ===" >> /tmp/import-all-at.log
PGPASSWORD=2bfa7d4107f0b40e171cb508f27a9a703501b160d61957f0 \
  psql -h localhost -p 15432 -U sigmabrain -d sigmabrain \
  -c "SELECT source_id, COUNT(*) as pages FROM pages WHERE source_id LIKE 'law-at%' GROUP BY source_id ORDER BY pages DESC;" \
  > /tmp/import-final-report.log 2>&1
