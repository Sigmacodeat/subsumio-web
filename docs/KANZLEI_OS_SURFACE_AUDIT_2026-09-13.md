# Kanzlei-OS surface audit

Stand: 2026-09-13, nach Block 4.

## Ergebnis

Die Dateizahl ist nicht mit der Zahl der sichtbaren Produktfunktionen
gleichzusetzen. Der aktive Build enthält 263 `page.tsx`-Dateien:

- 125 Dashboard-Seiten, davon 20 verschachtelte Detail-/Unterseiten;
- 138 öffentliche, Auth-, Portal-, Mobile- und lokalisierte Seiten;
- 412 API-Route-Handler.

Sechs Dashboard-Dateien waren keine Produktflächen, sondern reine Aliase. Sie
wurden archiviert; die URLs bleiben über permanente serverseitige Redirects
gültig. Das senkt den Stand von 269 auf 263 Seiten und im Dashboard von 131 auf
125 Seiten.

## Kanonische Kanzlei-Arbeitsräume

Die bisher zwölf Modulgruppen der erweiterten Sidebar sind zu sechs
anwaltlichen Arbeitsräumen zusammengeführt:

| Arbeitsraum          | Aufgabe im Kanzleialltag                           | enthaltene Navigationsmodule |
| -------------------- | -------------------------------------------------- | ---------------------------: |
| Mandate & Beteiligte | Aufnahme, Beteiligte, Vollmachten, Mandantenkanäle |                           11 |
| Termine & Aufgaben   | Fristen, Kalender, Aufgaben, Wiedervorlagen        |                            6 |
| Dokumente & Wissen   | DMS, Entwurf, Verträge, Kanzleiwissen              |                           16 |
| Prozess & Gericht    | Prozessführung, Strategie, Rechtsmittel, Analytics |                            7 |
| Honorar & Finanzen   | Zeiten, Rechnungen, Gebühren, Fremdgeld, FiBu      |                           10 |
| Kanzlei & Compliance | Workflows, Organisation, Governance, Aufsicht      |                           19 |

Die sechs primären Einstiege (Cockpit, Akten, Fristen, Intake, Recherche und
Assistent) bleiben unverändert. Im standardmäßigen Fokusmodus werden nur die
ersten drei operativen Arbeitsräume gezeigt; Spezial- und Adminfunktionen
bleiben über den erweiterten Modus, die Suche und „Alle Funktionen“ erreichbar.

## Behalten, aber nicht als Alltagseinstieg behandeln

Die folgenden Flächen sind fachlich plausibel, aber Spezialwerkzeuge oder
Kanzlei-Administration. Ihre Existenz rechtfertigt keinen prominenten
Hauptmenüpunkt:

- eDiscovery/Review Sets, Tabular Review, Litigation Analytics;
- Red Team, War Room, Berufungs-Agent und Crypto-Forensik;
- SCIM, API-Keys, Konnektoren, Modellwahl, Monitoring und Audit;
- Legal Hold, Retention, Verfahrensdokumentation und Datenexport;
- Agenten, autonome Jobs und deren Berichte.

Diese Module dürfen erst nach Pilotnutzung gelöscht werden. Ohne Nutzungsdaten
wäre eine Entfernung fachlicher Funktionen spekulativ; die vereinfachte
Informationsarchitektur beseitigt bereits die alltägliche Überforderung.

## Nächster sinnvoller Trennblock

Der nächste strukturelle Kandidat ist nicht das Kanzlei-Dashboard, sondern die
öffentliche Locale-Shell: Ein großer Teil der 138 Nicht-Dashboard-Seiten besteht
aus mechanisch duplizierten DE/AT/CH/EN-Marketing-, Auth- und Rechtstext-Routen.
Diese sollten auf eine gemeinsame locale-parametrisierte Implementierung
konsolidiert werden. Vor der Umsetzung sind SEO-Canonical-Tags, hreflang,
rechtlich abweichende Texte und bestehende Backlinks als harte Gates zu prüfen.

Nicht Bestandteil dieses Blocks waren E-Mail, Outlook, Inbox, Kommunikation
und beA; diese Flächen werden parallel separat auditiert.
