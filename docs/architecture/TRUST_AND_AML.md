# Treuhandkonto und Identitätsprüfung

Stand 17.09.2026. Umsetzung der berufsrechtlichen Pflichten nach der RAO.
Rechtstexte: RIS-Korpus `at-normen/rao` (§§ 8a–8f, 9, 10a, 12 RAO).

## Treuhandkonto (§ 10a RAO)

Code: `src/lib/trust-accounting.ts`, Routen unter `/api/legal/trust-accounts`.

- **Unveränderliche, fortlaufend nummerierte Buchungen** („Verzeichnis mit fortlaufender
  Nummerierung“). Fehler werden storniert: Das Storno ist eine eigene Buchung, die
  ursprüngliche bleibt sichtbar und ist als storniert markiert. Die Buchungsliste lässt
  sich nicht überschreiben (PATCH ändert nur den Kontostatus).
- **Jede Buchung gehört zu einer Akte.** Auszahlungen und Honorarentnahmen dürfen das
  Guthaben dieser Akte nicht übersteigen. Fremdgeld einer Akte kann nicht für eine andere
  verwendet werden, auch wenn das Konto insgesamt gedeckt ist.
- **Keine Kontoeröffnung mit Saldo ohne Akte.** Bestehendes Guthaben wird als Einzahlung
  je Akte gebucht.
- **Gleichzeitige Buchungen** laufen pro Konto nacheinander (`src/lib/keyed-lock.ts`,
  Postgres-Advisory-Lock). Nachweis: 10 gleichzeitige Auszahlungen über je 10.000 € aus
  50.000 €: genau 5 gebucht, Saldo 0, Nummern 1–7 ohne Lücke.
- **Hinweis ab 40.000 €** Treuhanderlag je Akte: Abwicklung über die Treuhandeinrichtung
  der Rechtsanwaltskammer und Meldung vor der ersten Verfügung (§ 10a Abs. 2 und 3 RAO),
  sofern keine gesetzliche Ausnahme vorliegt. Die App meldet nicht selbst an die Kammer.
- **Abgleich:** Buchsaldo berechnet der Server, der Prüfer ist der angemeldete Nutzer.
- **Protokoll:** `trust.booking`, `trust.reversal`, `trust.reconciliation`, `trust.status`
  mit Nummer, Betrag und Akte.

## Identitätsprüfung (§§ 8a ff. RAO)

Code: `src/lib/kyc.ts`, Routen `/api/kyc` und `/api/kyc/[id]`, Seite `/dashboard/kyc`.

| Pflicht                                                                      | Umsetzung                                                                         |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Zweck und Art der Geschäftsbeziehung (§ 8b Abs. 6)                           | Pflichtfeld                                                                       |
| Amtlicher Lichtbildausweis, Kopie aufbewahrt (§ 8b Abs. 2, 5)                | Art, Nummer, Behörde, Gültigkeit, Kopie; abgelaufener Ausweis blockiert           |
| Ferngeschäft (§ 8b Abs. 3)                                                   | zusätzliche Maßnahmen Pflicht                                                     |
| Rechtsträger: WiEReG-Auszug, wirtschaftliche Eigentümer (§ 8b Abs. 4a, § 8d) | Auszug und mindestens ein geprüfter Eigentümer                                    |
| PEP (§ 8f)                                                                   | Prüfung Pflicht; bei PEP Risiko „hoch“ und Dokumentation der verstärkten Sorgfalt |
| Sanktionen                                                                   | Prüfung mit Angabe von Liste und Datum; Treffer verhindert Abschluss              |
| Kein Auftrag ohne Identifizierung (§ 8b Abs. 7)                              | Mandatsannahme verlangt eine abgeschlossene Prüfung, auf dem Server kontrolliert  |
| Aufbewahrung fünf Jahre ab Mandatsende (§ 12 Abs. 3)                         | „Mandat beendet“ setzt `retain_until`                                             |

- Abgeschlossene oder nicht bestandene Prüfungen sind nicht mehr änderbar; der Verlauf
  (angelegt, bearbeitet, abgeschlossen, nicht bestanden, Mandatsende) bleibt erhalten.
- **Keine automatische Listenabfrage:** PEP- und Sanktionsprüfung führt die Kanzlei durch;
  die App dokumentiert, dass, wann, von wem und gegen welche Liste geprüft wurde.
- **Mandatsannahme:** Umwandlung einer Anfrage in eine Akte nur mit Annahmeprüfung. Ist
  eine Identitätsprüfung erforderlich, muss eine abgeschlossene Prüfung verknüpft sein
  (`/api/intake/convert`). „Nicht erforderlich“ bleibt für Aufträge außerhalb des § 8a RAO.
