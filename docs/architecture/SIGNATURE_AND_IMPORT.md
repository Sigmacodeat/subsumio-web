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

## Kanzlei-Import (CSV)

Seite `/dashboard/import-kanzlei`.

- **Umfang:** Akten mit Aktenzahl, Mandant, Gegner, Rechtsgebiet, Gericht, zuständiger Person,
  Status; Mandant, Gegner und Gericht werden als Kontakte verknüpft. Keine Fristen, Dokumente,
  Zeiten oder Rechnungen (Dokumente per Ordner-Upload je Akte).
- **Ablauf:** CSV (`;` oder `,`, UTF-8) → Spalten zuordnen (Vorschlag aus den Überschriften) →
  Probelauf → Import.
- **Nie überschreiben:** Zeilen mit einer bereits vorhandenen Aktenzahl oder Akte werden
  übersprungen; die Seiten-API legt an oder aktualisiert, deshalb prüft der Import vorher.
- **Ergebnis je Zeile:** importiert, übersprungen (mit Grund), fehlgeschlagen (mit Grund).
- **Zurücknehmen:** „Importierte Akten archivieren“ archiviert genau die Akten dieses Imports
  (Akten werden nie endgültig gelöscht).

## Dokumentliste einer Akte

- `frontmatter.documents` der Akte wird von Upload, E-Mail-Ablage, DocuSign und qualifizierter
  Signatur ergänzt. Alle Schreiber halten die Sperre `caseDocumentsLockKey(brain, akte)`
  (`src/lib/case-documents.ts`), sonst überschreibt ein langsamer Schreiber bereits bestätigte
  Einträge.
- Browser-Upload (`src/lib/presigned-upload.ts`): Vorbereitung und Abschluss mit CSRF-Token.
  Ohne Objektspeicher (`no_storage_configured`) geht die Datei über `/api/upload`.
- Aktenseiten und andere bearbeitbare Datensätze werden nicht im Browser zwischengespeichert.
