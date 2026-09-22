# Cron-Wahrheit: Server-Crontab vs. `vercel.json`

Stand 2026-09-16 (Launch-Megaplan Phase 4, Repo-Seite). Die App läuft selbst gehostet auf
Netcup; die Jobs feuert **supercronic** im Compose-Service `cron` aus
[`server/deploy/netcup/crontab`](../../server/deploy/netcup/crontab) (gemountet als
`/etc/crontab`, ruft `http://web:3000/api/cron/*` mit `CRON_SECRET`). **Dieser Crontab ist
die Quelle der Wahrheit.** `vercel.json` stammte aus der Vercel-Zeit, wurde von keinem Deploy
mehr gelesen, war gegenüber dem Crontab veraltet und ist am 16.09.2026 entfernt worden; der
Abgleich unten bleibt als Beleg. `src/lib/ingest-schedule.test.ts` prüft seither den Crontab
(Recovery-Worker vorhanden, keine Doppel-Einträge, jede Cron-Route eingeplant).

## Abgleich

| Route                                | `vercel.json`  | Crontab (UTC)  | Befund             |
| ------------------------------------ | -------------- | -------------- | ------------------ |
| `/api/cron/analysis-retry`           | `*/15 * * * *` | `30 * * * *`   | Zeitplan weicht ab |
| `/api/cron/appointment-reminders`    | `0 8 * * *`    | `0 * * * *`    | Zeitplan weicht ab |
| `/api/cron/auto-playbook`            | `0 */6 * * *`  | `0 9 * * *`    | Zeitplan weicht ab |
| `/api/cron/case-law`                 | `0 9 * * *`    | `30 6 * * *`   | Zeitplan weicht ab |
| `/api/cron/case-scanner`             | `0 22 * * *`   | `0 2 * * *`    | Zeitplan weicht ab |
| `/api/cron/contradiction-probe`      | `0 23 * * *`   | `0 3 * * *`    | Zeitplan weicht ab |
| `/api/cron/daily-briefing`           | `0 7 * * *`    | `30 6 * * *`   | Zeitplan weicht ab |
| `/api/cron/dream-cycle`              | `0 2 * * *`    | `30 2 * * *`   | Zeitplan weicht ab |
| `/api/cron/health`                   | —              | `*/10 * * * *` | nur im Crontab     |
| `/api/cron/integrity-recheck`        | —              | `30 3 * * *`   | nur im Crontab     |
| `/api/cron/judgements-sync`          | `0 5 * * *`    | `30 3 * * *`   | Zeitplan weicht ab |
| `/api/cron/law-sync`                 | `0 4 * * *`    | `0 3 * * *`    | Zeitplan weicht ab |
| `/api/cron/regulatory-monitors`      | `0 10 * * *`   | `45 6 * * *`   | Zeitplan weicht ab |
| `/api/cron/ris-delta-watcher`        | —              | `30 2 * * *`   | nur im Crontab     |
| `/api/cron/rundown`                  | `0 18 * * *`   | `0 5 * * *`    | Zeitplan weicht ab |
| `/api/cron/statute-currency`         | —              | `45 2 * * *`   | nur im Crontab     |
| `/api/cron/upload-multipart-cleanup` | `0 * * * *`    | `15 * * * *`   | Zeitplan weicht ab |
| `/api/cron/upload-reconcile`         | `*/5 * * * *`  | `*/10 * * * *` | Zeitplan weicht ab |

Alle übrigen 17 Einträge stimmen überein. Der Crontab enthält 35 Jobs, `vercel.json` 31.

## Ergänzt am 16.09.2026

- `/api/cron/autonomous-engine` läuft jetzt minütlich (Queue-Worker). Kritische Aktionen
  bleiben im Status `requires_approval` und warten auf eine anwaltliche Freigabe; der Job
  führt nichts Unumkehrbares unbeaufsichtigt aus.

## Noch zu tun auf dem Server (braucht SSH, Phase 4)

1. `docker compose exec cron cat /etc/crontab` mit der Repo-Datei vergleichen (Drift durch
   manuelle Edits).
2. `curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/health` muss 200
   liefern; Uptime-Check darauf zeigen lassen.
3. Zeitzone: Container laufen in UTC; die Fristen-Jobs (06:00/07:00 UTC) treffen im Winter
   07:00/08:00 Wien, im Sommer 08:00/09:00 — akzeptiert.

## Wöchentlich

| Zeit         | Endpunkt                   | Zweck                                        |
| ------------ | -------------------------- | -------------------------------------------- |
| Mo 04:20 UTC | `/api/cron/sanctions-sync` | EU-Finanzsanktionsliste neu laden (§ 8c RAO) |
| So 03:00 UTC | `backup/verify.sh`         | Rückspielprobe der jüngsten Sicherung        |
