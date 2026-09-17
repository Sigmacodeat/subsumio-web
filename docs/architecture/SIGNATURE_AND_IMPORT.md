# Unterschriften und Kanzlei-Import

Stand 17.09.2026.

## Unterschriften

| Weg                                              | Signaturstufe                                          | Wo                                            |
| ------------------------------------------------ | ------------------------------------------------------ | --------------------------------------------- |
| Mandant unterschreibt im Portal (Link)           | einfache elektronische Signatur, mit Zeit, IP, Browser | `/api/portal/sign`                            |
| Unterschrift in der Kanzlei (gezeichnet/getippt) | einfache elektronische Signatur                        | `/api/signature/capture`                      |
| DocuSign                                         | laut DocuSign-Konto, in der Regel fortgeschritten      | `/api/docusign/send`, `/api/docusign/webhook` |

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
- **Nicht vorhanden:** qualifizierte Signatur (A-Trust, ID Austria), eingebettetes Signieren,
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
