# Backup & Disaster Recovery — Implementierungsplan (P0)

> Status: **geplant, NICHT implementiert.** Existenzieller Punkt: aktuell liegt
> das einzige Backup auf **derselben VM** wie die Produktion. Ein VM-Verlust
> (Hardware, Ransomware, Fehl-`rm`, Hetzner-Ausfall) löscht alle Mandantenakten
> **endgültig**. Für eine Kanzlei ist das berufsrechtlich (§ 50 BRAO) und nach
> DSGVO Art. 32 (1)(c) — „Wiederherstellbarkeit nach einem Zwischenfall" — nicht
> tragbar.
>
> Dieser Plan ist umsetzungsfertig: was Code ist, was du als Infra bereitstellst,
> Restore-Drill, automatisierte Restore-Verifikation, RPO/RTO. Stand: 2026-06-28.

## Ist-Zustand (verifiziert)

Drei zustandsbehaftete Docker-Volumes auf der Hetzner-VM
(`server/deploy/hetzner/docker-compose.yml`):

| Volume        | Inhalt                                                                              | Kritikalität                               |
| ------------- | ----------------------------------------------------------------------------------- | ------------------------------------------ |
| `db-data`     | Postgres = das **Brain** (pages, embeddings, frontmatter, cases, minion_jobs, auth) | **P0 — unwiederbringlich**                 |
| `engine-data` | `/data` = hochgeladene **Originaldateien** (wenn `STORAGE_BACKEND=local`)           | **P0 — unwiederbringlich** (GoBD § 147 AO) |
| `clamav-data` | Virensignaturen                                                                     | egal (regeneriert sich)                    |

Datei-Storage ist `local | s3 | supabase` (`server/src/core/storage.ts`). Bei
`s3`/`r2` liegen Originale schon außerhalb der VM; bei `local` liegen sie NUR auf
`engine-data`. Heutige Doku (`deploy/hetzner/README.md`): manuelles
`pg_dump > backup.sql` — **kein Offsite, keine Verschlüsselung, kein Restore-Test.**

## Ziel (RPO / RTO)

- **RPO** (max. Datenverlust): **24 h** als Basis (tägliches Backup). Optional
  **1 h** via WAL-Archivierung (als Ausbaustufe vermerkt).
- **RTO** (max. Ausfallzeit bis Wiederherstellung): **< 1 h**, mit dokumentiertem
  - erprobtem Restore-Runbook.
- **3-2-1-Regel:** 3 Kopien, 2 Medien, **1 offsite** und **verschlüsselt**.

## Werkzeug-Wahl: `restic` → S3-kompatibler Offsite-Bucket

Ein Tool deckt vier Anforderungen ab: **clientseitige Verschlüsselung**
(AES-256, löst zugleich Gap 3 für Backups), Deduplizierung, Retention
(`forget --prune`) und Integritätsprüfung (`restic check`) inkl. erprobtem
`restic restore`. Alternative `pgBackRest` ist mächtiger (PITR) aber schwerer;
für den ersten belastbaren Stand ist restic die richtige Größe.

**Offsite-Ziel** (du wählst, anderer Anbieter/Standort als die Hetzner-VM):
Cloudflare R2, Backblaze B2 oder AWS S3 (alle S3-kompatibel). Empfehlung: **R2
oder B2** (günstig, kein Egress bei R2). Bucket mit **Object Lock / Versioning**
für Ransomware-Schutz (unveränderliche Backups).

## Was du als Infra bereitstellst (kein Code)

1. **Offsite-Bucket** bei R2/B2/S3 anlegen (eigene Region, NICHT Hetzner-VM).
2. **Zugangs-Keys** mit Schreibrecht nur auf diesen Bucket (least privilege).
3. **restic-Repo-Passwort** generieren (`openssl rand -base64 48`) und sicher
   ablegen (Passwort-Manager + Offline-Kopie). **Ohne dieses Passwort sind die
   Backups unwiederbringlich** — es darf NICHT nur auf der VM liegen.
4. Werte in `server/deploy/hetzner/.env` setzen (siehe `.env.example`-Block unten).
5. Object Lock / Versioning am Bucket aktivieren (Anbieter-UI).

> Credentials werden NUR von dir gesetzt — der Code liest sie aus der Umgebung,
> sie stehen nie im Repo.

## Was Code/Config ist (wird bei Freigabe geliefert)

### 1. Backup-Service (docker-compose)

Neuer Service `backup` im `docker-compose.yml`:

```yaml
backup:
  image: restic/restic:latest # + ein kleines Entrypoint-Script
  restart: unless-stopped
  env_file: .env
  environment:
    RESTIC_REPOSITORY: ${BACKUP_RESTIC_REPOSITORY} # z.B. s3:https://<acct>.r2.cloudflarestorage.com/<bucket>
    RESTIC_PASSWORD: ${BACKUP_RESTIC_PASSWORD}
    AWS_ACCESS_KEY_ID: ${BACKUP_S3_ACCESS_KEY_ID}
    AWS_SECRET_ACCESS_KEY: ${BACKUP_S3_SECRET_ACCESS_KEY}
    PGHOST: db
    PGUSER: ${POSTGRES_USER:-subsumio}
    PGPASSWORD: ${POSTGRES_PASSWORD}
    PGDATABASE: ${POSTGRES_DB:-subsumio}
  volumes:
    - engine-data:/data:ro # Originaldateien (nur bei STORAGE_BACKEND=local nötig)
  depends_on:
    db: { condition: service_healthy }
  entrypoint: ["/bin/sh", "/backup/run.sh"] # Script unten, als Config-Mount
```

### 2. `server/deploy/hetzner/backup/run.sh` (NEU)

Loop (oder über supercronic getaktet), pro Lauf:

```sh
set -euo pipefail
# 1) Postgres logisch dumpen (custom format, komprimiert)
pg_dump -Fc -f /tmp/brain.dump
# 2) restic-Repo bei Bedarf initialisieren (idempotent)
restic snapshots >/dev/null 2>&1 || restic init
# 3) DB-Dump + (bei local storage) Originaldateien verschlüsselt offsite sichern
restic backup /tmp/brain.dump /data --tag subsumio --host subsumio-prod
rm -f /tmp/brain.dump
# 4) Retention: 7 täglich, 4 wöchentlich, 6 monatlich; alte prunen
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
# 5) Integrität stichprobenartig prüfen
restic check --read-data-subset=5%
```

Takt: **täglich 01:00 UTC** (vor dem Dream-Cycle). Eintrag im
`server/deploy/hetzner/crontab` ODER als `setInterval` im Entrypoint.

### 3. `server/deploy/hetzner/backup/restore.sh` (NEU — das Runbook als Skript)

```sh
# Holt den jüngsten (oder per --snapshot gewählten) Stand und stellt wieder her.
restic restore latest --target /restore --include /tmp/brain.dump
# DB wiederherstellen (in eine FRISCHE DB; niemals blind über die Prod-DB):
pg_restore --clean --if-exists -d "$TARGET_DATABASE_URL" /restore/tmp/brain.dump
# Originaldateien zurückspielen (bei local storage):
restic restore latest --target / --include /data
```

### 4. Automatisierte Restore-Verifikation (das fehlende „getestet")

Ein **wöchentlicher** Job (Cron-Route `GET /api/cron/backup-verify` ODER ein
Schritt im backup-Service), der beweist, dass das Backup wirklich restaurierbar
ist — nicht nur „existiert":

1. Jüngsten `restic` Snapshot in eine **Wegwerf-Datenbank** restoren
   (`pg_restore` in `subsumio_restore_check`).
2. Sanity-Asserts: `SELECT count(*) FROM pages > 0`, `FROM files > 0`,
   Schema-Version == erwartet.
3. Wegwerf-DB droppen.
4. Bei Fehler/Null-Counts → Mail an `QUEUE_ALERT_EMAIL` (reuse aus Gap 8).
   Ergebnis (Snapshot-ID, Zeilenzahlen, Dauer) ins Monitoring schreiben.

Das schließt die im Bericht genannte Lücke „getesteter Restore" und macht
RTO/RPO **nachweisbar** statt behauptet.

### 5. Doku + `.env.example`

`server/deploy/hetzner/.env.example` ergänzen:

```sh
# ── Offsite-Backup (restic) ──────────────────────────────────────────────
BACKUP_RESTIC_REPOSITORY=s3:https://<account>.r2.cloudflarestorage.com/<bucket>
BACKUP_RESTIC_PASSWORD=          # openssl rand -base64 48 — SICHER + OFFLINE ablegen!
BACKUP_S3_ACCESS_KEY_ID=
BACKUP_S3_SECRET_ACCESS_KEY=
QUEUE_ALERT_EMAIL=               # bereits aus Gap 8 — Backup-Alarme gehen hierhin
```

`deploy/hetzner/README.md`: den manuellen `pg_dump`-Hinweis durch das
Backup/Restore-Runbook ersetzen.

## DSGVO-Wechselwirkung (festhalten)

Backups bewahren auch **gelöschte** Daten für die Retention-Fenster auf. Das
muss im Verzeichnis von Verarbeitungstätigkeiten stehen; die restic-`forget`-
Policy begrenzt das Fenster. Ein DSGVO-Löschauftrag (`retention`-Cron) wirkt erst
nach Ablauf der Backup-Retention vollständig — das ist rechtlich zulässig, aber
dokumentationspflichtig.

## Umsetzungsreihenfolge (bei Freigabe + Infra)

1. Du: Bucket + Keys + restic-Passwort anlegen, `.env` setzen, Object Lock an.
2. `backup`-Service + `run.sh` + crontab-Eintrag → deploy → erster Snapshot.
3. `restic snapshots` prüfen (Offsite-Kopie existiert + verschlüsselt).
4. `restore.sh` + Restore-Verifikations-Cron → deploy.
5. **Restore-Drill:** einmal vollständig in eine Staging-Umgebung restoren,
   Login + ein Mandantendokument öffnen → RTO messen, ins Runbook schreiben.
6. Verifikations-Cron eine Woche grün → DR als „nachgewiesen" markieren.

## Test-Gate (Abnahme)

- [ ] `restic snapshots` zeigt täglich neue, verschlüsselte Snapshots offsite.
- [ ] Restore-Verifikations-Cron läuft wöchentlich grün (Wegwerf-DB,
      Zeilenzahlen > 0).
- [ ] Einmaliger manueller Full-Restore-Drill erfolgreich, RTO dokumentiert.
- [ ] Bucket Object Lock/Versioning aktiv (Ransomware-resistent).
- [ ] restic-Passwort offline gesichert (nicht nur auf der VM).
