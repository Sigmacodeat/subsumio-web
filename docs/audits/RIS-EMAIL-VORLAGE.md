Betreff: Anmeldung Massendownload RIS OGD — Subsumio Legal Tech

Sehr geehrtes RIS-Team,

wir möchten einen Massendownload über die RIS Open Government Data API durchführen und melden diesen gemäß den RIS OGD-Nutzungsbedingungen an:

**1. Öffentliche IP-Adresse:**
178.115.84.86

**2. Geplanter Zeitraum:**
Ab sofort — einmaliger Initialimport der bestehenden Bestände, danach regelmäßige Updates (täglich/wöchentlich für neue Entscheidungen).

**3. Betroffene RIS-Anwendungen:**

- Justiz (OGH)
- Verwaltungsgerichtshof (VwGH)
- Verfassungsgerichtshof (VfGH)
- Bundesverwaltungsgericht (BVwG)
- Landesverwaltungsgerichte (LVwG)
- Asylgerichtshof / Bundesverwaltungsgericht Asyl (AsylGH)
- Unabhängige Verwaltungssenate (UVS)
- Datenschutzbehörde (DSK)
- Gleichbehandlungsanwaltschaft (GBK)
- Personalvertretung (PVAK)
- Disziplinarkommission (DOK)

**4. Request-Rate und parallele Verbindungen:**

- 1 Request alle 1–2 Sekunden
- 1 parallele Verbindung (single connection)
- Exponentielles Backoff bei HTTP 429/5xx
- Volltext-Downloads primär außerhalb der Bürozeiten (18:00–06:00 CET) sowie am Wochenende

**5. Art des Downloads:**
Einmaliger Initialimport (Volltexte aller verfügbaren Entscheidungen) + anschließend regelmäßige Synchronisation neuer Entscheidungen über die Historyabfrage.

**Zweck:**
Aufbau einer juristischen Recherchedatenbank (Subsumio) für österreichische Rechtsprechung und Gesetzestexte. Die Daten werden unter CC BY 4.0 genutzt mit korrekter Namensnennung ("Quelle: RIS – Rechtsinformationssystem des Bundeskanzleramtes").

Wir bitten um Bestätigung, dass der Massendownload von dieser IP-Adresse freigeschaltet bzw. toleriert wird, damit unser automatisierter Download nicht fälschlicherweise als DDoS-Angriff eingestuft wird.

Mit freundlichen Grüßen,

[NAME]
Subsumio Legal Tech
[EMAIL]
[TELEFON]
