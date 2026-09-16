# Kanzlei-OS API-Audit

Stand: 2026-09-13. Fokus: Österreich-Pilot, ohne E-Mail-/Inbox-Verarbeitung.

## Klare Antwort

Subsumio braucht nicht 401 gleichwertige Produkt-APIs. Es braucht einen kleinen
anwaltlichen Kern und dahinter technische Dienste, Integrationen und optionale
Fachmodule. Die derzeitige Zahl ist daher kein Beweis für 401 notwendige
Funktionen, aber auch kein seriöser Löschplan: Eine Route kann ein externer
Webhook, Cronjob, Detaildatensatz oder dynamisch aufgerufener Handler sein und
im Dashboard nie als eigener Menüpunkt erscheinen.

Aktueller Bestand:

- 401 aktive `route.ts`-Dateien;
- mindestens 553 darin exportierte HTTP-Methoden (232 GET, 249 POST, 4 PUT,
  39 PATCH und 29 DELETE);
- 364 Routen verwenden die zentralen Handler-Primitives;
- 37 Routen sind direkte Handler. Darunter befinden sich legitime Sonderfälle
  wie Streaming, Webhooks und SCIM, aber auch ältere AI-Routen, deren
  Authentifizierung und Limits einzeln nachzuprüfen sind;
- 125 Routen haben außerhalb des API-Baums keinen statisch auffindbaren
  URL-String. Das ist nur eine Triage-Liste, kein Nachweis für toten Code:
  dynamische Clients, Webhooks, CLI/MCP und Cron-Aufrufer sind damit nicht
  vollständig erfassbar.

## Was die großen API-Familien leisten

| Familie              | Dateien | Einordnung für das Kanzlei-OS                                                          |
| -------------------- | ------: | -------------------------------------------------------------------------------------- |
| `legal/*`            |      85 | Fachlicher Kern plus mehrere Spezial- und AI-Pipelines; intern weiter zu bündeln       |
| `cron/*`             |      33 | Unsichtbare Betriebsabläufe wie Fristen, Abrechnung und Wartung; kein UI-Ballast       |
| `billing/*`          |      17 | SaaS-Abrechnung, Credits und Webhook; Plattformkern, nicht Kanzleifachlichkeit         |
| `auth/*`             |      15 | Login, Registrierung, Recovery, SSO und 2FA; notwendig, aber mit Legacy-Doppelungen    |
| `portal/*`           |      12 | Mandantenportal und dessen Detailaktionen; fachlicher Kern                             |
| `matter-context/*`   |      12 | Aktenkontext und Verknüpfungen; AI- und Aktenkern                                      |
| `email/*`, `inbox/*` |      11 | Parallel laufender Kommunikationsaudit; in diesem Block nicht verändert                |
| `whatsapp/*`         |       8 | Optionale Kanalintegration; Feature-Gate statt Hauptnavigation                         |
| `rciid/*`            |       8 | Spezialmodul für Krypto-/Asset-Recovery; nicht für den allgemeinen Kanzleialltag nötig |
| `docusign/*`         |       7 | Optionale Signaturintegration; behalten, aber nur bei Aktivierung sichtbar             |
| `scim/*`             |       6 | Enterprise-Provisionierung; kein Pilotkern, administrativ isolieren                    |
| `copilot/*`          |       6 | Assistenten-Orchestrierung; AI-Kern                                                    |
| `admin/*`            |       6 | Betrieb und Governance; strikt vom Kanzlei-Arbeitsraum trennen                         |

Die restlichen Familien sind überwiegend kleine CRUD-, Integrations- und
Detailgruppen. Ihre geringe Dateizahl bedeutet nicht automatisch geringe
fachliche Bedeutung.

## Was in der AT-Kanzlei bleibt

Der dauerhafte Kern folgt dem tatsächlichen Mandatszyklus:

1. Identität, Organisation, Rollen, Audit und Sicherheit;
2. Intake, Kollisionsprüfung, Kontakte und Aktenanlage;
3. Dokumente, OCR, Suche, Aktenkontext und Quellen;
4. Fristen, Aufgaben, Kalender, Wiedervorlagen und Zuständigkeiten;
5. Recherche, Analyse, Entwurf, Review, Freigabe und belastbare Fundstellen;
6. Kommunikation und Mandantenportal;
7. Zeit, Honorarvereinbarung, Rechnung, Zahlung, Fremdgeld und Controlling;
8. Integrations-, Cron- und Webhook-Infrastruktur für diese Abläufe.

Alles außerhalb dieses Zyklus muss entweder eine nachgewiesene Spezialisierung,
eine administrative Pflicht oder einen klaren Plattformzweck haben.

## In diesem Block stillgelegt

Nach `src/app/_archive/de/` wurden verschoben:

- `/api/legal/rvg`;
- `/api/pkh-beratungshilfe`;
- `/api/fachrechner`;
- `/api/fao-tracking`;
- `/api/court-directory`;
- das zugehörige FAO-Dashboard.

Damit liegen insgesamt zwölf deutsche API-Routen und vier deutsche
Dashboard-Module im privaten Archiv. Zusätzlich wurde der aktive
`/dashboard/cost-calculator` nach `src/app/_archive/risk/` verschoben. Der
bisherige Rechner war eine grobe Näherung und darf nicht als verlässliche
österreichische Gebührenberechnung online gehen.

Die Middleware beantwortet alte deutsche API-Aufrufe mit HTTP 410 und leitet
alte Dashboard-Links permanent zum Cockpit. So bleiben stillgelegte Funktionen
nicht versehentlich über Bookmarks, Copilot oder Direktaufrufe erreichbar.

## Nächste Konsolidierungsblöcke

### 1. Eindeutige Legacy-Doppelungen

- `auth/register` gegen `auth/signup` konsolidieren;
- `auth/reset-password` gegen das aktiv verwendete `auth/reset` konsolidieren;
- Health-, Readiness- und Stats-Routen nach Web-App- und Engine-Verantwortung
  benennen und Doppelungen entfernen.

Diese Änderungen brauchen zuerst Client-, Test- und externen Vertragsabgleich;
sie wurden deshalb noch nicht blind gelöscht.

### 2. Labor und interne Qualität

`brain-quality`, `eval-fixture-reviews`, `legal/eval-gate`, Red-Team,
Modellvergleich und interne Analytics gehören in einen administrativen
Qualitätsbereich. Sie sind wichtig für ein gutes AI-Gehirn, aber keine 120
alltäglichen Kanzleiseiten.

### 3. Spezialprodukt RCIID/Krypto

Die acht `rciid/*`-Routen und die Crypto-Forensik-Oberfläche bilden ein eigenes
Fachprodukt. Für einen allgemeinen österreichischen Kanzlei-Piloten sollten sie
standardmäßig deaktiviert und nur für passende Kanzleien freigeschaltet werden.
Vor dem Archivieren sind aktive Verträge, Webhook-Konfiguration und gespeicherte
Fälle zu prüfen.

### 4. Integrationen

WhatsApp, DocuSign, Outlook, DMS, SCIM und spätere ERV-Anbindungen bleiben als
Adapter erhalten, erscheinen aber nur bei aktivierter Integration. Dadurch
bleibt die technische Fähigkeit bestehen, ohne das Alltagsprodukt aufzublähen.

## Entscheidungsregel ab jetzt

Eine neue API wird nur aufgenommen, wenn sie mindestens eine dieser Bedingungen
erfüllt:

- sie unterstützt einen Schritt des kanonischen Mandatszyklus;
- sie erfüllt eine Sicherheits-, Audit- oder Betriebspflicht;
- sie ist ein klar abgegrenzter Adapter für eine aktivierbare Integration;
- sie gehört zu einem versionierten, getesteten Spezialmodul mit Eigentümer.

Jede Route braucht außerdem einen benannten Konsumenten, Auth-/Scope-Modell,
Rate-Limit, Auditbedarf, Tests und einen Stilllegungsweg. Unbekannte oder alte
Versionen bleiben nicht unbegrenzt öffentlich erreichbar.
