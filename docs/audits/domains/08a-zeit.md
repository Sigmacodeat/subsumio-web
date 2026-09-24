# Audit 8a — Zeiterfassung & Abwesenheiten

Branch `audit/zeit`. Scope: `api/time{,-tracking}/**`, `api/booking/**`,
`api/absences/**`, `api/cron/time-*`, Dashboard time/time-tracking/
time-suggestions/absences, lib `time-*`, `passive-time`, `absence`,
`*booking*`, `datetime`. Grenze: `api/billing|invoices|e-invoice|fibu|datev`
= Domäne 4 (live) — nur gelesen, Funde dokumentiert.

## Bestätigte Bugs

### B1 — `/dashboard/time` ist komplett leer (Envelope nicht ausgepackt)

`api.time.list` (`src/lib/api.ts` ~3179) gibt den rohen Body zurück; die Route
antwortet mit `apiSuccess` → `{ data: { entries, total, summary } }`. Die Seite
liest `data.entries` → `undefined` → `|| []` — die Zeiterfassungs-Seite zeigt
**nie** Einträge, auch nicht die gerade angelegten. Gleiche Klasse:
`api.time.create/update/delete/markBilled/unbill` liefern `{data:…}`, die
Aufrufer erwarten die Nutzlast direkt (`time-suggestions/page.tsx` liest
`entry.id` → `undefined` → `time_entry_id` am Vorschlag nie gesetzt).
Fix: `.data` in den `api.time.*`-Methoden auspacken.

### B2 — `auto-extract?auto_approve` verliert die Einträge

`src/app/api/time/auto-extract/route.ts` ~100–128: `createTimeEntry` ist eine
reine Funktion — das Ergebnis wird **nirgends persistiert**. `persisted_count`
zählt Einträge, die nie geschrieben wurden; `persisted`-Flag ist zusätzlich
immer `false`, weil `created.id` (neu generiert) mit `e.id` (extracted-UUID)
verglichen wird. Fix: tatsächlich in `time_entries` der Akte schreiben
(write-with-retry, siehe B6), `persisted` gegen die tatsächlich geschriebenen
Ids prüfen.

### B3 — `/api/time/billing-summary` sieht die Akten-Zeiten nicht

`route.ts` ~27: liest nur `type=time_entry`-Seiten (limit 500, keine
Pagination). Der Hauptspeicher — `time_entries` im Akten-Frontmatter — fehlt
komplett → die Abrechnungs-Übersicht unterschlägt fast alles. Fix: beide
Quellen mergen wie `GET /api/time` (shared Helper).

### B4 — Inactivity-Cron bucht die Inaktivität mit

`cron/time-tracking/inactivity-check` ~38 ruft `stopCurrentActivity`, das
`endedAt = now` setzt (`src/lib/time-tracking.ts` ~469). Wer den Timer
vergisst, bekommt Start→Jetzt berechnet — inkl. Mittag/Nacht/Wochenende, bis
der Cron merkt, dass 30 min kein Heartbeat kam. Fix: `endedAt` =
`last_activity_at` des Activity-Records (override-Parameter).

### B5 — `isAbsenceActive`: letzter Tag fällt weg

`src/lib/absence.ts` ~69: `new Date(end_date)` ist Mitternacht UTC →
`now <= end` ist am gesamten Enddatum false. `activeDelegateFor` (Konsumenten:
`deadline-reminders`, `fristen-read-model`, Dashboard-Briefing,
Wiedervorlagen) zeigt die Vertretung am letzten Tag nicht mehr — UI-Kommentar
sagt explizit „der letzte Tag zählt mit" (`absences/page.tsx` ~35).
Fix: inklusiver Tagesvergleich (Europe/Vienna).

### B6 — `PATCH /api/time` schreibt unvalidierte Werte

`timePatchSchema` ist `.passthrough()`; die `allowed`-Whitelist kopiert
Rohwerte: `minutes: "abc"`/`-50`, `rate: -1`, `date: "xyz"` landen ungeprüft in
`time_entries` → negative/korrupte Abrechnung (`computeSummary` summiert
blind). Auch `POST` hat keine Obergrenze (`minutes: 999999` > 24 h/Tag).
Fix: typisierte Felder im Schema (minutes int 1–1440, rate ≥ 0, ISO-Datum,
enum), Whitelist bleibt.

### B7 — `GET /api/time?limit=` NaN → leere Liste

`parseInt` ohne Fallback: `limit=abc` → `Math.min(NaN, 500)` → `slice(0, NaN)`
→ `[]` statt Default. Fix: `Number.isFinite`-Guard.

### B8 — Standalone-`time_entry`-Pages sind schreibgeschützt-tot

Timer-Stop und Importe legen Einträge als eigene Pages
(`time-entries/{user}/…`) an; `PATCH`/`DELETE`/`mark-billed`/`unbill`
arbeiten nur auf `case.time_entries[]`. Editieren/Löschen solcher Einträge in
der UI → 404; `billed`-Markierung unmöglich → bleiben ewig „unbilled".
Fix: PATCH/DELETE-Fallback auf die Page (id = Slug, nur `time-entries/*`),
Tombstone statt Array-Entfernung; GET filtert tombstoned Pages.
mark-billed für Standalone-Pages: dokumentiert, nicht gefixt (Rechnungslauf
sammelt ohnehin nur `fm.time_entries`).

### B9 — `is_auto_generated` fehlt im Firmen-GET

`route.ts` ~179–194 mappt die Page-Frontmatter ohne `is_auto_generated` →
Timer-Einträge erscheinen nie im „Automatisch"-Tab. Fix: mappen + tombstoned
rausfiltern.

### B10 — Öffentliche Buchung: Doppelbuchungs-Race + TZ-Bugs

`booking/public/route.ts`: Slot-Find via `s.start === body.start` auf frisch
generierten Slots — zwei parallele POSTs sehen beide „frei" und legen **zwei**
booking-Pages (random Slug). Fix: deterministischer Slot-Slug +
verify-after-write (überschriebener Verlierer → 409), stornierte Slots
wiederbelegbar.

Zudem (`online-booking.ts`/`public-booking.ts`): `generateSlots` interpretiert
`bookingStart`/`bookingEnd` in **Server-TZ**, serialisiert aber UTC —
09:00–17:00 „Wien" werden auf einem UTC-Server zu 10:00–18:00 (Winter) /
11:00–19:00 (Sommer). `bookedRangesForDate` matcht `slot_start.startsWith(dateIso)`
auf dem **UTC-**Datum — Buchungen zwischen 00:00–02:00 lokaler Zeit rutschen
auf den UTC-Vortag und werden nicht als belegt erkannt. `appointment`-Seiten
(`fm.date` + `fm.time` lokal) werden ebenfalls in Server-TZ geparst.
Fix: Slot-Generierung und Belegungs-Matching in `Europe/Vienna` (expliziter
`timeZone`-Param, Default unverändert für bestehende Tests).

### B11 — `ai-time-extract`: `date` kann ein voller Timestamp sein

`extractTimeFromConversation` ~459: `date: context.ended_at ?? …` — `ended_at`
ist ein ISO-Timestamp → `date = "2026-03-15T14:30:00Z"` bricht die
lexikografischen `from`/`to`-Vergleiche (`filterEntries`). Fix: auf
`YYYY-MM-DD` normalisieren (Europe/Vienna), invalide → heute.

### B12 — Timer-Eintragsdatum in UTC statt Wien

`stopCurrentActivity` ~490: `started_at.split("T")[0]` = UTC-Datum — ein Timer
um 00:30 Wiener Zeit bucht auf den Vortag. Fix: `Europe/Vienna`-Datum.

### B13 — `GET /api/absences` filtert auf dem Page-Wrapper

`route.ts` ~218–223: `a.user_email`/`a.status` liegen im `frontmatter`, nicht
auf dem Page-Objekt → beide Query-Filter liefern immer `[]`, und die
Antwort enthält Wrapper statt Records. Fix: erst `frontmatter` mappen.

### B14 — `mark-billed`/`unbill` ohne Lost-Update-Schutz

Beide Routen machen read→modify→write ohne den Retry/Verify-Guard, den
`api/time/route.ts` dafür gebaut hat → Lost-Update zwischen Rechnungslauf und
parallelem Edit. Fix: `writeTimeEntriesWithRetry` in `time-tracking.ts`
heben und dort nutzen.

### B15 — Kleinigkeiten

- `rate: fm.rate ? … : undefined` / `e.rate || defaultRate`: Rate `0`
  (Pro bono) fällt auf den Defaultsatz zurück → Überbuchung. Fix: `??`.
- `absences` POST: `start_date`/`end_date` ohne Formatcheck („garbage" wird
  gespeichert, nie aktiv); Selbst-Vertretung (`user_email === delegate_email`)
  nicht abgelehnt. Fix: ISO-Regex + Gleichheitscheck.
- `updateActivityHeartbeat` verschluckt PATCH-Fehler → Timer wirkt lebendig,
  wird aber vom Cron gestoppt. Fix: Fehler werfen (Route → 500).

## Dokumentiert, nicht gefixt (fremde Domänen / Design)

- `copilot/tools/route.ts` `executeInvoiceDraft` (~2719): markiert Einträge mit
  dem **stale** `fm.time_entries`-Snapshot per `enginePatchPage`
  (Lost-Update) und schluckt den Fehler komplett (`catch(() => {})`) →
  Rechnung existiert, Einträge bleiben unbilled → Doppelberechnung möglich.
  Gehört Domäne 4 — dort ggf. auf `/api/time/mark-billed` umstellen.
- `markEntriesBilled` re-markiert bereits `billed` Einträge und überschreibt
  `invoice_number` (durch Test `time-tracking.test.ts` ~623 gepinnt) —
  Einträge können zwischen Rechnungen „umziehen". Rücknahme via `unbill`.
- Time-Suggestions-Liste: Server liefert alle Vorschläge der Kanzlei, Filter
  nach eigenem User nur clientseitig → fremde Tätigkeitsbeschreibungen im
  Payload sichtbar.
- `DELETE /api/time` entfernt auch bereits abgerechnete Einträge
  (GoBD-Nachweis auf der Rechnung bleibt, Eintrag weg) — als Risiko notiert;
  UI-Flows hängen davon ab, deshalb kein harter Block in diesem PR.
- Timer ohne Obergrenze: solange Heartbeats laufen, sammelt ein Eintrag über
  Tage (>1440 min/Tag) — mit B4-Fix endet die Inaktivität korrekt; aktiver
  Dauerbetrieb bleibt unbegrenzt.

---

## Follow-up-Fixes (Branch `audit/zeit-rest`, auf main inkl. PR #47)

PR #47 hat B2, B3, B4, B7 und B14 gefixt. Dieser Branch schließt den Rest:

- **B1** — `api.time.*` packt den `{data:…}`-Envelope via `unwrapApiBody`
  aus; `create` liefert jetzt den Eintrag (`{id}`), `update`/`delete`/
  `unbill`/`markBilled` die unwrapped Payloads. `/dashboard/time` zeigt
  Einträge wieder. (`src/lib/api.ts`)
- **B5** — `isAbsenceActive` vergleich Kalendertage in Europe/Vienna
  (`zonedDateString`) statt Mitternacht-UTC → letzter Abwesenheitstag
  zählt wieder. (`src/lib/absence.ts`, `src/lib/datetime.ts`)
- **B6** — `PATCH /api/time`: `.passthrough()` entfernt, alle editierbaren
  Felder typisiert (minutes ≤1440, rate ≥0, ISO-Datum, activity_type-Enum).
- **B8** — Standalone `time_entry`-Pages (id = `time-entries/…`): PATCH
  aktualisiert das Frontmatter, DELETE tombstoned (Audit-Trail bleibt),
  billed-Guard gilt genauso.
- **B9** — `is_auto_generated` wird aus dem Frontmatter gemappt
  (`standaloneEntryFromPage`), Timer-Stops tragen das Flag → der
  Manuelle/Automatisch-Filter der Liste funktioniert.
- **B10** — Buchung: deterministischer Page-Slug `legal/bookings/
<yyyymmdd>-<yyyymmddhhmm>` → zwei parallele POSTs desselben Slots
  kollidieren in der Engine (409), kein check-then-write-Fenster mehr.
  Slot-Generierung und Belegungs-Abgleich rechnen in Europe/Vienna statt
  Server-TZ (`zonedWallTimeToUtc`, `zonedDateString` in
  `bookedRangesForDate`); Slot-IDs sind deterministisch.
- **B11** — `extractTimeFromConversation`: `date` wird via
  `toZonedDateString` auf den Kanzlei-Kalendertag normalisiert (war
  voller ISO-Timestamp → brach die Lexikografik der from/to-Filter).
- **B12** — `stopCurrentActivity` bucht auf den Wiener Kalendertag des
  Startzeitpunkts statt `started_at.split("T")[0]` (UTC).
- **B13** — `GET /api/absences` mappt `page.frontmatter` vor dem
  Filtern → `user_email`/`status`-Queries liefern Treffer statt `[]`.
- **B15a** — `rate ??` statt `||` in `standaloneEntryFromPage` und
  `computeBillingSummary` (Pro-bono-Rate 0 bleibt 0).
- **B15b** — `POST /api/absences`: ISO-Datumsregex, Selbstvertretung → 422,
  Engine-Write-Fehler → 502 statt Phantom-Record mit 200.
- **B15c** — `updateActivityHeartbeat` wirft bei PATCH-Fehler statt den
  Zombie-Timer weiterlaufen zu lassen.

### Tests

`datetime.test.ts` (TZ-Helper CET/CEST), `absence.test.ts` (letzter Tag
inklusive), `time-tracking.test.ts` (rate-0, Standalone-Mapping, Tombstone-
Filter, Heartbeat-Throw, Wien-Datum beim Stop), `api/time/route.test.ts`
(Schema-Rejections, Standalone-PATCH/DELETE, billed-409), `absences/
route.test.ts` (POST-Validierung, Engine-Fehler, Frontmatter-Filter),
`booking/public/route.test.ts` (Race → Engine-409 → 409, deterministischer
Slug), `online-booking.test.ts` (Wien-Wall-Time CET/CEST, deterministische
IDs). 142 Tests grün; `tsc --noEmit` (app + test), eslint, alle
verify-Scripte sauber.

- **B8+** — Standalone-Einträge sind auch abrechenbar: `updateStandaloneBilling`
  billed/unbilled pro Page, idempotent (gleiche Rechnungsnr. → Retry ok,
  fremde Rechnung → `already_billed` statt stiller Umattribuierung);
  verdrahtet in PATCH-Bulk, `/api/time/mark-billed`, `/api/time/unbill`.
- **Copilot-Invoice** — `executeInvoiceDraft` nutzt jetzt
  `listAllTimeEntries` (sieht Standalone-Timer-Zeit) und markiert billed
  retry-gesichert via `writeTimeEntriesWithRetry` +
  `updateStandaloneBilling` statt stale-Snapshot-`enginePatchPage` mit
  verschlucktem Fehler (war unter „fremde Domänen" notiert).
- **Privacy** — neue Route `GET /api/time-suggestions` filtert
  serverseitig auf `ctx.user.email`; die Dashboard-Seite lädt nicht mehr
  die firmenweite Liste (fremde Tätigkeitsbeschreibungen waren im Payload).
