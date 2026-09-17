# E-Mail-Postfach (IMAP/SMTP)

Stand: 17.09.2026

## Was es tut

Eine Kanzlei verbindet unter **Einstellungen → E-Mail-Postfach** ihr eigenes Postfach.
Subsumio ruft es alle fünf Minuten per IMAP ab (`/api/cron/imap-sync`, Eintrag in
`server/deploy/hetzner/crontab`), speichert neue E-Mails in `subsumio_mail_messages`, ordnet
sie der Akte zu, stuft sie ein und schlägt Fristen vor. Antworten gehen über den SMTP-Server
des Postfachs hinaus, also von der Adresse der Kanzlei, mit `In-Reply-To` und `References`.

## Grenzen (bewusst)

- **Nur lesend am Mailserver.** Nichts wird verschoben, gelöscht oder als gelesen markiert.
- **Nichts wird automatisch versendet.** „Antwort vorschlagen“ füllt nur den Entwurf;
  gesendet wird, wenn die Anwältin auf „Senden“ drückt.
- **Eindeutige Zuordnung oder keine.** Mehrdeutige Treffer bleiben unzugeordnet und stehen im
  Posteingang zur Zuweisung. Antworten erben die Akte der Ursprungsnachricht.
- **Fristen sind Vorschläge.** Regelbasierte Erkennung, bei Frist-Mails ohne Datum einmal das
  Sprachmodell; eine Frist steht erst nach Bestätigung im Fristenbuch.
- Erster Abruf: die letzten 14 Tage, höchstens 150 Nachrichten pro Lauf, Nachrichten über
  25 MB werden übersprungen. Anhänge werden derzeit nur als Metadaten erfasst.

## Bausteine

| Datei                                         | Aufgabe                                                                                                                                               |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/email/imap-accounts.ts`              | Tabelle `subsumio_mail_accounts`, Passwörter mit `encrypt()` (AES-256-GCM, `SUBSUMIO_ENCRYPTION_KEY`); die öffentliche Form enthält keine Geheimnisse |
| `src/lib/email/imap-sync.ts`                  | Verbindungstest, Abruf (UID-basiert, `uidValidity`-sicher), Parsen, Zuordnung, Einstufung                                                             |
| `src/lib/email/mailbox.ts`                    | `storeInboundExternalEmail` (Dedupe über `provider_id`), `setMailTriage`, SMTP-Versand über das Postfach                                              |
| `src/app/api/email/accounts/**`               | Verbinden (Login wird vor dem Speichern geprüft, nur Admin), Pausieren, Trennen, „Jetzt abrufen“                                                      |
| `src/app/api/email/messages/[id]/draft-reply` | KI-Antwortentwurf über das Engine-LLM-Gateway; E-Mail-Text gilt als Fremdinhalt                                                                       |
| `src/app/dashboard/settings/email/page.tsx`   | Oberfläche                                                                                                                                            |
| `src/app/dashboard/communications/page.tsx`   | Posteingang zeigt die E-Mails mit Einstufung, Aktenlink und Zuweisung                                                                                 |

## Geprüft

Echter Durchlauf gegen einen lokalen Test-Mailserver (greenmail): Verbindungstest, falsches
Passwort, kein Geheimnis in der API-Antwort, Abruf, zweiter Abruf ohne Dubletten, Zuordnung
über die Aktenzahl im Betreff, Einstufung „kritisch / Frist“, Antwort über SMTP mit geerbter
Akte. Unit-Tests: `src/lib/email/imap-sync.test.ts`.

## Offen

- Anhänge als Dokumente in die Akte übernehmen (derzeit nur Dateiname, Typ, Größe).
- OAuth für Microsoft 365 und Google (derzeit App-Passwort; Basic Auth ist bei manchen
  Mandanten deaktiviert).
- `outlook-sync` (Microsoft Graph) ist ein älterer, globaler Pfad: Cron ruft per GET, die Route
  exportiert nur POST, und die Engine-Header sind falsch. Entweder reparieren oder entfernen.
- Auftragsverarbeitung: Das Postfach liegt beim Mailanbieter der Kanzlei; Subsumio verarbeitet
  die abgerufenen Inhalte wie andere Akteninhalte (AVV).
