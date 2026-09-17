# Honorar nach RATG

Stand 17.09.2026. Berechnung von Tarifleistungen nach dem Rechtsanwaltstarifgesetz
in der Honorarnote.

## Umfang

| Enthalten                                                                        | Nicht enthalten                                            |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| TP 1, TP 2, TP 3A, TP 3B, TP 3C nach Bemessungsgrundlage                         | TP 4 ff. (u. a. Strafsachen, Zeitversäumnis)               |
| Verhandlungen: erste Stunde voll, jede weitere begonnene zur Hälfte              | Zuschläge aus den Anmerkungen zu TP 3 (z. B. EV mit Klage) |
| Einheitssatz § 23 Abs. 3 (60 % bis 10 170 €, darüber 50 %), einfach bis vierfach | § 473a ZPO, Verbandsklagen                                 |
| ERV-Zuschlag § 23a (5,00 € einleitend, 2,60 € weiterer)                          | Reisekosten, Barauslagen, Pauschalgebühr (GGG)             |
| Streitgenossenzuschlag § 15 (10 % + 5 % je weitere Person, max. 50 %)            | AHK                                                        |

Die Umsatzsteuer rechnet die Honorarnote dazu (Österreich 20 %).
Jede Position ist ein Vorschlag; die Honorarnote wird nie automatisch versendet.

## Datenherkunft

- Beträge: `src/lib/legal/ratg-tariff-data.ts`, **erzeugt** von
  `scripts/ratg/generate-tariff.mjs` aus dem RIS-Text der Anl. 1 RATG
  (`at-normen/ratg/anl-1.md`, BGBl. Nr. 189/1969 idF BGBl. I Nr. 85/2024, abgerufen
  5.8.2026). Jede Wertstufe erhält den jüngsten valorisierten Betrag ihrer Anmerkung.
  Der Generator bricht ab, wenn ein Betrag nicht zum Faktor des Blocks passt.
- Gegenprobe: `src/lib/legal/ratg.test.ts` vergleicht alle Tabellen mit
  BGBl. II Nr. 131/2023 (amtssigniert, ab 1.5.2023). Die RATG-Fassung der Tiroler
  Rechtsanwaltskammer vom 10.06.2025 und der RIS-Stand vom 5.8.2026 nennen keine
  spätere Anpassung.
- Rechnen in Cent: `src/lib/legal/ratg.ts`.

## Wenn eine neue Valorisierungsverordnung erscheint

1. Korpus aktualisieren (RIS-Abruf der Anl. 1 RATG und § 23a).
2. `node scripts/ratg/generate-tariff.mjs` ausführen.
3. Vergleichstabellen in `ratg.test.ts` auf die neue Verordnung umstellen,
   `ERV_SURCHARGE` in `ratg.ts` und den Hinweistext prüfen.
4. Tests laufen lassen; Rechtsanwältin oder Rechtsanwalt prüft Stichproben.

## Oberfläche

Honorarnote erstellen → „Leistungen nach RATG“ (`src/components/legal/RatgTariffForm.tsx`).
Positionen werden als Pauschalposten gespeichert (Stunden 0, Satz 0), in PDF und
Druckansicht mit „—“ statt Stunden/Satz, in E-Rechnungen als Einheit „C62“.
