# Umzug Hetzner → netcup (Subsumio und Sanicura)

Ziel: netcup RS 8000 G12 (16 dedizierte Kerne, 64 GB RAM, 2 TB NVMe), Debian 13, 159.195.113.101 (ssh-Alias `subsumio-netcup`).
Quelle: Hetzner CX43 `subsumio-fresh`, 46.224.0.141 (ssh-Alias `subsumio-hetzner`).

Grundsatz: Zuerst wird **identisch** umgezogen (gleiche Abbilder, gleiche Daten), erst danach
wird neuer Code ausgerollt. So lässt sich jeder Fehler eindeutig einer Ursache zuordnen, und
der Rückweg ist jederzeit: alte Dienste starten, DNS zurück.

## Was umzieht

| Einheit       | Ort alt         | Inhalt                                                                                                                                                                  |
| ------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reverse Proxy | `/opt/caddy`    | Caddyfile, Zertifikate in `caddy-proxy_caddy-data`                                                                                                                      |
| Sanicura      | `/opt/sanicura` | Compose-Projekt `hetzner`, Volumes `hetzner_sanicura-*`                                                                                                                 |
| Subsumio      | `/opt/subsumio` | Compose-Projekt `subsumio-engine`, Datenbank `hetzner_db-data` (≈ 76 GB), Originaldateien `hetzner_engine-data`, Sicherungen, Korpus `/opt/subsumio/law-corpus` (21 GB) |

Alle drei Projekte erwarten das Netzwerk `hetzner_default` als vorhanden (`external: true`).
Auf dem neuen Server einmal anlegen: `docker network create hetzner_default`. Startreihenfolge:
Sanicura → Subsumio → Caddy.

## 0. Vorbereitung (einmalig)

1. SSH-Schlüssel `subsumio-engine` für root hinterlegen (netcup liefert Debian 13 minimal; das Skript unterstützt Debian und Ubuntu).
2. Vom Mac: `ssh root@<neue-ip> 'sh -s' < server/deploy/netcup/bootstrap.sh`
3. Vom alten Server zum neuen einen eigenen Umzugsschlüssel einrichten (nur für den Umzug,
   danach entfernen):
   ```sh
   ssh subsumio-hetzner 'ssh-keygen -t ed25519 -N "" -f /root/.ssh/netcup_migrate -C migrate'
   ssh subsumio-hetzner 'cat /root/.ssh/netcup_migrate.pub' | ssh root@<neue-ip> 'cat >> /root/.ssh/authorized_keys'
   ```
4. `migrate.sh` auf den alten Server kopieren.

## 1. Übertragen, während alles weiterläuft

Auf dem alten Server, jeweils mit `NEW_HOST=root@<neue-ip>`. Das Skript nutzt den
Umzugsschlüssel `/root/.ssh/netcup_migrate` (anderer Pfad über `SSH_KEY`):

```sh
sh migrate.sh images    # laufende Abbilder, ~16 GB
sh migrate.sh files     # /opt/caddy, /opt/sanicura, /opt/subsumio inkl. Korpus
sh migrate.sh presync   # alle Volumes, der Großteil der 76 GB Datenbank
```

Danach vom Mac den vollständigeren lokalen Korpus ergänzen (nur die Differenz, ~5 GB):

```sh
rsync -a --info=progress2 /Users/msc/subsumio-data/law-corpus/ root@<neue-ip>:/opt/subsumio/law-corpus/
```

## 2. Umschalten (Ausfall ≈ 20–40 Minuten)

1. Auf dem alten Server: `sh migrate.sh final` stoppt die alten Dienste und überträgt die
   letzten Änderungen. Die alten Daten bleiben unverändert liegen.
2. Auf dem neuen Server starten:
   ```sh
   docker compose -f /opt/sanicura/deploy/hetzner/docker-compose.yml up -d
   docker compose -f /opt/subsumio/server/deploy/hetzner/docker-compose.yml up -d --no-build
   docker compose -f /opt/caddy/docker-compose.yml up -d
   ```
3. Prüfen, **bevor** DNS umgestellt wird (vom Mac, am DNS vorbei):
   ```sh
   curl -sS --resolve subsum.io:443:<neue-ip> https://subsum.io/api/health
   curl -sS --resolve api.subsum.io:443:<neue-ip> https://api.subsum.io/health
   curl -sS -o /dev/null -w '%{http_code}\n' --resolve sanicura.com:443:<neue-ip> https://sanicura.com/
   ```
   Die Zertifikate kommen aus dem mitkopierten Caddy-Volume, HTTPS funktioniert daher sofort.
   Zusätzlich: Login, eine Akte öffnen, eine Rechtsfrage stellen (Korpus-Suche).
4. DNS umstellen:
   - subsum.io (Hetzner DNS, per `hcloud zone`): `@`, `www`, `api` auf die neue IP; bei der
     Gelegenheit `app` und `ops` anlegen.
   - sanicura.com (Strato): `@` und `www` auf die neue IP — das macht der Inhaber im
     Strato-Kundenbereich.
5. Nach dem Umschalten: Jobs-Container-Log, Backup-Lauf, `/api/cron/health` prüfen.

## 3. Rückweg

Auf dem alten Server die drei Projekte wieder starten (Reihenfolge wie oben) und die DNS-Einträge
auf 46.224.0.141 zurücksetzen. Da der alte Server nach `final` nicht mehr geschrieben wurde,
gehen dabei nur Änderungen verloren, die seit dem Umschalten auf dem neuen Server entstanden.

## 4. Ordner auf dem Server (Stand nach dem Umzug)

| Pfad                                  | Inhalt                                                                                                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/opt/subsumio`                       | Code genau eines Commits (`DEPLOYED_COMMIT`), kein Git-Checkout, keine Altdateien. Server-eigen sind nur `server/deploy/hetzner/.env` und `server/deploy/hetzner/imports/` |
| `/opt/subsumio-prev`                  | die vorige Version, für den schnellen Rückweg                                                                                                                              |
| `/opt/subsumio-data/law-corpus`       | der Gesetzes- und Judikaturkorpus. Web, Engine und Korpus-Pipeline binden ihn über `LAW_CORPUS_HOST_DIR` ein                                                               |
| `/opt/subsumio-data/law-corpus-split` | Altbestand, von keinem Dienst gelesen                                                                                                                                      |
| Docker-Volumes `hetzner_*`            | Datenbank, Originaldateien, Sicherungen                                                                                                                                    |

Der Korpus lag auf dem alten Server im Code-Ordner (`/opt/subsumio/law-corpus`), die Compose-Datei
bindet aber `/opt/subsumio-data/law-corpus` ein. Seit dem Tausch der Compose-Datei am 17.09. sahen
die Dienste deshalb ein leeres Verzeichnis. Beim Umzug wurde er an den richtigen Ort verschoben.

## 5. Neuen Code ausrollen

Vom Mac aus dem Repository, rollt genau den committeten Stand (HEAD) aus:

```sh
sh server/deploy/netcup/deploy-code.sh --build   # nur bauen, Dienste laufen weiter
sh server/deploy/netcup/deploy-code.sh           # bauen und umschalten
```

Das Skript lädt ein `git archive` hoch, übernimmt `.env` und `imports/`, baut web, engine und
corpus-pipeline und schaltet dann `/opt/subsumio` → `/opt/subsumio-prev` um. Die Engine spielt
ausstehende Datenbank-Migrationen beim Start ein. Schwere Migrationen (große Tabellen umschreiben)
vorher gestückelt von Hand einspielen, wie bei v124 (`content_chunks.source_id`, 4 Mio. Zeilen in
Stapeln zu 100 000, danach `CREATE INDEX CONCURRENTLY`).

Der Dienst `caddy` in dieser Compose-Datei ist Altbestand und wird nie gestartet; der gemeinsame
Proxy läuft aus `/opt/caddy`.

## 6. Danach

1. Datenbank auf 64 GB abstimmen, damit der 14-GB-Suchindex im Speicher bleibt (erledigt). In
   `/opt/subsumio/server/deploy/hetzner/.env`:
   ```
   PG_SHARED_BUFFERS=16GB
   PG_EFFECTIVE_CACHE_SIZE=44GB
   PG_WORK_MEM=64MB
   PG_MAINTENANCE_WORK_MEM=2GB
   PG_MAX_PARALLEL_WORKERS=8
   PG_MAX_PARALLEL_WORKERS_PER_GATHER=4
   PG_MAX_PARALLEL_MAINTENANCE_WORKERS=4
   PG_SHM_SIZE=4gb
   ```
2. Offsite-Backup-Ziel eintragen.
3. Umzugsschlüssel auf dem neuen Server aus `authorized_keys` entfernen.
4. Alten Hetzner-Server nach zwei Wochen ohne Befund löschen, ebenso `/opt/subsumio-old-2026-09-18`.
