# Anwaltstag — Pilot-Testskript

**Ziel:** Ein österreichischer Rechtsanwalt testet den kompletten Arbeitsalltag in Subsumio —
von der Kontoerstellung über Aktenanlage, Dokumenten-Upload und KI-Recherche bis zu
Fristen, Rechnung und Mandantenportal. Dauer: ca. 45–60 Minuten.

**Zugang:** `https://<produktions-url>/at/signup` — mit echter Kanzlei-E-Mail registrieren.

---

## 1. Onboarding (5 min)

1. Auf `/at/signup` registrieren (Name, E-Mail, Passwort).
2. Du landest im Dashboard-Onboarding. Kanzleidaten ausfüllen **oder** überspringen.
3. Nach dem Onboarding öffnet sich das Dashboard.

**Erwartet:**

- Dashboard lädt ohne Fehler, Sidebar zeigt die Bereiche (Übersicht, Akten, Fristen, Posteingang …).
- Eine **Demo-Akte "Berger ./. Muster Werk GmbH"** ist bereits vorhanden — daran kann sofort
  getestet werden, ohne echte Daten einzugeben.
- **Keine** beA-/DATEV-Einträge in der Navigation (österreichische Ansicht).

## 2. Aktenmanagement (10 min)

1. `Akten → Neue Akte`: eine eigene Akte anlegen (Aktenzahl, Rechtsgebiet, Klient, Gegner).
   → Die Kollisionsprüfung läuft automatisch — bei Konflikt kommt ein Hinweis.
2. Akte öffnen → Detailseite prüfen (Übersicht, verknüpfte Elemente).
3. Demo-Akte öffnen und Inhalt ansehen.

**Erwartet:**

- Akte wird angelegt und ist sofort in der Liste sichtbar.
- Detailseite zeigt Fristen/Dokumente der Akte (bei neuer Akte sauberer Empty-State).

## 3. Dokumenten-Upload & Posteingang (10 min)

1. `Upload`: ein echtes PDF hochladen (z. B. ein Schreiben), ggf. der eigenen Akte zuordnen.
2. Warten bis Extraktion fertig ist; Dokument in `Akte → Dokumente` prüfen.
3. `Posteingang` öffnen → Demo-Eingang "Kündigungsschreiben Berger" ansehen,
   Status ändern / in Akte umwandeln testen.

**Erwartet:**

- Upload läuft mit Fortschritt, Fehler werden angezeigt.
- Dokument ist der Akte zugeordnet und im Text abrufbar.
- Posteingang zeigt den Eintrag mit Status-Badge.

## 4. KI-Recherche mit Belegen (10 min) — **Kern-Test**

1. `Copilot` (rechte Sidebar) oder `Chat` öffnen.
2. Frage stellen, z. B. **„Welche Fristen laufen in der Akte Berger?"** oder eine echte
   Rechtsfrage zum hochgeladenen Dokument.
3. Antwort prüfen: **Zitate/Quellen-Panel** und Hinweis **„anwaltlich zu prüfen"**
   müssen sichtbar sein.

**Erwartet:**

- Antwort kommt mit Belegstellen aus den eigenen Dokumenten/Akten.
- Keine Antwort ohne Citation-Panel + Trust-Hinweis.

## 5. Fristen & Fristenbuch (5 min)

1. `Fristen`: Demo-Frist „Anfechtungsfrist" sichtbar? Eigene Frist zur neuen Akte anlegen.
2. `Fristenbuch`: Liste, Filter, Suche testen.
3. Frist als erledigt markieren / bearbeiten.

**Erwartet:**

- Neue Frist erscheint sofort, Fristenbuch filtert korrekt.
- Demo-Frist ist mit der Demo-Akte verknüpft.

## 6. Rechnungslegung (10 min)

1. `Rechnungen → Neue Rechnung`: Demo-Akte wählen, Positionen eintragen,
   Honorar berechnen lassen.
2. Rechnung speichern und in der Liste prüfen.

**Erwartet:**

- Rechnung wird mit korrekter Nummer/UID erstellt, Statuswechsel funktionieren.

## 7. Mandantenportal (5 min)

1. `Mandantenportal` öffnen, Portal-Zugang für die eigene Akte erzeugen.
2. Den Portal-Link in einem privaten Fenster öffnen → Mandantensicht prüfen.

**Erwartet:**

- Portal-Token wird erzeugt, Link zeigt freigegebene Inhalte ohne Login.

## 8. Einstellungen (5 min)

1. `Einstellungen`: Kanzleidaten, Profil, Sicherheit prüfen.
2. Sprache/Theme kurz wechseln.
3. Optional: `Einstellungen → Kanzlei → Demo-Daten` — die fiktive Testakte
   per Knopf entfernen, sobald echte Akten gepflegt werden.

**Erwartet:**

- Einstellungen speichern ohne Fehler; keine toten Links.
- Demo-Cleanup löscht Akte + Frist + Dokument + Eingang und bestätigt.

---

## Feedback melden

Pro Problem notieren: **Seite/Schritt · was erwartet · was passiert · Screenshot**.
Idealerweise direkt als Issue mit dem Browser-Pfad (z. B. `/dashboard/cases`).

### Bekannte Einschränkungen im Pilot

- **beA, DATEV, XJustiz** sind für Österreich deaktiviert (deutsche Integrationen).
- ERV/webERV-Anbindung ist noch nicht produktiv — Eingänge kommen aktuell über
  Upload/E-Mail/Portal.
- KI-Antworten sind Assistenz — jede Rechtsauskunft ist **anwaltlich zu prüfen**.
