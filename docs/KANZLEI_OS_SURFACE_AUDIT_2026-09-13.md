# Kanzlei-OS surface audit

Stand: 2026-09-13, nach Block 7 (API- und Rechtsrisiko-Schnitt).

## Ergebnis

Die Dateizahl ist nicht mit der Zahl der sichtbaren Produktfunktionen
gleichzusetzen. Der aktive Quellbaum enthält 157 routbare `page.tsx`-Dateien:

- 120 Dashboard-Seiten, davon eine Startseite, 99 direkte Module und 20
  verschachtelte Detail-/Unterseiten;
- 37 österreichische öffentliche, Auth-, Portal-, Mobile- und Ressourcenseiten;
- 401 API-Route-Dateien (einschließlich der parallel ergänzten Demo-Data-Route).

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

## Block 6: interner Österreich-Schnitt

Der interne Jurisdiktionsschnitt ist umgesetzt:

- Onboarding erzwingt serverseitig `AT`; manipulierte oder alte DE/CH-Werte
  können den Pilot-Rechtsraum nicht umstellen.
- Neue Akten, Schnellanlage und Copilot starten in AT; EU bleibt für unmittelbar
  anwendbares EU-Recht auswählbar.
- Quellen, Normen, Rechtsprechung, Präzedenzsuche, Urteilsdatenbank und
  Kommentierungen sind aktiv auf AT beziehungsweise AT/EU begrenzt.
- Der deutsche RVG-Pfad ist kein Copilot-Tool mehr. Der bisherige
  RATG/AHK-Rechner wurde ebenfalls aus dem aktiven Produkt genommen: Seine
  pauschalen Stufen und Zuschläge bilden weder Tarifpost, Verfahrensart,
  Einheitssatz noch den zeitlichen Rechtsstand belastbar ab.
- beA, DATEV, RVG, PKH/Beratungshilfe, GKG-Fachrechner, FAO-Tracking und die
  deutsche SAFE-Gerichtssuche wurden mit vier Dashboard-Seiten und zwölf
  API-Routen nach `src/app/_archive/de/` verschoben. Der noch nicht validierte
  Kostenrechner liegt getrennt unter `src/app/_archive/risk/`.
- Alte Direktaufrufe werden am Edge umgeleitet beziehungsweise mit HTTP 410
  beendet.
- Der falsche Verweis auf § 9a RAO wurde auf die Verschwiegenheitsbestimmung in
  § 9 Abs. 2 RAO korrigiert; pauschale Konformitätsversprechen wurden entschärft.

## Nächster sinnvoller Trennblock

Die Detailklassifikation der 401 aktiven API-Dateien und die nächste
Konsolidierungsreihenfolge stehen im ergänzenden
`KANZLEI_OS_API_AUDIT_2026-09-13.md`. Als Nächstes folgen eindeutige
Legacy-Doppelungen, Laborflächen und das optionale RCIID/Krypto-Modul. Seltene
Fachfunktionen werden erst nach Nutzungs- und Mandantenprüfung gelöscht.

Nicht Bestandteil dieses Blocks waren E-Mail, Outlook, Inbox und die allgemeine
Kommunikationsverarbeitung; diese Flächen werden parallel separat auditiert.
