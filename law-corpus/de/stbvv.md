# Steuerberatervergütungsverordnung (StBVV)

> Corpus: law-corpus/de/stbvv.md
> Stand: 2026-06-28 — Konsolidierte Fassung

## § 1 StBVV — Anwendungsbereich

Die StBVV regelt die Gebühren für:

1. Buchführung (§ 6)
2. Jahresabschluss (§ 7)
3. Steuererklärungen (§ 10)
4. Steuerberatung (§ 14)
5. Einspruch/Berufung (§ 16)
6. Finanzgerichtsverfahren (§ 17)
7. Lohnabrechnung (§ 20)
8. Sonstige Leistungen (§ 24)

## § 2 StBVV — Gegenstandswert

(1) Gegenstandswert ist der Wert des Gegenstands, auf den sich die Tätigkeit bezieht.

(2) Bei Steuererklärungen: Einkommen/Umsatz als Bemessungsgrundlage.
(3) Bei Buchführung: Jahresumsatz.
(4) Bei Jahresabschluss: Bilanzsumme + Umsatz.

## § 13 StBVV — Stufenformel

Die Gebühr wird nach der Stufenformel berechnet:

| Gegenstandswert bis EUR | Gebühr EUR |
| ----------------------- | ---------- |
| 500                     | 51,50      |
| 1.000                   | 66,50      |
| 3.000                   | 111,50     |
| 5.000                   | 156,50     |
| 10.000                  | 206,50     |
| 25.000                  | 331,50     |
| 50.000                  | 556,50     |
| 100.000                 | 1.056,50   |
| 250.000                 | 2.056,50   |
| 500.000                 | 3.556,50   |
| 1.000.000               | 5.556,50   |
| 2.500.000               | 10.556,50  |
| 10.000.000              | 25.556,50  |

## § 14 StBVV — Aktivitätsfaktoren

| Tätigkeit               | Faktor |
| ----------------------- | ------ |
| Buchführung             | 1,0    |
| Steuererklärung         | 1,3    |
| Lohnabrechnung          | 1,0    |
| Jahresabschluss         | 2,5    |
| Steuerberatung          | 1,0    |
| Einspruch               | 1,6    |
| Berufung                | 2,0    |
| Finanzgerichtsverfahren | 3,0    |
| Buchwertumstellung      | 1,0    |
| Sonderprüfung           | 1,5    |

## § 24 StBVV — Auslagenpauschale

Auslagenpauschale: 20 EUR (pauschal, immer fällig).

## § 25 StBVV — Umsatzsteuer

Auf die Gebühr und Auslagenpauschale wird Umsatzsteuer (19%) erhoben.

## Berechnungsformel

```
gebuehr = basisGebuehr(gegenstandswert) * aktivitaetsfaktor
summeNetto = gebuehr + auslagenpauschale
mwst = summeNetto * 0.19
summeBrutto = summeNetto + mwst
```

## Implementierung

Siehe `src/lib/stbvv.ts` — `calculateStBVV(gegenstandswert, activity)` liefert:

- `basisGebuehr`
- `activityFactor`
- `gebuehrNetto`
- `auslagenpauschale`
- `summeNetto`
- `mwst`
- `summeBrutto`
