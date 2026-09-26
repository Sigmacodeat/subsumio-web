# Tests der Web-App

Engine-Tests (`server/`) sind in `server/docs/TESTING.md` beschrieben. Dieses Dokument gilt
für die Next.js-App (`src/`, `tests/`).

## Befehle

| Befehl                           | Was läuft                                                                |
| -------------------------------- | ------------------------------------------------------------------------ |
| `npm run test:unit`              | Vitest-Unit-Suite (`vitest.config.ts`)                                   |
| `npm run test:unit:future-clock` | dieselbe Suite mit um 400 Tage vorgestellter Uhr, Zeitzone Wien          |
| `npm run test:e2e`               | Playwright gegen `next start` + Mock-Engine (`tests/e2e-mock-engine.ts`) |
| `npm run test:e2e:functional`    | nur die funktionalen Kernabläufe (Liste in `package.json`)               |
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

Die Mock-Engine muss das Antwortformat der echten Engine liefern. Das gemeinsame Verhalten
beider Mock-Engines (Kollisionsprüfung = echter Engine-Prüfer, `if_absent` → 409
`page_exists`, Listen mit max. 100 Zeilen und Cursor, atomare Array-Operationen) steht in
`tests/e2e-mock-shared.ts`. Der Vertragstest `src/test/e2e-mock-contract.test.ts` startet die
Mock-Engines im Prozess und schickt ihre Antworten durch die Produkt-Parser
(`requestConflictCheck`, `engineCaseCreateDeps`, `listEnginePages`, `reserveInvoiceEntries`)
— ändert sich ein Engine-Format, schlägt er fehl und die Mocks werden nachgezogen.

`npm run test:e2e:functional` führt die Kernabläufe aus (Akte inkl. Kollision, Fristen,
Rechnung → Ausstellen → Storno, Upload, Portal, Login-Sperre/2FA); die CI fährt sie im Job
`playwright-functional`. Nicht abgedeckt: der E-Mail-Versand von Rechnungen (braucht SMTP).
