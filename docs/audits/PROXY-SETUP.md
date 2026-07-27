# RIS Proxy Setup — Free Provider Registrierung

## Anleitung: Alle Free Proxys registrieren

Registriere dich auf jeder der folgenden Seiten. Nach jeder Registrierung
findest du im Dashboard eine Proxy-URL (Format: `http://user:pass@host:port`).
Trage sie unten in die `.env` ein.

## 1. FrontProxy (FREE FOREVER — beste Option)

- URL: https://frontproxy.com/signup/
- Kreditkarte: NEIN
- Free Plan: 5 Mbps unlimited bandwidth, Residential IPs, 195+ countries
- Nach Login: Dashboard → Proxy Credentials → Host/Username/Password
- Proxy URL Format: `http://USERNAME:PASSWORD@HOST:PORT`

## 2. Oxylabs (5GB/Monat kostenlos)

- URL: https://oxylabs.io/products/free-proxies
- Kreditkarte: NEIN
- Free Plan: 5 Datacenter IPs (US), 5GB/Monat, 20 concurrent, HTTP+SOCKS5
- Nach Login: Dashboard → Free Proxies → Credentials
- Proxy URL Format: `http://USERNAME:PASSWORD@HOST:PORT`

## 3. Webshare (1GB/Monat kostenlos, forever)

- URL: https://www.webshare.io/
- Kreditkarte: NEIN
- Free Plan: 10 Datacenter IPs, 1GB/Monat, 50 concurrent, HTTP+SOCKS5
- Nach Login: Dashboard → Proxy List → Copy Proxy
- Proxy URL Format: `http://USERNAME:PASSWORD@HOST:PORT`

## 4. Bright Data (2GB/Monat, Business Verifizierung nötig)

- URL: https://brightdata.com/
- Kreditkarte: JA (Business Verification)
- Free Plan: 15 Datacenter IPs, 2GB/Monat, HTTP+SOCKS5
- Nur wenn die anderen nicht reichen

## 5. DataImpulse ($5 = 5GB, nie ablaufend — Fallback)

- URL: https://dataimpulse.com/
- Kreditkarte: JA (oder PayPal/Crypto)
- Nicht free aber $5 für 5GB die nie ablaufen
- 90M+ Residential IPs, unlimited concurrent, HTTP+SOCKS5

## Konfiguration auf Hetzner

Nach Registrierung, sammle alle Proxy-URLs und trage sie ein:

```bash
# Auf Hetzner:
nano /opt/subsumio/server/deploy/hetzner/.env

# Füge hinzu (alle Proxys mit Labels, kommasepariert):
RIS_PROXY_URLS=http://user1:pass1@frontproxy-host:port|frontproxy,http://user2:pass2@oxylabs-host:port|oxylabs,http://user3:pass3@webshare-host:port|webshare
RIS_PROXY_CONCURRENCY=10
RIS_PROXY_DELAY=1500
RIS_PROXY_QUARANTINE_S=300

# Container neu starten:
cd /opt/subsumio/server/deploy/hetzner
docker compose up -d --force-recreate corpus-pipeline

# Proxys testen:
docker exec subsumio-engine-corpus-pipeline-1 bun scripts/test-proxies.ts

# Backfill starten (10x Speed):
docker exec -d subsumio-engine-corpus-pipeline-1 bun scripts/backfill-corpus-text.ts --dir law-corpus/at-judikatur
```

## Automatisches Failover

Der Code hat eingebautes Quarantine-System:

- 3 consecutive failures → Proxy wird 5 Min übersprungen
- Alle Proxys quarantined → frühester wird automatisch reaktiviert
- Round-Robin verteilt Load gleichmäßig über alle aktiven Proxys
- Wenn ein Free-Plan aufgebraucht ist (z.B. Webshare 1GB), wird der Proxy
  automatisch durch Failures quarantined und die anderen übernehmen
