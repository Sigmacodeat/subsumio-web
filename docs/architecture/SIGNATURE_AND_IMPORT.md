# Unterschriften und Kanzlei-Import

Stand 17.09.2026.

## Unterschriften

| Weg                                                | Signaturstufe                                          | Wo                                            |
| -------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------- |
| Mandant unterschreibt im Portal (Link)             | einfache elektronische Signatur, mit Zeit, IP, Browser | `/api/portal/sign`                            |
| Unterschrift in der Kanzlei (gezeichnet/getippt)   | einfache elektronische Signatur                        | `/api/signature/capture`                      |
| DocuSign                                           | laut DocuSign-Konto, in der Regel fortgeschritten      | `/api/docusign/send`, `/api/docusign/webhook` |
| Qualifiziert signieren (ID Austria, A-Trust-Karte) | qualifizierte elektronische Signatur über PDF-AS-WEB   | `/api/signature/qes/*`                        |

- Die einfache Signatur **ersetzt keine eigenhändige Unterschrift, wo Schriftform verlangt
  ist**; die Oberfläche sagt das. Der Browser kann keine höhere Stufe behaupten (der Server
  setzt immer „einfach“). Ein unterschriebenes Dokument lässt sich nicht erneut unterschreiben;
  abgelaufene Anfragen werden im Portal abgelehnt.
- **DocuSign:**
  - Versand legt eine Signaturanfrage `legal/signatures/docusign-<envelopeId>` an.
  - Kanzlei (`brain_id`) und Akte (`case_slug`) reisen als Envelope-Custom-Fields mit und kommen
    über Connect zurück (JSON und XML).
  - Verarbeitung einmal je Envelope und Status; der Status der Anfrage folgt DocuSign.
  - Abgeschlossen: das unterschriebene PDF wird als Dokument der Akte abgelegt (gleicher Weg wie
    Uploads und E-Mail-Anhänge). Abgelehnt: Benachrichtigung an die Kanzlei.
  - Ohne Einrichtung antwortet der Versand mit einer klaren Meldung, der Dialog sperrt den Versand.
- **Einrichtung (Betreiber):** Variablen in `.env.example` (DocuSign-Abschnitt). Connect-URL
  `{NEXT_PUBLIC_APP_URL}/api/docusign/webhook`, HMAC aktiv, „Include Custom Fields“ aktiv.
  Der Anmelde-Host folgt der REST-Umgebung (Demo oder Produktion).
- **Qualifiziert signieren (QES):**
  - Knopf je PDF in der Dokumentenliste der Akte, nur sichtbar mit `PDFAS_WEB_URL`. Auswahl:
    ID Austria (Connector `mobilebku`) oder A-Trust-Signaturkarte (Connector `bku`).
  - Ablauf: `start` legt eine Sitzung an (30 Minuten, Tabelle `subsumio_qes_sessions`) und
    schickt den Browser zu PDF-AS-WEB. PDF-AS-WEB holt das Original einmalig über `pdf/<token>`;
    der SHA-256 wird gemerkt. Nach der Signatur ruft PDF-AS `done/<token>` auf.
  - `done` holt das signierte PDF nur vom konfigurierten PDF-AS-Host, bindet es mit
    `origdigest` an das Original und verlangt `ValueCheckCode 0`. Das signierte PDF wird als neues
    Dokument der Akte abgelegt, das Original bleibt; dazu ein Signatureintrag
    `legal/signatures/qes/<id>` mit Signaturstufe „qualifiziert“ und Zertifikatsinhaber.
  - Abbruch oder Fehler (`error/<token>`) führen zurück in die Akte mit Hinweis; Audit-Einträge
    `signature.qes_start`, `signature.qes_signed`, `signature.qes_failed`.
  - Einrichtung: PDF-AS-WEB-Instanz, Rückruf-URLs dort freigeben (siehe `.env.example`).
  - Dateiname der Kopie: Titel ohne „.pdf“ plus „(qualifiziert signiert).pdf“. Die
    Dokumentliste der Akte trägt `mime_type`; ältere Einträge ohne Typ und Endung bekommen den
    Knopf, der Server prüft die Datei (`source_format` pdf).
- **Nicht vorhanden:** eingebettetes Signieren,
  Verbindungs-Knopf für persönliche DocuSign-Konten (Versand läuft über das Servicekonto).

## Kanzlei-Import

Seite `/dashboard/import-kanzlei`, Logik in `src/lib/kanzlei-import/` (`values.ts`, `parse.ts`,
`fields.ts`, `plan.ts`, `run.ts`; alles ohne Oberfläche getestet).

- **Arten und Reihenfolge:** Akten → Kontakte → Fristen → Zeiten. Fristen und Zeiten werden über
  die Aktenzahl (sonst exakte Bezeichnung) einer Akte zugeordnet; mehrdeutige oder unbekannte
  Akten sind Fehler der Zeile.
- **Dateien:** CSV/TXT mit `;`, `,` oder Tabulator, UTF-8 oder Windows-1252 (erkannt über
  ungültiges UTF-8); Excel `.xlsx` (erstes Blatt, Datums- und Dauerzellen als Text). Altes `.xls`
  wird mit Hinweis abgelehnt.
- **Werte:** Datum `31.12.2026`, `31.12.26`, ISO, Excel-Seriennummer; nicht existierende Tage
  werden abgelehnt. Beträge `1.234,56`. Dauer `1:30`, `0,75` (Spalte „Stunden“), `45`
  (Spalte „Minuten“), `20 min`, `2 Std`. Status und Rollen aus üblichen Wörtern, unbekannte mit
  Hinweis.
- **Probelauf = Plan:** Vorhandene Akten, Kontakte und Fristen werden vollständig gelesen (in
  Blöcken zu 200, gelöschte mitgezählt). Jede Zeile bekommt eine Entscheidung mit Grund:
  neu, ergänzen, übersprungen, Fehler; dazu Hinweise. Der Import führt genau diesen Plan aus.
- **Nie überschreiben:**
  - Akten: vorhandene Aktenzahl oder Seite → übersprungen; vor dem Anlegen wird erneut geprüft.
    Status „erledigt“ u. ä. → archiviert.
  - Kontakte: Treffer per E-Mail, sonst eindeutigem Namen; nur leere Felder (Firma, E-Mail,
    Telefon, Anschrift, Notiz) werden ergänzt. Mehrere gleichnamige Kontakte → übersprungen.
  - Fristen: eigene `legal_deadline`-Seiten, `review_status: unreviewed`,
    `imported_unverified: true`, Hinweis „Fristberechnung nicht geprüft“. Notfrist unklar →
    Notfrist mit Vier-Augen-Kontrolle. Vergangene und erledigte Fristen werden übersprungen
    (vergangene optional übernehmbar), gleiche Frist (Akte, Datum, Bezeichnung) ebenso.
  - Zeiten: an `time_entries` der Akte angehängt, ein Schreibvorgang je Akte; gleicher Eintrag
    (Datum, Minuten, Tätigkeit) wird übersprungen. „Abgerechnet“ aus der Datei, sonst gewählte
    Voreinstellung (Standard: nicht abgerechnet).
- **Zurücknehmen:** Jeder Import speichert, was er geschrieben hat (`migration_project`-Seite,
  `created_refs`). „Letzte Importe“ nimmt ihn auch später zurück: Akten archivieren, Fristen und
  Kontakte entfernen, ergänzte Kontaktfelder leeren (nur wenn unverändert), Zeiten entfernen
  (inzwischen verrechnete bleiben).

## Dokumentliste einer Akte

- `frontmatter.documents` der Akte wird von Upload, E-Mail-Ablage, DocuSign und qualifizierter
  Signatur ergänzt. Alle Schreiber halten die Sperre `caseDocumentsLockKey(brain, akte)`
  (`src/lib/case-documents.ts`), sonst überschreibt ein langsamer Schreiber bereits bestätigte
  Einträge.
- Browser-Upload (`src/lib/presigned-upload.ts`): Vorbereitung und Abschluss mit CSRF-Token.
  Ohne Objektspeicher (`no_storage_configured`) geht die Datei über `/api/upload`.
- Aktenseiten und andere bearbeitbare Datensätze werden nicht im Browser zwischengespeichert.

## Listen und gelöschte Einträge

- Die Engine liefert je Anfrage höchstens 100 Seiten (`clampSearchLimit` in
  `server/src/core/operations.ts`, Operation `list_pages`); größere Werte werden still gekürzt.
  `listEnginePages` (`src/lib/engine-pages.ts`) liest deshalb in Blöcken, im Browser
  `api.brain.listAllPages` und `batchListPages`. Damit lesen vollständig: Aktenliste,
  Kontaktliste, Kollisionsprüfung beim Anlegen einer Akte, Fristenliste, Fristen-Digest,
  Fristen-Erinnerungen, Rechnungsnummern-Vergabe, DocuSign-Zuordnung, Portal-Anfragen,
  Prüfeingang, Import und die Wartungsjobs.
- Gelöschte Einträge (außer Akten) bleiben als `status: tombstoned` bestehen. `/api/pages`,
  `/api/pages/batch-list` und `listEnginePages` lassen sie weg; `include_tombstoned=1` bzw.
  `includeTombstoned` liefert sie für Aufrufer, die per Offset blättern.

## Fristen-Erinnerungen

`src/lib/deadline-reminders.ts` entscheidet, welche Erinnerung heute fällig ist;
`/api/cron/deadline-reminders` verschickt sie per E-Mail, WhatsApp, Push und im Programm.

- **Beide Orte:** Fristen in der Akte (`frontmatter.deadlines`) und eigenständige
  `legal_deadline`-Seiten (Fristenliste, Import, Dokumentanalyse, Schnellanlage). Vorher wurden
  nur die Fristen in der Akte erinnert.
- **Stufen 7, 3, 1 und 0 Tage** vor Fälligkeit, jede genau einmal. Beim Versenden werden alle
  bereits überschrittenen Stufen vermerkt, sonst feuert am Folgetag die übersprungene Stufe.
- **Vorfrist** einmal, sobald sie erreicht ist.
- **Nicht erinnert:** erledigte, stornierte, verworfene und gelöschte Fristen, Fristen
  archivierter Akten und überfällige Fristen (die stehen im täglichen Sammelbericht).
- **Doppelt vermeiden:** Liegt eine eigenständige Frist auch als Kopie in der Akte (gleiches
  Datum und gleiche Bezeichnung oder `id` „page:<slug>“), zählt nur die eigenständige.
- **Vermerken:** Die Akte wird vor dem Schreiben neu gelesen, und nur ihre Fristenliste wird
  geschrieben. Vorher schrieb der Job den alten Stand der ganzen Akte zurück und konnte
  gleichzeitig hochgeladene Dokumente oder erfasste Zeiten überschreiben.
- **Ohne Akte:** Fristen ohne Aktenbezug werden als eigene Gruppe „Fristen ohne Akte“ erinnert.
