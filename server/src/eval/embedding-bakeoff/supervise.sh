#!/bin/sh
# Embedding bake-off supervisor (runs on the netcup HOST, not in a container).
#
# Keeps the bake-off going across engine redeploys, which recreate the engine
# container and kill every job in it. Every step is resumable, so the loop
# only has to restart what is not running and not finished:
#   1. build-dataset until manifest.json exists
#   2. one embed job per model, in parallel; Voyage/Cohere only once their
#      key is in the .env file
#   3. score → report.md once every started model is complete
# Stops by itself when report.md is written after all jobs finished, or after
# 24 hours. Log: /root/bakeoff-supervisor.log
#
# Start:  nohup /root/bakeoff-supervise.sh >> /root/bakeoff-supervisor.log 2>&1 &
# Stop:   pkill -f bakeoff-supervise.sh

C=subsumio-engine-engine-1
ENV_FILE=/opt/subsumio/server/deploy/hetzner/.env
OUT=/data/eval/embedding-bakeoff
HOST_OUT=/var/lib/docker/volumes/hetzner_engine-data/_data/eval/embedding-bakeoff
CODE=/data/eval/code
DEADLINE=$(( $(date +%s) + 86400 ))

OPENROUTER_MODELS="te3-small te3-large gemini-embedding-2 qwen3-embedding-8b qwen3-embedding-4b mistral-embed bge-m3 pplx-embed-4b"
RAW_MODELS="te3-small qwen3-embedding-8b"

log() { echo "$(date -u +%FT%TZ) $*"; }

running() {
  # exact bun command line of a job
  docker exec $C ps -eo args 2>/dev/null | grep -Fxq "$1"
}

start() {
  # $1 = log name, $2 = bun command, $3 = "env" to pass the .env file
  if [ "$3" = env ]; then
    docker exec -d --env-file "$ENV_FILE" $C sh -c "cd /app && $2 >> $OUT/logs/$1.log 2>&1"
  else
    docker exec -d $C sh -c "cd /app && $2 >> $OUT/logs/$1.log 2>&1"
  fi
  log "gestartet: $1"
}

complete() {
  # $1 = vector dir name; complete when queries are embedded and docs_done == docs_total
  p="$HOST_OUT/vectors/$1/progress.json"
  [ -f "$p" ] || return 1
  grep -q '"queries_done": true' "$p" || return 1
  done_n=$(sed -n 's/.*"docs_done": \([0-9]*\).*/\1/p' "$p")
  total_n=$(sed -n 's/.*"docs_total": \([0-9]*\).*/\1/p' "$p")
  [ -n "$done_n" ] && [ "$done_n" = "$total_n" ]
}

has_key() { grep -qE "^$1=.+" "$ENV_FILE"; }

log "Supervisor gestartet"
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  if ! docker exec $C true 2>/dev/null; then sleep 30; continue; fi
  docker exec $C mkdir -p $OUT/logs

  if [ ! -f "$HOST_OUT/manifest.json" ]; then
    cmd="bun run $CODE/build-dataset.ts --out $OUT --fixture /data/eval/at-legal-retrieval.jsonl"
    running "$cmd" || start build-dataset "$cmd"
    sleep 60
    continue
  fi

  pending=0
  for m in $OPENROUTER_MODELS; do
    complete "$m" && continue
    pending=1
    cmd="bun run $CODE/embed.ts --out $OUT --concurrency 2 --model $m"
    running "$cmd" || start "$m" "$cmd"
  done
  for m in $RAW_MODELS; do
    complete "$m-raw" && continue
    pending=1
    cmd="bun run $CODE/embed.ts --no-prefix --out $OUT --concurrency 2 --model $m"
    running "$cmd" || start "$m-raw" "$cmd"
  done
  if has_key VOYAGE_API_KEY && ! complete voyage-4-large; then
    pending=1
    cmd="bun run $CODE/embed.ts --out $OUT --concurrency 2 --model voyage-4-large"
    running "$cmd" || start voyage-4-large "$cmd" env
  fi
  if has_key COHERE_API_KEY && ! complete cohere-embed-v4; then
    pending=1
    cmd="bun run $CODE/embed.ts --out $OUT --concurrency 2 --model cohere-embed-v4"
    running "$cmd" || start cohere-embed-v4 "$cmd" env
  fi

  if [ "$pending" = 0 ]; then
    docker exec $C sh -c "cd /app && bun run $CODE/score.ts --out $OUT > $OUT/logs/score.log 2>&1"
    log "Bericht geschrieben: $OUT/report.md"
    # Voyage/Cohere keys may still arrive; keep waiting for them only if
    # neither is complete yet and the deadline allows. Otherwise stop.
    if complete voyage-4-large || ! has_key VOYAGE_API_KEY; then
      if has_key VOYAGE_API_KEY || [ -f "$HOST_OUT/.no-voyage-wait" ]; then
        log "fertig"
        exit 0
      fi
    fi
  fi
  sleep 60
done
log "Zeitlimit erreicht"
