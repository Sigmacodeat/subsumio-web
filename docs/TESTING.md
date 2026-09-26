# Tests der Web-App

Engine-Tests (`server/`) sind in `server/docs/TESTING.md` beschrieben. Dieses Dokument gilt
für die Next.js-App (`src/`, `tests/`).

## Befehle

| Befehl                           | Was läuft                                                                |
| -------------------------------- | ------------------------------------------------------------------------ |
| `npm run test:unit`              | Vitest-Unit-Suite (`vitest.config.ts`)                                   |
| `npm run test:unit:future-clock` | dieselbe Suite mit um 400 Tage vorgestellter Uhr, Zeitzone Wien          |
| `npm run test:e2e`               | Playwright gegen `next start` + Mock-Engine (`tests/e2e-mock-engine.ts`) |
| `npm run test:workflow`          | Selbsttest der Workflow-Mock-Engine (keine Produktroute)                 |

Ausgaben immer in eine Datei umleiten und den Exit-Code getrennt lesen
(`npm run test:unit > /tmp/unit.txt 2>&1; echo EXIT=$?`).

## Zeitabhängige Tests

Ein Test darf nicht davon abhängen, an welchem Tag er läuft. Wer feste Kalenderdaten
(Fristende, „künftiges“ Zustelldatum, Rechnungsjahr, Feiertage) mit „jetzt“ vergleicht,
fixiert die Uhr:

```ts
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-15T10:00:00+02:00"));
});
afterEach(() => vi.useRealTimers());
```

`toFake: ["Date"]` lässt `setTimeout`/`AbortSignal.timeout` echt laufen. Daten „in n Tagen“
werden aus dieser festen Zeit abgeleitet; wo Feiertage oder Wochenenden eine Rolle spielen,
wird der Stichtag bewusst gewählt (und der Feiertagsfall als eigener Test geprüft).

**Wächter:** Die CI führt die Unit-Suite zusätzlich mit `test:unit:future-clock` aus
(`scripts/test-future-clock.mjs` lädt `scripts/test-clock-shift.cjs` in jeden Prozess).
Ein Test mit Ablaufdatum wird dort sofort rot, nicht erst am Stichtag. Lokal lässt sich ein
bestimmter Zeitpunkt prüfen:

```bash
CLOCK_SHIFT_TO=2027-01-01T00:30:00+01:00 node scripts/test-future-clock.mjs src/app/api/invoices
```

Playwright-Specs erzeugen Fälligkeiten relativ zum Laufzeitpunkt (`daysFromNow(n)` in
`tests/e2e-playwright/helpers.ts`), nie als festes Datum.

## Playwright und Mock-Engine

Die Mock-Engine muss das Antwortformat der echten Engine liefern. Vertragstests in
`tests/e2e-mock-engine.contract.test.ts` schicken ihre Antworten durch die Produkt-Parser
(z. B. `requestConflictCheck`) — ändert sich ein Engine-Format, wird dort nachgezogen.
