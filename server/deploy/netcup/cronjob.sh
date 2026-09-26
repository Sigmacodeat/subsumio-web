#!/bin/sh
# Runs one scheduled web-app job and makes its outcome visible.
#
#   sh /etc/cronjob.sh <name> <path> [extra curl options…]
#   e.g. sh /etc/cronjob.sh deadlines /api/cron/deadlines --max-time 300
#
# - Calls http://web:3000<path> with the cron bearer token. `-f` turns an HTTP
#   error (the routes answer 5xx when a run had errors) into a non-zero exit;
#   every call has a time limit (CRON_MAX_TIME, default 3300 s, below the hourly slot; a later
#   --max-time in the options wins).
# - Success: pings CRON_HEARTBEAT_URL_<NAME> when set (dead-man's switch,
#   e.g. Healthchecks.io / Uptime Kuma). A failed ping is logged only.
# - Failure: logs FAILED, mails QUEUE_ALERT_EMAIL via Resend when configured
#   (at most once per job per CRON_ALERT_INTERVAL_SECONDS, default 3600), and
#   exits with curl's code so supercronic records the job as failed.
# POSIX sh (alpine busybox ash). Never prints the token or response bodies of
# failed calls into the alert.
set -u

name="${1:?job name}"
path="${2:?job path}"
shift 2

base="${CRON_TARGET_BASE:-http://web:3000}"
var="$(printf '%s' "$name" | tr 'a-z-' 'A-Z_' | tr -cd 'A-Z0-9_')"
state_dir="${CRON_ALERT_STATE_DIR:-/tmp/cronjob-alerts}"
state_file="$state_dir/$var"

out="$(curl -fsS --max-time "${CRON_MAX_TIME:-3300}" \
  -H "Authorization: Bearer ${CRON_SECRET:-}" "$@" "$base$path" 2>&1)"
rc=$?
[ -n "$out" ] && printf '%s\n' "$out"

if [ "$rc" -eq 0 ]; then
  rm -f "$state_file" 2>/dev/null
  eval "hb=\${CRON_HEARTBEAT_URL_$var:-}"
  if [ -n "$hb" ]; then
    curl -fsS --max-time 10 -o /dev/null "$hb" || echo "[cron] heartbeat ping failed: $name" >&2
  fi
  exit 0
fi

echo "[cron] FAILED $name (exit $rc)" >&2

now="$(date +%s)"
last=0
[ -f "$state_file" ] && last="$(cat "$state_file" 2>/dev/null || echo 0)"
case "$last" in '' | *[!0-9]*) last=0 ;; esac
interval="${CRON_ALERT_INTERVAL_SECONDS:-3600}"
if [ $((now - last)) -ge "$interval" ]; then
  mkdir -p "$state_dir" 2>/dev/null
  printf '%s\n' "$now" >"$state_file" 2>/dev/null
  if [ -n "${RESEND_API_KEY:-}" ] && [ -n "${QUEUE_ALERT_EMAIL:-}" ]; then
    # Only curl's own error line (e.g. "returned error: 503"), JSON-escaped.
    reason="$(printf '%s' "$out" | grep '^curl:' | tail -n 1 | sed 's/\\/\\\\/g; s/"/\\"/g')"
    curl -fsS --max-time 20 -X POST https://api.resend.com/emails \
      -H "Authorization: Bearer ${RESEND_API_KEY}" \
      -H "Content-Type: application/json" \
      -d "{\"from\":\"${MAIL_FROM:-Subsumio <hello@subsum.io>}\",\"to\":\"${QUEUE_ALERT_EMAIL}\",\"subject\":\"Subsumio Cron-Alarm: ${name}\",\"text\":\"Geplanter Job ${name} (${path}) ist fehlgeschlagen, Exit-Code ${rc}. ${reason}\"}" \
      >/dev/null 2>&1 || echo "[cron] alert mail failed to send: $name" >&2
  else
    echo "[cron] no alert channel (RESEND_API_KEY/QUEUE_ALERT_EMAIL unset): $name" >&2
  fi
fi
exit "$rc"
