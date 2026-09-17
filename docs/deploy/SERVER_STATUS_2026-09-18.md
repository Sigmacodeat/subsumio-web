# Serverzustand und offene Punkte (Bestandsaufnahme 18.09.2026)

Aufgenommen auf dem Hetzner-Server über SSH, ohne Änderung an der
Produktionsdatenbank. Erledigtes ist abgehakt, Offenes braucht eine Entscheidung
oder Zugangsdaten.

## Was live läuft

- `https://subsum.io` beantwortet Startseite, Login, `/api/health` und
  `/api/readiness` mit 200; die Engine antwortet unter `https://api.subsum.io/health`.
- Alle Container laufen und sind gesund: Web, Engine, Datenbank, Korpus-Pipeline,
  Jobs, Virenscanner, Reverse Proxy.
- Die geplanten Jobs laufen (supercronic, 37 Einträge), unter anderem
  Fristen-Digest, Fristen-Erinnerungen und die Outbox alle zwei Minuten.

## Behoben am 18.09.2026

- **Platte war zu 100 % voll** (0 Byte frei). Folge: Die Engine startete seit
  Wochen im Minutentakt neu (25.272 Neustarts), die Datenbank war als „ungesund“
  markiert. Freigegeben: alte Journale und ein Container-Protokoll von 1,4 GB.
  Danach läuft die Engine stabil und meldet sich gesund.
- **Container-Protokolle sind jetzt begrenzt** (50 MB, drei Dateien je Dienst),
  damit ein einzelnes Protokoll die Platte nicht wieder füllt.
- **Backup eingerichtet.** Es gab keines: kein Ziel, kein Container, kein
  Verzeichnis. Der bisherige Lauf hätte auch nie funktioniert, weil er einen
  Voll-Dump der 75-GB-Datenbank auf eine fast volle Platte geschrieben hätte.
  Jetzt: täglich 01:00 UTC eine verschlüsselte Sicherung aller Kanzleidaten ohne
  den öffentlichen Rechtskorpus (~200 MB statt ~75 GB), 14 Tage Aufbewahrung,
  sonntags 03:00 UTC eine Rückspielprobe in eine Wegwerf-Datenbank.
- **Überwachung erweitert:** `/api/cron/health` prüft zusätzlich freien
  Plattenplatz und das Alter der letzten Sicherung.
- **Zwei falsche Fehlalarme behoben:** Die Gesundheitsprüfung rief die Engine
  unter einer Adresse auf, die Anmeldung verlangt, und der Warnjob für die
  Warteschlange lief deshalb dauerhaft auf Fehler 502.

## Offen — braucht deine Entscheidung

1. **Plattenplatz.** 150 GB gesamt, davon Datenbank 76 GB (überwiegend
   Rechtskorpus), Korpusdateien 21 GB, Container-Abbilder 29 GB. Frei sind rund
   2,7 GB. Ein neues Abbild braucht etwa 6 GB, deshalb lässt sich neuer Code
   derzeit nicht ausrollen. Möglichkeiten:
   - Festplatte bei Hetzner vergrößern (einfachster Weg, kostet monatlich mehr).
   - Korpusdateien unter `/opt/subsumio/law-corpus` löschen (21 GB). Sie sind
     bereits importiert und liegen als Kopie auf deinem Rechner. Neuimport wäre
     dann nur nach erneutem Herunterladen möglich.
2. **E-Mail-Versand fehlt vollständig.** Weder Resend noch SMTP sind gesetzt.
   Fristen-Erinnerungen erscheinen dadurch nur in der Anwendung, nicht per
   E-Mail, und Backup-Warnungen erreichen niemanden.
3. **DNS für `app.subsum.io` und `ops.subsum.io` fehlt.** Beide Namen lösen
   nicht auf. Die Anwendung läuft unter `subsum.io`; die Betreiberkonsole ist
   deshalb gar nicht erreichbar. Entweder A-Records anlegen oder `OPS_DOMAIN`
   auf einen vorhandenen Namen setzen.
4. **Zugangsdaten erneuern.** Datenbankpasswort und OpenRouter-Schlüssel standen
   in einer ungeschützten Datei und sollten getauscht werden.
5. **Offsite-Backup.** Die tägliche Sicherung liegt auf derselben Platte wie die
   Daten. Sobald du ein Ziel hast (Hetzner Object Storage oder Storage Box),
   `BACKUP_RESTIC_REPOSITORY`, `BACKUP_RESTIC_PASSWORD` und die S3-Schlüssel
   setzen; der Dienst nutzt es dann automatisch zusätzlich.

## Backup wiederherstellen

```sh
# Im Backup-Container, Archiv entschlüsseln und auspacken
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_LOCAL_PASSPHRASE \
  -in /backups/subsumio-<zeitstempel>.tar.gz.enc | tar -C /tmp/restore -xzf -
# In eine leere Datenbank zurückspielen
IN_DIR=/tmp/restore/firm-<zeitstempel> PGDATABASE=<zieldatenbank> sh /backup/restore-firm-data.sh
```

Das Passwort steht als `BACKUP_LOCAL_PASSPHRASE` in
`/opt/subsumio/server/deploy/hetzner/.env`. Ohne dieses Passwort ist die
Sicherung nicht lesbar: eine Kopie davon gehört an einen anderen Ort.
Der Rechtskorpus ist nicht Teil der Sicherung und wird nach einem Rückspielen
neu aus RIS geladen.
