# E-Mail-Postfach (IMAP/SMTP)

Stand: 17.09.2026

## Was es tut

Eine Kanzlei verbindet unter **Einstellungen → E-Mail-Postfach** ihr eigenes Postfach.
Subsumio ruft es alle fünf Minuten per IMAP ab (`/api/cron/imap-sync`, Eintrag in
`server/deploy/netcup/crontab`), speichert neue E-Mails in `subsumio_mail_messages`, ordnet
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
  25 MB werden übersprungen.

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

Zusätzlich über die echte Oberfläche als Kanzlei-Admin: Postfach im Formular verbinden (falsches
Passwort ergibt eine verständliche Meldung, das richtige speichert und ruft sofort ab), manueller
Abruf, Trennen. „Antwort vorschlagen“ gegen den echten Assistenten: Entwürfe in zwei bis vier
Sekunden, förmliche Anrede; eine Mail mit eingeschleusten Anweisungen wurde als Inhalt behandelt
und nicht befolgt. KI-Fristerkennung für Frist-Mails ohne auswertbares Datum: Das Modell erhält
das Eingangsdatum der Mail als Bezugsdatum. Ein Datum zählt nur, wenn sein Jahr im Text steht
oder das Bezugsjahr bzw. das Folgejahr ist; sonst bleibt der Vorschlag ohne Datum
(`dropUngroundedDates` in `src/lib/llm-deadline-extract.ts`). Vage Angaben wie „übernächste
Kalenderwoche“ bleiben ohne Datum, die Mail ist trotzdem als Fristsache markiert.

## Anhänge und Fristvorschläge

Ist eine E-Mail einer Akte zugeordnet, gehen ihre Anhänge denselben Weg wie Portal-Uploads
(`src/lib/email/mail-filing.ts`): Typ-/Größenprüfung, Dublettenprüfung je Akte, Engine-Upload,
Eintrag in der Dokumentliste der Akte (Quelle „email“, nicht im Mandantenportal sichtbar),
danach die normale Analyse-Strecke. Signatur-Logos, Tracking-Pixel, S/MIME-Signaturen und
Kalendereinladungen werden übersprungen. Fristen mit konkretem Datum aus dem Mailtext werden
als `suggested_deadlines` an der Akte vorgeschlagen (unbestätigt, Bestätigung unter „Eingang
prüfen“). Wird eine zunächst unzugeordnete E-Mail später einer Akte zugewiesen, holt
`fileAssignedMail` die Nachricht einmal neu vom Server und reicht Anhänge und Vorschläge nach
(wir speichern keine Rohquellen).

## Anmeldung beim Anbieter (OAuth)

Für Microsoft 365 und Google, wo Passwort-Logins oft gesperrt sind: `src/lib/email/mail-oauth.ts`,
Routen `/api/email/oauth/<anbieter>/start|callback`. Gespeichert wird nur das verschlüsselte
Refresh-Token; Zugriffstoken werden bei Bedarf erneuert und für IMAP und SMTP per XOAUTH2
verwendet. Die Schaltflächen erscheinen erst, wenn der Betreiber die Apps registriert hat:

| Variable                                            | Wert                                                                                                            |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `MAIL_OAUTH_MICROSOFT_CLIENT_ID` / `_CLIENT_SECRET` | Entra-App, mandantenfähig, delegiert: `IMAP.AccessAsUser.All`, `SMTP.Send`, `offline_access`, `openid`, `email` |
| `MAIL_OAUTH_GOOGLE_CLIENT_ID` / `_CLIENT_SECRET`    | Google-OAuth-Client (Web), Scope `https://mail.google.com/` (eingeschränkter Scope: Google-Verifizierung nötig) |

Redirect-URI: `${NEXT_PUBLIC_APP_URL}/api/email/oauth/<microsoft|google>/callback`.
**Nicht gegen echte Anbieter getestet** — dafür sind die App-Registrierungen nötig. Getestet sind
URL-Aufbau, Token-Erneuerung (gemockt), Adress-Ermittlung aus dem ID-Token.

## Offen

- OAuth-Apps bei Microsoft und Google registrieren und den Ablauf einmal echt durchspielen.
- `outlook-sync` synchronisiert nur noch den Kalender (Graph) in die Kanzlei aus `MS365_BRAIN_ID`;
  der frühere Mail-Teil ist entfernt, weil das Postfach jetzt hierüber läuft.
- Auftragsverarbeitung: Das Postfach liegt beim Mailanbieter der Kanzlei; Subsumio verarbeitet
  die abgerufenen Inhalte wie andere Akteninhalte (AVV).
