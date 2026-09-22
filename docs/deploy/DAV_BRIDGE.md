# WebDAV/CalDAV-Bridge (WP-8.53)

Stand 2026-09-22. `scripts/dav-server.ts` ist ein eigenständiger, **read-only**
DAV-Prozess, der Kalender (CalDAV) und Dokumente (WebDAV) per Standard-Clients
erreichbar macht — macOS Kalender/Finder, Thunderbird, iOS, Windows.

## Architektur

```
Client (Finder/Calendar/Thunderbird)
  │  PROPFIND/REPORT/GET + Basic Auth
  ▼
dav-server.ts  (DAV_PORT=4080, bind 127.0.0.1)
  │  Feed-Token <userId>.<secret> als Basic-Password
  ▼
Next.js API
  ├─ /api/calendar/[token]/fristen.ics      (ICS-Feed, existierend)
  └─ /api/calendar/[token]/dav/documents    (read-only Dokumentliste)
  ▼
Engine (brain-scoped, source isolation via engineHeadersForUserId)
```

Warum ein separater Prozess: Next.js Route Handlers unterstützen DAV-Methoden
(PROPFIND, REPORT) nicht. Die Bridge spricht mit den bestehenden Feed-Routen —
**ein Credential-Pfad**, widerrufbar über dieselbe Stelle wie der ICS-Feed
(Settings → Kalender-Feed). Fehlschlag ist immer ein generisches 404
(`src/lib/feed-auth.ts`).

## Betrieb

### Lokal / Entwicklung

```bash
bun run dav          # = bunx tsx scripts/dav-server.ts
# → http://127.0.0.1:4080
```

### Produktion (Netcup, neben dem Web-Container)

Die Bridge bindet standardmäßig `127.0.0.1` — **nie direkt exponieren**. TLS
terminiert der bestehende Caddy (siehe `server/deploy/netcup/Caddyfile`):

```caddy
dav.example-kanzlei.at {
    reverse_proxy 127.0.0.1:4080
}
```

Hinweis: `DAV_BIND=127.0.0.1` muss dann auf `0.0.0.0` gesetzt werden, wenn die
Bridge im Docker-Netzwerk statt auf dem Host läuft — Caddy erreicht den Port
dann über den Compose-Service-Namen:

```yaml
# docker-compose-Ausschnitt (Service neben web/cron)
dav:
  image: subsumio-web
  command: ["bun", "scripts/dav-server.ts"]
  environment:
    SUBSUMIO_WEB_URL: http://web:3000
    DAV_PORT: "4080"
    DAV_BIND: 0.0.0.0 # im Docker-Netz; TLS via Caddy
  restart: unless-stopped
```

```caddy
dav.example-kanzlei.at {
    reverse_proxy dav:4080
}
```

Alternativ systemd auf dem Host:

```ini
# /etc/systemd/system/subsumio-dav.service
[Unit]
Description=Subsumio WebDAV/CalDAV bridge
After=network.target docker.service

[Service]
WorkingDirectory=/opt/subsumio/subsumio-web
Environment=SUBSUMIO_WEB_URL=http://localhost:3000
Environment=DAV_PORT=4080
Environment=DAV_BIND=127.0.0.1
ExecStart=/usr/local/bin/bun scripts/dav-server.ts
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## Client-Einrichtung

| Client           | Was                               | URL                                         |
| ---------------- | --------------------------------- | ------------------------------------------- |
| macOS Kalender   | CalDAV-Abo „Fristen"              | `https://dav.example-kanzlei.at/fristen/`   |
| macOS Finder     | „Mit Server verbinden" (⌘K)       | `https://dav.example-kanzlei.at/dokumente/` |
| Thunderbird      | Kalender → „Im Netzwerk" → CalDAV | `https://dav.example-kanzlei.at/fristen/`   |
| Windows Explorer | Netzlaufwerk verbinden            | `https://dav.example-kanzlei.at/dokumente/` |

- **Benutzername:** beliebig (wird ignoriert) — empfohlen: `feed`
- **Passwort:** der vollständige Feed-Token `<userId>.<secret>` aus
  Settings → Kalender-Feed
- Bei ungültigem/widerrufenem Token: `401` — kein Detail-Leak.

## Sicherheit

- Read-only: `PUT`, `DELETE`, `MKCOL`, `LOCK` etc. antworten `405`.
- Token-Rate-Limit gegen Brute-Force (in `feed-auth.ts`).
- Dokumentliste ist brain-scoped auf den Token-Besitzer; Rechte des
  Benutzers greifen serverseitig (source isolation).
- TLS-Pflicht in Produktion — Basic Auth ohne TLS sendet den Token
  im Klartext.

## Umgebungsvariablen

| Variable           | Default                 | Zweck                                         |
| ------------------ | ----------------------- | --------------------------------------------- |
| `SUBSUMIO_WEB_URL` | `http://localhost:3000` | Basis der Next.js-API                         |
| `DAV_PORT`         | `4080`                  | Listen-Port der Bridge                        |
| `DAV_BIND`         | `127.0.0.1`             | Bind-Adresse (`0.0.0.0` nur hinter TLS-Proxy) |

## Bekannte Grenzen

- Kein Schreiben über DAV (Sync-to-Client only) — Uploads gehen weiter
  über die Web-App (`/dashboard/vault`, Akte).
- Dokumentliste liefert Metadaten + Content der in der Engine gespeicherten
  Dokumente; große Binärdateien hängen vom Engine-Store ab.
- Interoperabilität mit exotischen Clients (ältere Windows-Mini-Redirector)
  ist ungetestet — bei Problemen Rückmeldung mit Client-Version.
