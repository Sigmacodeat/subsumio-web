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
sh server/deploy/netcup/deploy-code.sh --app     # Web + Engine, Korpus-Pipeline läuft weiter
sh server/deploy/netcup/deploy-code.sh --web     # nur Web-App
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

## 7. Das Embedding-Modell wechseln

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
# in /opt/subsumio/server/deploy/hetzner/.env
SUBSUMIO_EMBEDDING_MODEL=<anbieter:modell>
SUBSUMIO_EMBEDDING_DIMENSIONS=1536

cd /opt/subsumio/server/deploy/hetzner
docker compose -p subsumio-engine up -d --no-deps engine web corpus-pipeline
```

Die Umgebungsvariable hat Vorrang vor allem, was in der Datenbank steht. In
der Compose-Datei hat sie bewusst **keinen** Vorgabewert: fehlt sie, startet
der Dienst gar nicht erst, statt still mit dem falschen Modell zu arbeiten.

Zum Schluss `VACUUM (ANALYZE) content_chunks;` — der Lauf schreibt jede Zeile
neu und lässt entsprechend alte Zeilenversionen zurück.

## 8. Grabsteine endgültig entfernen

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

## 9. Den Embedding-Lauf am Leben halten

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
bei Bedarf neu (nach **echten** Kandidaten, siehe Abschnitt 7) und startet
acht neue. Er endet von selbst, wenn nichts mehr offen ist. Protokoll:
`/opt/subsumio-data/qwen-watchdog.log`.

Nach dem Umschalten nicht vergessen, ihn zu beenden — sonst startet er
Arbeiter für eine Spalte, die es nicht mehr gibt:

```bash
ssh subsumio-netcup "pkill -f embed-watchdog.sh"
```
