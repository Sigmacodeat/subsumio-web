# Netcup-Betrieb (Subsumio)

Produktion: netcup RS 8000 G12 (16 dedizierte Kerne, 64 GB RAM, 2 TB NVMe), Debian 13,
159.195.113.101 (ssh-Alias `subsumio-netcup`).

> Der Umzug von Hetzner ist abgeschlossen und der alte Server abgeschaltet (2026-09).
> Die Migrationsanleitung liegt in der Git-Historie (`migrate.sh`, Stand vor dem
> Aufräumen). Die Docker-Volumes heißen weiterhin `hetzner_*` — das sind die
> realen Objekte auf der Box und bleiben so benannt, weil ein Rename die Daten verwaist.

## Ordner auf dem Server

| Pfad                                  | Inhalt                                                                                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/opt/subsumio`                       | Code genau eines Commits (`DEPLOYED_COMMIT`), kein Git-Checkout, keine Altdateien. Server-eigen sind nur `server/deploy/netcup/.env` und `server/deploy/netcup/imports/` |
| `/opt/subsumio-prev`                  | die vorige Version, für den schnellen Rückweg                                                                                                                            |
| `/opt/subsumio-data/law-corpus`       | der Gesetzes- und Judikaturkorpus. Web, Engine und Korpus-Pipeline binden ihn über `LAW_CORPUS_HOST_DIR` ein                                                             |
| `/opt/subsumio-data/law-corpus-split` | Altbestand, von keinem Dienst gelesen                                                                                                                                    |
| `/opt/caddy`                          | gemeinsamer Reverse Proxy für alle Projekte auf der Box                                                                                                                  |
| Docker-Volumes `hetzner_*`            | Datenbank, Originaldateien, Sicherungen                                                                                                                                  |

### Reverse Proxy und Netze

Der gemeinsame Proxy für alle Projekte der Box läuft aus `/opt/caddy`. Subsumio-`web` und
`engine` hängen **nicht** im gemeinsamen Netz `hetzner_default`, sondern nur im eigenen Netz
`subsumio-edge`, das sie ausschließlich mit dem Proxy teilen. `deploy-code.sh` legt das Netz bei
Bedarf an und schließt den Proxy-Container (der Container, der Port 443 veröffentlicht; sonst
`DEPLOY_PROXY_CONTAINER=<name>`) daran an.

Die App verlässt sich darauf, dass der Proxy `X-Real-IP` mit der TCP-Gegenstelle überschreibt
(IP-Allowlist, Rate-Limits, Audit-IP). `server/deploy/netcup/Caddyfile` ist die
Referenzkonfiguration für die Subsumio-Hosts; der Block in `/opt/caddy/Caddyfile` muss ihr
entsprechen (Hostnamen stehen dort als Klartext statt `{$APP_DOMAIN}` usw.). Der Deploy bricht
vor dem Umschalten ab, wenn im laufenden Proxy `header_up X-Real-IP {remote_host}` fehlt
(bewusste Ausnahme: `DEPLOY_ALLOW_PROXY_DRIFT=1`). Nach jeder Änderung an `/opt/caddy/Caddyfile`
den Subsumio-Teil hier im Repo nachziehen.

Prüfen, wer web/engine erreichen kann:

```sh
ssh subsumio-netcup 'docker network inspect subsumio-edge -f "{{range .Containers}}{{.Name}} {{end}}"'
```

Erwartet: nur `subsumio-engine-web-1`, `subsumio-engine-engine-1` und der Proxy.

Der Dienst `caddy` in der Compose-Datei läuft nur mit `--profile standalone-proxy` (neue Box
ohne `/opt/caddy`, Notfall) und wird im Normalbetrieb nie gestartet.

### Engine ohne root, Ressourcengrenzen

Die Engine verarbeitet hochgeladene Dokumente (LibreOffice, Ghostscript, qpdf, readpst) und läuft
deshalb als Nutzer `engine` (uid 10001), ohne Linux-Capabilities und mit `no-new-privileges`. Sie
darf `/data` (Volume), ihr Home und `/tmp` schreiben, nicht aber den Code unter `/app`.
Konverter bekommen nur eine Minimal-Umgebung (keine Schlüssel/DB-Zugänge) und laufen unter
`prlimit` (CPU-Zeit, Dateigröße) mit hartem Abbruch nach Zeitlimit. Ein eigenes Netz ohne
Internetzugang für die Konvertierung ist erst mit einem separaten Konverter-Dienst möglich.

`deploy-code.sh` übergibt vor dem Umschalten alle noch root-eigenen Dateien in `/data` an uid 10001
und prüft, dass das neue Abbild `/data` schreiben und `/law-corpus` lesen kann; sonst wird nicht
umgeschaltet. Der ADVOKAT-Spiegel (`ADVOKAT_IMPORT_HOST_PATH`) muss für uid 10001 lesbar sein.
Der Rückweg auf eine ältere (root-)Version bleibt möglich.

Die Korpus-Pipeline nutzt dasselbe Abbild, läuft aber ausdrücklich als root (`user: "0:0"`),
weil sie in das root-eigene Korpusverzeichnis schreibt; sie verarbeitet nur den öffentlichen
Rechtskorpus.

Speicher/CPU/Prozesse sind pro Dienst begrenzt und in `.env` einstellbar (`ENGINE_MEM_LIMIT`,
`ENGINE_CPUS`, `PIPELINE_MEM_LIMIT`, …; Standardwerte in `docker-compose.yml`). Nach dem ersten
Deploy mit Grenzen `docker stats --no-stream` prüfen und die Werte bei Bedarf anpassen.

## Neuen Code ausrollen

Vom Mac aus dem Repository — rollt den gepushten Stand (`origin/main`) aus:

```sh
bash scripts/deploy.sh                                 # commit + push + deploy
sh server/deploy/netcup/deploy-code.sh --build         # nur bauen, Dienste laufen weiter
sh server/deploy/netcup/deploy-code.sh                 # bauen und umschalten
sh server/deploy/netcup/deploy-code.sh --app           # Web + Engine, Korpus-Pipeline läuft weiter
sh server/deploy/netcup/deploy-code.sh --web           # nur Web-App
```

Es läuft immer nur EIN Deploy: Das Skript legt `/opt/subsumio-deploy.lock` an und gibt die Sperre
am Ende wieder frei. Ein zweiter Lauf bricht mit der Meldung ab, wer die Sperre hält. Bleibt sie
nach einem Abbruch liegen, erst prüfen, ob wirklich nichts mehr läuft, dann freigeben:

```sh
ssh subsumio-netcup 'ps -eo etime,args | grep -E "docker compose|tar -xzf" | grep -v grep'
ssh subsumio-netcup 'rm -rf /opt/subsumio-deploy.lock'
```

Vor dem Umschalten prüft das Skript zusätzlich, dass die neue Version vollständig ist und dass
`/opt/subsumio` noch der Stand ist, gegen den gebaut wurde. Sonst schaltet es nicht um. Genau diese
Prüfungen fehlten am 20.09.2026, als zwei gleichzeitige Deploys `/opt/subsumio` bis auf einen leeren
`server`-Ordner geleert haben.

`--app` und `--web` lassen den Pipeline-Container in Ruhe: Ein voller Deploy erzeugt ihn neu und
bricht damit laufende RIS-Läufe ab, die tagelang dauern können. Vorher prüfen, ob gerade einer
läuft: `ssh subsumio-netcup docker exec subsumio-engine-corpus-pipeline-1 ps -eo etime,args`.

Das Skript lädt ein `git archive` hoch, übernimmt `.env` und `imports/`, baut web, engine und
corpus-pipeline und schaltet dann `/opt/subsumio` → `/opt/subsumio-prev` um. Die Engine spielt
ausstehende Datenbank-Migrationen beim Start ein. Schwere Migrationen (große Tabellen umschreiben)
vorher gestückelt von Hand einspielen, wie bei v124 (`content_chunks.source_id`, 4 Mio. Zeilen in
Stapeln zu 100 000, danach `CREATE INDEX CONCURRENTLY`).

## Dauerhafter Speicher der Web-App

Die Web-App schreibt Laufzeitdaten (Feature-Flags, SCIM-Status, WhatsApp-Medien, Admin-Backups, Dashboard-Widgets, Rate-Limit-Fenster ohne Upstash, Quellen-Hashes) nach `SUBSUMIO_DATA_DIR=/app/.data`. Das ist das Docker-Volume `subsumio-engine_web-data` auf der Platte dieses Servers. Es übersteht jedes Deploy (`--force-recreate`).

- Das Volume legt Compose beim ersten `up` nach der Umstellung selbst an. Es ist nichts manuell zu tun.
- Gesichert wird es vom `backup`-Dienst: Er hängt das Volume read-only unter `/web-data` ein und legt es als `web-data/` in jeden Snapshot (offsite restic und lokale verschlüsselte Kopie).
- Wiederherstellen: `restore.sh` nennt den Pfad. Danach `docker cp <pfad>/. <web-container>:/app/.data/`.
- Platz prüfen: `docker system df -v | grep web-data`.

## Cron-Überwachung

Die Jobs stehen in `crontab` und laufen per supercronic im `cron`-Container (jeder Deploy erzeugt
ihn neu, Änderungen an `crontab` greifen damit automatisch). **Jeder** Job läuft über den Wrapper
`cronjob.sh` — kein Job wird mehr mit `|| true` stummgeschaltet:

- Die Routen antworten mit **HTTP 5xx**, wenn ein Lauf Fehler hatte (z. B. Fristen einer Kanzlei
  nicht lesbar, E-Mail-Versand fehlgeschlagen; `/api/cron/health` mit 503, wenn eine Prüfung
  scheitert). `curl -f` endet dann mit Exit-Code 22, das Zeitlimit (`--max-time`, sonst
  `CRON_MAX_TIME`, Standard 3300 s) mit 28.
- Der Wrapper protokolliert `[cron] FAILED <job>`, supercronic markiert den Job als fehlgeschlagen,
  und `QUEUE_ALERT_EMAIL` bekommt eine Mail über Resend — höchstens einmal pro Job und Stunde
  (`CRON_ALERT_INTERVAL_SECONDS`). Ohne `QUEUE_ALERT_EMAIL`/`RESEND_API_KEY` bleibt es beim Log;
  `preflight.sh` warnt dann.

Fehlgeschlagene Läufe finden:

```sh
ssh subsumio-netcup 'docker logs --since 24h subsumio-engine-cron-1 2>&1 | grep "\[cron\] FAILED"'
```

**Totmannschalter (optional).** Ein Cron, der gar nicht mehr läuft, meldet keinen Fehler. Dafür
pingt jeder Job nach einem **erfolgreichen** Lauf `CRON_HEARTBEAT_URL_<JOB>` (Jobname in
Großbuchstaben, `-` wird `_`), wenn gesetzt und im `cron`-Dienst durchgereicht — z. B.
eine Healthchecks.io- oder Uptime-Kuma-Push-URL, die alarmiert, wenn der Ping ausbleibt. In
`/opt/subsumio/server/deploy/netcup/.env`:

```sh
CRON_HEARTBEAT_URL_DEADLINES=https://hc-ping.com/<uuid>            # täglich 06:00 UTC
CRON_HEARTBEAT_URL_DEADLINE_REMINDERS=https://hc-ping.com/<uuid>   # täglich 07:00 UTC
CRON_HEARTBEAT_URL_DEADLINE_ALERTS=https://hc-ping.com/<uuid>      # alle 30 Minuten
CRON_HEARTBEAT_URL_HEALTH=https://hc-ping.com/<uuid>               # alle 10 Minuten
CRON_HEARTBEAT_URL_APPOINTMENT_REMINDERS=https://hc-ping.com/<uuid> # stündlich
CRON_HEARTBEAT_URL_IMAP_SYNC=https://hc-ping.com/<uuid>            # alle 5 Minuten
CRON_HEARTBEAT_URL_DUNNING_RUN=https://hc-ping.com/<uuid>          # täglich 09:00 UTC
CRON_HEARTBEAT_URL_MONTHLY_INVOICE=https://hc-ping.com/<uuid>      # monatlich am 1.
CRON_HEARTBEAT_URL_SANCTIONS_SYNC=https://hc-ping.com/<uuid>       # montags 04:20 UTC
```

Leer oder nicht gesetzt = kein Ping. Ein fehlgeschlagener Ping wird protokolliert, macht den Job
aber nicht zum Fehler. Nach dem Setzen `docker compose -p subsumio-engine up -d cron` (oder der
nächste Deploy).

`/api/cron/health` prüft zusätzlich, dass die Fristen-Übersicht **frisch** ist (letzter Eintrag
in `subsumio_notify_log` von heute oder gestern, UTC) und dass die Kanzlei-Einstellungen jeder
Kanzlei lesbar sind (SMTP ist pro Kanzlei konfiguriert).

## Datenbank-Tuning

Damit der 14-GB-Suchindex im Speicher bleibt, in
`/opt/subsumio/server/deploy/netcup/.env`:

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

## Das Embedding-Modell wechseln

Vektoren zweier Modelle sind nicht vergleichbar. Der Abstand zwischen einem
OpenAI- und einem Qwen-Vektor ist keine Ähnlichkeit, sondern Rauschen. Ein
Wechsel darf deshalb nie in die laufende Spalte schreiben.

Der Weg führt über eine Ersatzspalte, die am Ende per Katalog-Umbenennung an
die Stelle der alten tritt — Millisekunden statt Kopieren von 98 GB.

```bash
# 1. Ersatzspalte anlegen (einmalig, kostet nichts)
docker exec -w /app subsumio-engine-engine-1 bun run scripts/embed-into-column.ts \
  --column embedding_neu --model <anbieter:modell> --dims 1536 --create

# 2. Id-Fenster nach ECHTEN Kandidaten schneiden, nicht nach Rohzeilen:
#    rund 1,5 Mio. Chunks gehören zu gelöschten Seiten oder sind zu kurz,
#    und liegen in Blöcken beisammen — nach Rohzeilen geschnitten bekommt
#    ein Arbeiter ein komplett leeres Fenster.
docker exec -i subsumio-engine-db-1 psql -U subsumio -d subsumio -c "
  WITH k AS (SELECT c.id, ntile(8) OVER (ORDER BY c.id) b
               FROM content_chunks c JOIN pages p ON p.id=c.page_id
              WHERE c.embedding_neu IS NULL AND p.deleted_at IS NULL
                AND length(btrim(c.chunk_text)) >= 80)
  SELECT b, min(id)-1, max(id), count(*) FROM k GROUP BY b ORDER BY b;"

# 3. Je Fenster ein Arbeiter, abgekoppelt. Der letzte OHNE --id-to,
#    sonst fallen zwischenzeitlich importierte Chunks hinten durch.
docker exec -d -w /app subsumio-engine-engine-1 sh -c \
  'bun run scripts/embed-into-column.ts --column embedding_neu \
     --id-from <von> --id-to <bis> >> /data/embed-N.log 2>&1'

# 4. Indizes auf der Ersatzspalte, BEVOR umgeschaltet wird
docker exec -w /app subsumio-engine-engine-1 bun run scripts/promote-embedding-column.ts \
  --column embedding_neu --indexes --work-mem 8GB
#    --blocking ist etwa viermal schneller (parallele Arbeiter), sperrt aber
#    Schreibzugriffe auf content_chunks — nur im Wartungsfenster.

# 5. Probe: dieselben Rechtsfragen an beide Spalten
docker exec -w /app subsumio-engine-engine-1 bun run scripts/compare-embedding-columns.ts \
  --a embedding --b embedding_neu --k 10

# 6. Erst wenn die Probe für die neue Spalte spricht
docker exec -w /app subsumio-engine-engine-1 bun run scripts/promote-embedding-column.ts \
  --column embedding_neu --check     # neun Prüfungen ansehen
docker exec -w /app subsumio-engine-engine-1 bun run scripts/promote-embedding-column.ts \
  --column embedding_neu --yes
```

**Danach zwingend** — sonst fragt die Suche mit dem alten Modell gegen die
neuen Vektoren und findet Unsinn:

```bash
# in /opt/subsumio/server/deploy/netcup/.env
SUBSUMIO_EMBEDDING_MODEL=<anbieter:modell>
SUBSUMIO_EMBEDDING_DIMENSIONS=1536

cd /opt/subsumio/server/deploy/netcup
docker compose -p subsumio-engine up -d --no-deps engine web corpus-pipeline
```

Die Umgebungsvariable hat Vorrang vor allem, was in der Datenbank steht. In
der Compose-Datei hat sie bewusst **keinen** Vorgabewert: fehlt sie, startet
der Dienst gar nicht erst, statt still mit dem falschen Modell zu arbeiten.

Zum Schluss `VACUUM (ANALYZE) content_chunks;` — der Lauf schreibt jede Zeile
neu und lässt entsprechend alte Zeilenversionen zurück.

## Grabsteine endgültig entfernen

Eine soft-gelöschte Seite ist für Suche und Embedding unsichtbar, belegt aber
weiter die Tabelle. In einer Rechtssoftware ist das eine Last: jede Zählung,
jede Prüfung und jede künftige Migration muss über Zeilen nachdenken, die
nichts bedeuten.

**Unwiderruflich.** Die nächtliche Sicherung schließt den Rechtskorpus
ausdrücklich aus (`dump-firm-data.sh`: `source_id NOT LIKE 'law-%'`). Vorher
das Verzeichnis der betroffenen Seiten schreiben — Slug, Titel, Dokument-Id,
Prüfsumme —, damit Jahre später noch beantwortbar ist, was entfernt wurde:

```bash
mkdir -p /opt/subsumio-data/purge-$(date +%F)
docker exec subsumio-engine-db-1 sh -c "psql -U subsumio -d subsumio -qAt -c \"\\copy (
  SELECT p.id, p.source_id, p.slug, p.title, p.type, p.deleted_at,
         p.frontmatter->>'doc_id' AS doc_id, p.content_hash,
         (SELECT count(*) FROM content_chunks c WHERE c.page_id=p.id) AS chunks
    FROM pages p WHERE p.deleted_at IS NOT NULL ORDER BY p.id)
  TO STDOUT WITH (FORMAT csv, HEADER true)\" | gzip -c" \
  > /opt/subsumio-data/purge-$(date +%F)/geloeschte-seiten.csv.gz
```

**Vorher belegen, dass der Inhalt aktiv weiterlebt.** Grabsteine aus einer
Formatumstellung sind ersetzt, Grabsteine aus einem Fehlimport nicht:

```sql
-- Ersatz über die Dokument-Id
SELECT count(*) FROM pages t
  JOIN pages a ON a.frontmatter->>'doc_id' = t.frontmatter->>'doc_id'
   AND a.deleted_at IS NULL
 WHERE t.deleted_at IS NOT NULL;
-- Stichprobe: ist das Gesetz im neuen Format da?
SELECT count(*) FILTER (WHERE deleted_at IS NULL) AS aktiv, count(*) AS gesamt
  FROM pages WHERE title ILIKE '%<Gesetzesname>%';
```

Dann:

```bash
docker exec -w /app subsumio-engine-engine-1 \
  bun run scripts/purge-tombstoned-pages.ts                      # nur berichten
docker exec -d -w /app subsumio-engine-engine-1 sh -c \
  'bun run scripts/purge-tombstoned-pages.ts --yes --batch 2000 --pause-ms 300 \
     > /data/purge.log 2>&1'
```

`--min-age-days` (Vorgabe 7) schützt eine Löschung, die jemand vor Minuten
gemacht hat und noch zurückholen will. Chunks, Verweise, Zeitleisten und
Rechte gehen über die Fremdschlüssel-Kaskade mit; angefasst wird nur `pages`.

Danach `VACUUM (ANALYZE) pages, content_chunks;` — ohne das gibt Postgres den
Platz nicht an das Dateisystem zurück.

## Den Embedding-Lauf am Leben halten

Die Arbeiter laufen als `docker exec` im Engine-Container und sterben mit
ihm. Am 21.09. startete der Container um 03:02 neu — Exit 0, kein OOM, kein
Absturz im Protokoll, nur die Engine sauber beendet und von Docker wieder
hochgefahren. Alle acht Arbeiter gingen mit, und es fiel erst 2,5 Stunden
später auf.

`embed-watchdog.sh` läuft deshalb auf dem **Host**, nicht im Container:

```bash
scp server/deploy/netcup/embed-watchdog.sh subsumio-netcup:/opt/subsumio-data/
ssh subsumio-netcup "chmod +x /opt/subsumio-data/embed-watchdog.sh && \
  setsid nohup /opt/subsumio-data/embed-watchdog.sh >/dev/null 2>&1 </dev/null &"
```

Er prüft alle zwei Minuten, ob noch Arbeiter laufen, schneidet die Id-Fenster
bei Bedarf neu (nach **echten** Kandidaten, siehe Embedding-Modell wechseln)
und startet acht neue. Er endet von selbst, wenn nichts mehr offen ist.
Protokoll: `/opt/subsumio-data/qwen-watchdog.log`.

Nach dem Umschalten nicht vergessen, ihn zu beenden — sonst startet er
Arbeiter für eine Spalte, die es nicht mehr gibt:

```bash
ssh subsumio-netcup "pkill -f embed-watchdog.sh"
```
