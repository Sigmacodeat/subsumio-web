#!/bin/sh
# Shared helpers for the Subsumio backup/restore scripts.
# Sourced by run.sh / verify.sh. POSIX sh (alpine /bin/sh = busybox ash).

# Emit an alert. Logs to stderr always; additionally emails QUEUE_ALERT_EMAIL
# via Resend when configured. Deliberately self-contained (curl + Resend HTTP
# API) so disaster-recovery never depends on the web app being up.
alert() {
  msg=$1
  echo "[backup] ALERT: ${msg}" >&2
  if [ -n "${RESEND_API_KEY:-}" ] && [ -n "${QUEUE_ALERT_EMAIL:-}" ]; then
    # JSON-escape the message (quotes + backslashes) for a safe payload.
    esc=$(printf '%s' "${msg}" | sed 's/\\/\\\\/g; s/"/\\"/g')
    curl -fsS -X POST https://api.resend.com/emails \
      -H "Authorization: Bearer ${RESEND_API_KEY}" \
      -H "Content-Type: application/json" \
      -d "{\"from\":\"${MAIL_FROM:-Subsumio <hello@subsum.io>}\",\"to\":\"${QUEUE_ALERT_EMAIL}\",\"subject\":\"⚠️ Subsumio Backup-Alarm\",\"text\":\"${esc}\"}" \
      >/dev/null 2>&1 || echo "[backup] (alert email failed to send)" >&2
  fi
}
