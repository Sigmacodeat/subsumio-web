# Pilot Go-Live — Subsumio Kanzlei-OS

Stand: 2026-09-13. Reihenfolge einhalten; jeder Schritt hat eine Prüfung.
Aktueller Serverzustand und die offenen Punkte: `docs/deploy/SERVER_STATUS_2026-09-18.md`.

## 1. Code

- [ ] Parallele Sessions auf `main` pausieren.
- [ ] Branch `ops-console` nach `main` bringen (enthält `main` bereits), danach
      `bun run typecheck`, `bun run test:unit`, `bun run build` grün.
- [ ] Pushen. Kein Deploy vor Schritt 2.

## 2. Server vorbereiten (Hetzner, `/opt/subsumio`)

- [ ] **Vor dem Pull:** `sh server/deploy/hetzner/move-corpus-out-of-repo.sh`
      Prüfung: Ausgabe „fehlend am Ziel: 0“. Ohne diesen Schritt löscht `git pull`
      die bisher getrackten Korpusdateien.
- [ ] `server/deploy/hetzner/.env` ergänzen:
  - `LAW_CORPUS_HOST_DIR=/opt/subsumio-data/law-corpus`
  - `OPS_DOMAIN=ops.subsum.eu`
  - `PLATFORM_OPERATOR_EMAILS=<Betreiber-E-Mail(s)>`
  - `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_REPLY_TO` (optional), `RESEND_WEBHOOK_SECRET`
  - `EMAIL_INBOUND_DEFAULT_BRAIN_ID=subsumio-support`
- [ ] `git pull`, dann `./preflight.sh .env` → muss `PASSED` melden.
- [ ] `docker compose up -d --build`

## 3. DNS & E-Mail

- [ ] A-Record `ops.subsum.eu` → Server-IP (Caddy holt das Zertifikat).
- [ ] Resend: Absenderdomain verifiziert (SPF/DKIM), Empfangsdomain (MX) aktiv,
      Plus-Adressen (`hello+<id>@…`) werden angenommen.
- [ ] Resend-Webhook `email.received` + Tracking-Events →
      `https://<APP_DOMAIN>/api/email/webhook/resend`, Secret = `RESEND_WEBHOOK_SECRET`.

## 4. Betreiberzugang

- [ ] Eigenes Konto in der App anlegen, **2FA aktivieren** (Einstellungen → Sicherheit).
- [ ] E-Mail steht in `PLATFORM_OPERATOR_EMAILS`.
- [ ] `https://ops.subsum.eu` → Login mit 2FA → Konsole sichtbar.
- [ ] Gegenprobe: `https://<APP_DOMAIN>/ops` → 404.

## 5. Pilotkanzlei einrichten

- [ ] Inhaber registriert sich und legt die Kanzlei an → wird Kanzlei-Admin.
      Prüfung in der Konsole: Kanzleien → Admins ≥ 1.
- [ ] Inhaber lädt Anwälte/Assistenz ein und vergibt Rollen.
- [ ] 2FA für alle Kanzleikonten empfehlen (Konsole zeigt die Abdeckung).
- [ ] Kanzlei-Eingangsadresse aus dem Akten-Tab „E-Mails“ an die Kanzlei geben
      (Weiterleitung/BCC aus dem bestehenden Postfach möglich).
- [ ] Spend-Cap für die Pilotkanzlei in der Konsole setzen.

## 6. Smoke-Test mit echter Pilot-Akte

- [ ] `curl https://<APP_DOMAIN>/api/health` → 200, `/api/readiness` nicht 503.
- [ ] Akte anlegen, Frist mit Vorfrist erfassen → Fristenbuch „Kontrollliste heute“.
- [ ] Notfrist freigeben und durch **zweite Person** gegenprüfen (Selbstbestätigung wird blockiert).
- [ ] Mandantenportal für die Akte aktivieren, Vollmacht per Link senden,
      im Portal unterschreiben → Status „unterschrieben“, Portalzugang bleibt.
- [ ] E-Mail aus der Akte senden, als Mandant antworten → Antwort erscheint in der Akte.
- [ ] Assistenz-Konto: Einstellungen → Datenexport enthält **keine** Kanzleiakten.

## 7. Offene Punkte vor breiterem Rollout (nicht Pilot-blockierend)

- Support-Zugriff des Betreibers auf Kanzleien (mit Protokoll).
- DSGVO-Anfragen über Mandanten/Gegner (Auskunft/Löschung zu einer Person).
- Ethical-Wall-Filter der generischen Brain-Listenendpunkte in der Engine prüfen.
- Rotation der Secrets aus der lokalen `SERVER_INVENTORY.md`, falls noch nicht erfolgt.
