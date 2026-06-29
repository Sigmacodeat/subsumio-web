# Abgabenordnung (AO) — Steuerliches Verfahrensrecht

> Corpus: law-corpus/de/ao.md (bereits vorhanden — 728 KB Volltext)
> Stand: 2026-06-28 — Referenz-Index für GBrain

## Bereits vorhanden: `law-corpus/de/ao.md`

Die AO ist als Volltext im Corpus. Hier eine strukturierte Index-Übersicht der wichtigsten Paragraphen für die Steuerfristen-Engine.

## § 149 AO — Abgabe der Steuererklärung

(1) Steuererklärungen sind nach amtlichem Vordruck abzugeben.

(2) Frist: bis 31. Juli des Folgejahres (ESt, KSt, GewSt).

(3) Verlängerung: auf Antrag bis 28. Februar des übernächsten Jahres.

## § 355 AO — Vorauszahlungen

(1) Vorauszahlungen sind quartalsweise zu leisten:

- 10. März
- 10. Juni
- 10. September
- 10. Dezember

(2) Herabsetzung auf Antrag, wenn Vorauszahlung unverhältnismäßig hoch.

## § 109 AO — Einspruchsfrist

(1) Einspruch innerhalb von 1 Monat nach Zustellung des Bescheids.

(2) Kein Einspruch gegen: Verwaltungsakte, die der Vollstreckung dienen.

## § 477 AO — Festsetzungsverjährung

(1) Festsetzungsfrist: 4 Jahre (regulär).
(2) Bei Verkürzung: 5 Jahre.
(3) Bei Hinterziehung: 10 Jahre.

(4) Beginn: Ablauf des Kalenderjahres, in dem die Steuer entstanden ist.

## § 110 AO — Wiedereinsetzung in den vorigen Stand

(1) Wiedereinsetzung bei unverschuldeter Fristversäumnung.

(2) Antrag innerhalb 1 Monat nach Wegfall des Hindernisses.

## § 367 AO — Aussetzung der Vollziehung

(1) Einspruch hat keine aufschiebende Wirkung.

(2) Aussetzung der Vollziehung auf Antrag, wenn ernstliche Zweifel an der Rechtmäßigkeit.

## § 191 AO — Festsetzung von Steuermessbeträgen

(1) Steuermessbescheid gesondert festzustellen (GewSt, Grundsteuer).

(2) Festsetzungsfrist: wie bei der Steuer (§ 477 AO).

## § 152 AO — Verspätungszuschlag

(1) Verspätungszuschlag bei nicht fristgerechter Abgabe.

(2) Höhe: 0,25% der Steuer, min. 25 EUR, max. 25.000 EUR.

## § 240 AO — Säumniszuschlag

(1) Säumniszuschlag bei nicht rechtzeitiger Zahlung.

(2) 1% der Steuer, min. 10 EUR pro angefangenen Monat.

## Implementierung

Siehe `src/lib/tax-deadlines.ts`:

- `upcomingTaxDeadlines(now, daysAhead)` — generiert Fristen
- `shiftToWorkingDay(date)` — Wochenende/Feiertag → nächster Werktag
- `einspruchDeadline(bescheidDatum)` — § 109 AO (1 Monat)
- `festsetzungsverjaehrung(jahr, hinterziehung)` — § 477 AO (4/10 Jahre)
