# Mega-Audit: KI-Agenten, Ingest-Pipeline, Antwortkern, Arbeitsalltag

**Stand:** 19.09.2026

**Methode:**

- 6 parallele Prüfungen: Agenten-Orchestrierung, Ingest, Antwortkern und Grounding, KI-Routen samt Status des Audits vom 18.09., Arbeitsalltag, Engineering und Betrieb.
- Jeder P0-Befund wurde danach **einzeln am Code nachgeprüft** (✔).
- Befunde ohne ✔ stammen aus der Agenten-Prüfung mit Datei:Zeile-Beleg. Sie wurden aber nicht zusätzlich gegengelesen.
- „(vermutet)“ heißt: aus dem Code erschlossen, nicht zur Laufzeit beobachtet.

Vorgänger: `docs/AUDIT_KI_COPILOT_2026-09-18.md`.

---

## 1. Gesamturteil

**Ist der Code auf Industrieniveau? Lokal oft ja, als System noch nicht.**

Einzelne Bausteine sind sehr gut gebaut:

- crash-sichere Tool-Calls
- atomare Budget-Abbuchung
- Rechtsordnungsfilter hart im SQL
- Upload mit Magic-Byte-Prüfung und Hash-Streaming
- deterministische Fristberechnung im Mail-Pfad

Die Schwächen liegen an den **Nahtstellen**: Web ↔ Engine, Supervisor ↔ Kind-Agent, Pipeline ↔ Fristenbuch, Stream ↔ Verifikation. Dort sind Annahmen auseinandergelaufen. Die Folgen:

1. **Mandantentrennung:** In der Agentenschicht gibt es Werkzeuge, die kanzleiübergreifend lesen.
2. **Fristen:** KI-Fristen können ohne Freigabe ins System gelangen. Umgekehrt können bestätigte Fristen verloren gehen, ohne dass jemand es merkt.
3. **Verifikation:** Die Prüfung korrigiert die Antwort, aber der Browser zeigt weiter die ungeprüfte Fassung.
4. **Tote KI-Funktionen:** Mehrere KI-Funktionen rufen ins Leere und zeigen trotzdem ein Ergebnis an.

| Dimension                 | Note (1–5) | Kern                                                                                                 |
| ------------------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| Architektur-Idee          | 4          | Contract-first, Engine-Gateway, Spezialisten + Supervisor, Outbox – richtig gedacht                  |
| Mandantentrennung Agenten | **1**      | siehe P0-1                                                                                           |
| Fristen-Sicherheit        | **1**      | siehe P0-2, P0-3, P0-4                                                                               |
| Antwort-Verifikation      | 2          | vorhanden, aber Ergebnis erreicht den Nutzer nicht (P0-5); nur Existenz- statt Tragfähigkeitsprüfung |
| Zuverlässigkeit Pipeline  | 2          | Outbox ohne Paging/Lease, Endlos-Requeue, Doppelanalyse                                              |
| Kostenkontrolle           | 2          | Budget-Cap im Prod-Pfad (OpenRouter) nicht erreicht, mehrere KI-Routen ohne Credits                  |
| Observability             | 1–2        | keine Request-ID Web→Engine, kein Sentry in der Engine, Cost-Ledger nur In-Memory/Eval               |
| Qualitäts-Gate in CI      | 1          | Smoke-Eval `\|\| true`, echte Evals nur per PR-Label                                                 |
| Tests (Einheit)           | 4          | groß, deterministische LLM-Mocks – aber die kritischen Pfade oben sind ungetestet                    |
| Arbeitsalltag             | 2          | ~25 KI-Flächen, 4 Freigabe-Queues, kein „Heute für mich“, Chatverlauf nur im Browser                 |

---

## 2. P0: vor jedem Pilot mit echten Mandatsdaten beheben

### P0-1 Agenten-Werkzeuge lesen kanzleiübergreifend ✔

- **`legal-researcher` hat Datei-Werkzeuge.** `file_list` und `file_url` stehen in seiner Werkzeugliste (`specialist-defs.ts:52,86`), und er ist der Default-Spezialist des Supervisors.
  - `file_list` ohne Slug liest alle Dateien aller Mandanten: `SELECT … FROM files ORDER BY page_slug, filename` ohne Quellfilter (`operations.ts:3402`).
  - Die Operation ist als `scope: "admin", localOnly: true` markiert. Der Agentenpfad ruft `op.handler(opCtx, params)` aber direkt auf und prüft beides nicht (`brain-allowlist.ts:324`).
- **Weitere Werkzeuge ohne Mandantenfilter.** `get_ingest_log` läuft als `SELECT * FROM ingest_log ORDER BY created_at DESC` (`postgres-engine.ts:5707`). Laut Agent gilt dasselbe für `get_recent_salience`, `find_anomalies` und `find_contradictions`.
- **Eine leere Werkzeugliste gibt alle Werkzeuge frei.** Die Pipeline setzt `allowed_tools: []` mit dem Kommentar „no tools needed“ (`legal-pipeline.ts:3185,3292`). `subagent.ts:325` wertet eine leere Liste aber als „alle“: `data.allowed_tools.length > 0 ? filter… : registry`.
  - Die Map-Agenten lesen rohe Mandantendokumente. Ein präpariertes Dokument kann also Werkzeugaufrufe auslösen, einschließlich `put_page`.
- **Fix:**
  - Leere Liste heißt keine Werkzeuge.
  - `file_*` aus der Agenten-Allowlist entfernen.
  - Jedes Allowlist-Werkzeug über `sourceScopeOpts` scopen.
  - Im Agentenpfad `localOnly` und `scope` prüfen.
  - Test pro Werkzeug: Ein Agent von Mandant A sieht B nicht.

### P0-2 Pipeline schreibt KI-Fristen ohne Freigabe ✔

- `legal-pipeline.ts:8004-8035` legt `type: deadline`-Seiten an. Das Fälligkeitsdatum ist heute plus das vom LLM geschätzte `restzeit_tage`. **Fehlt der Wert, sind es erfundene 30 Tage.**
- Die Seiten tragen `status: critical/warning` und haben kein `review_status`.
- **Die Freigabe ist nur deklariert.** `workflow-defs.ts` kennt `approvalGates: ["deadline-validator", "limitation-scanner"]`. `isApprovalGate` wird in `legal-pipeline.ts:137` importiert, **aber nirgends aufgerufen**.
- Der Cron `deadline-alerts` behandelt diese Seiten als echte Fristen: Er sendet Alerts und feuert den Webhook `deadline.critical`.
- **Fix:** Nur als Vorschlag in die Review-Inbox schreiben, Datum über die Frist-Engine berechnen, ohne Default-Datum.

### P0-3 Bestätigte Frist kann still verloren gehen ✔

`src/components/dashboard/review-inbox-tab.tsx:218-258`:

1. Der Vorschlag wird per PATCH als `confirmed: true` markiert. Das Ergebnis wird nicht geprüft (`fetch` wirft bei 4xx/5xx nicht).
2. Danach wird die `legal_deadline` per POST angelegt, in `try { … } catch { /* best effort */ }`. **Auch hier wird `res.ok` nie geprüft.**
3. Die Funktion liefert immer `{ ok: true }`.

Folge: Die Oberfläche meldet Erfolg, der Vorschlag verschwindet aus der Inbox, und im Fristenbuch steht keine Frist.

Dazu fehlt in der Review-Karte das Belegzitat (`sourceQuote` wird nicht angezeigt). Das Datum ist vor dem Freigeben nicht editierbar, und es gibt kein Rückgängig.

- **Fix:**
  - Zuerst die Frist anlegen, dann den Vorschlag bestätigen, serverseitig in einer Transaktion.
  - Fehler sichtbar melden.
  - Zitat, Dokumentlink und Datumsfeld anzeigen.

### P0-4 LLM-Fehler wird als „Analyse abgeschlossen, keine Fristen“ gespeichert ✔

- `analyze-document.ts:214,220` gibt bei `LLM_CALL_FAILED` oder `LLM_OUTPUT_NOT_JSON` ein leeres Ergebnis zurück, mit HTTP 200.
- `api/legal/analyze/route.ts:252` speichert darauf `analysis_status: "completed"`.
- Eine übersehene Frist sieht damit genauso aus wie „keine Frist im Dokument“.
- Zusätzlich schneidet die Analyse Dokumente bei 24.000 Zeichen ab. Fristen am Ende langer Schriftsätze fehlen dann, ohne Hinweis für den Nutzer.
- **Fix:**
  - Ein leeres Ergebnis nach einem Fehler speichern als `analysis_status: "failed"` plus Retry.
  - Lange Dokumente in Abschnitten analysieren.
  - Das Abschneiden in der Oberfläche anzeigen.

### P0-5 Der Browser zeigt nie die korrigierte Antwort ✔

- `/api/think` streamt die Antwort live (`think/index.ts:854-877`). Guardrail-Regeneration und Cross-Verify ersetzen `response.answer` erst danach (`:957ff`, `:1039ff`).
- Das finale SSE-Paket enthält nur `citations, gaps, provenance, …`, **aber keinen Antworttext** (`web-api.ts:3369`).
- Folge: Die Anwältin liest den beanstandeten Erstentwurf. Zitate und Konfidenz beziehen sich aber auf eine andere, regenerierte Antwort.
- Außerdem wird selbst eine Regeneration verwendet, die weiter beanstandet ist (`index.ts:1010`: „Use regenerated answer anyway“).
- **Fix (eine der beiden Varianten):**
  - Die korrigierte Antwort als `replace`-Event senden und die Oberfläche „Antwort wurde nach Prüfung korrigiert“ anzeigen lassen.
  - Bei Rechtsfragen erst nach der Prüfung streamen.

### P0-6 KI-Funktionen, die still ins Leere laufen ✔

Die Engine-Route `/api/think` liest nur `query` oder `question` (`web-api.ts:3244`) und antwortet **immer** per SSE (`:3275`). Betroffen sind:

| Aufrufer                                                                                                  | Fehler                                             | Folge                                                                                                |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `red-team/route.ts:38`, `legal/perspektiven-room`, `legal/contradiction-probe`, `cron-utils.ts:250`       | senden `prompt` statt `query` → 400                | Red-Team speichert trotzdem eine leere Ergebnisseite; Briefing-Widersprüche immer `[]`               |
| `copilot/tools/route.ts:688,746,803,996,1046`                                                             | `res.json()` auf SSE-Stream                        | E-Mail-Entwurf, Fristextraktion, Dokumentzusammenfassung, Mandanten-Update, Meeting-Tasks werfen     |
| `copilot/tools`: Tools mit `requiresCaseContext`                                                          | `hasCaseContext` wird im Route-Kontext nie gesetzt | case_summary, time_entry, client_update, document_request_create, case_investigation: immer 403      |
| `/api/chat`, `/api/legal/schriftsatz`, `/api/legal/fristenreport` (Engine), `/api/pipeline/start\|resume` | Engine-Route existiert nicht                       | Portal-Chat, Review-Table-Fragen, Entwurfsschritt des Berufungs-Agenten, Fristenreport, Resume-Knopf |

**Fix:** Einen einzigen typisierten Engine-Client für `think` einführen (Request-Schema plus SSE-Parser). Die Handarbeits-`fetch`-Aufrufe entfallen dann. Dazu kommt ein Contract-Test, der jede Web-Route gegen die Routentabelle der Engine prüft.

### P0-7 Planer überschreibt die Rechtsordnung; Mandantentext geht an GPT-4o ✔

- **Rechtsordnung:** `query-planner.ts:174` verwendet `jurisdiction: sq.jurisdiction ?? opts.jurisdiction`, das vom LLM gewählte Recht hat also Vorrang. Eine AT-Akte kann so mit DE-Normen beantwortet werden.
  - **Fix:** `opts.jurisdiction` ist bindend. Der Planer darf das Recht nur vorschlagen, wenn die Anfrage keines gesetzt hat.
- **Datenabfluss:** `ensemble-verify.ts:81` hat `PARAPHRASE_MODEL = "openrouter:openai/gpt-4o-mini"` fest verdrahtet. Der Aufruf läuft bei jeder Rechtsantwort mit §-Zitat und schickt bis zu 4.000 Zeichen Kontext mit, einschließlich Mandantendokumenten. Das Ergebnis erreicht den Nutzer nie.
  - Das verstärkt das vertagte EU-Routing-Thema: Der Abfluss läuft an der Tier-Konfiguration vorbei.
  - **Fix:** Über die Tier-Konfiguration routen oder abschalten, bis es in der Oberfläche genutzt wird.

---

## 3. P1: Architektur und Zuverlässigkeit

### Agenten

1. **Budget-Cap greift im Prod-Pfad nicht.**
   - `reserveBudget` läuft nur im Legacy-Pfad (`subagent.ts:620`), nicht im Gateway-/OpenRouter-Pfad.
   - Der Pipeline-Kostentracker zählt nur Einträge mit `def.model`. Alle 33 Spezialisten nutzen aber `modelTier`, der Tracker bleibt also bei $0 ✔.
   - Critic- und Revise-Kinder erben kein Budget.
2. **Nutzer kann Modell und Kritiker steuern.** `/api/agents` ist `.passthrough()`, und die Engine übernimmt `supervisor_model`, `skip_critic` und `force_specialists` ungeprüft (`web-api.ts:6973-6975`) ✔. Damit ist jedes OpenRouter-Modell wählbar, auch außerhalb der EU.
3. **Parallele Kind-Agenten verlieren ihre Fertig-Meldung.** `readInbox` markiert _alle_ Nachrichten gelesen (`queue.ts:1345`) ✔. `waitForChild` in der Pipeline verwirft fremde Meldungen und wartet dann bis zu 60 Minuten. Der Supervisor löst das bereits mit `InboxCollector`. Das muss übernommen werden.
4. **Kritiker ist kosmetisch.**
   - Die Revision wird per Regex `/\b(revise|reject)\b/` ausgelöst. „no need to revise“ löst also eine Revision aus.
   - „reject“ blockiert nichts.
   - Die Revision wird nicht erneut geprüft.
   - Das Ergebnis wird ohne Grounding gespeichert.
5. **Supervisor-Zeitlimits:** kein Handler-Timeout, und die Kinder werden beim Abbruch nicht gestoppt.
6. **Schwacher Plan-Fallback:** Scheitert `parsePlanJson`, wird der Rohtext des Planers zum Prompt. Die Schrittzahl ist nicht begrenzt.
7. **Werkzeug-Eingaben:** keine zod-Validierung, und Stacktraces gehen zurück ans Modell.
8. **Unbekannter Spezialist:** Ein unbekannter Name führt stillschweigend zur vollen Werkzeugliste.
9. **Fest verdrahtetes Planer-Modell:** `claude-haiku-4-5` ist im Supervisor hart kodiert und umgeht die Tier-Konfiguration.

### Ingest

10. **Webhook-Ingest vertraut dem Header.** Der Header `x-gbrain-source-id` bestimmt den Zielmandanten (`serve-http.ts:2609`, `ingest-capture.ts:264`) ✔. `allowedSources` wird nicht geprüft. Jeder Client mit `write`-Scope kann damit in fremde Quellen schreiben, vermutlich auch dann, wenn `/ingest` von außen erreichbar ist.
11. **Zweiter Fristschreiber.** `case-writeback.ts:181` legt `legal_deadline` mit `ai_confidence: "high"` aus `key_dates` an. Diese Daten werden nicht gegen den Dokumenttext geprüft.
12. **Doppelte Analyse:** Jede Datei wird doppelt analysiert (legal-pipeline plus Outbox-`analyze`). Bei Bulk-Importen ignorieren beide Pfade `defer_pipeline`: 500 Akteneinsicht-Dateien ergeben 500 Einzelanalysen.
13. **Outbox ohne Zustandsmaschine:**
    - `limit=200` ohne Paging.
    - Tasks für gescheiterte Extraktionen warten endlos.
    - `upload-reconcile` setzt erledigte Tasks auf `attempts: 0` zurück. Das ergibt eine Endlosschleife mit bezahlten LLM-Läufen.
    - Kein Sweeper für `retrying`.
    - `embedding_status: failed` erscheint als „processing“, `analysis_status: failed` als „copilot_ready“.
14. **ClamAV fail-open:** Ohne `CLAMAV_HOST` wird nichts gescannt. Beim Scan per Pfad fehlt ein gemeinsames Volume. Das muss live geprüft werden.

### Antwortkern

15. **Grounding** prüft weiter nur, ob eine Norm existiert (`legal-grounding.ts:544`), und nur für die ersten 20 Zitate.
    - Der neue Tragfähigkeits-Check `/api/legal/support` ist ein guter Schritt. Er prüft aber nur 12 Paare und kostet keine Credits.
16. **`<pages>` nicht als Daten markiert:** Abgerufene Dokumente sind im Prompt nicht als Daten gekennzeichnet (`prompt.ts:62`), und `</page>` wird nicht escaped. Das ist ein Injection-Pfad.
    - Im Prompt stehen noch Upstream-Reste wie „gbrain's synthesis engine“ und „garry has a hunch“.
17. **Keine Fassungslogik:** `asOfDate` wird nicht übergeben, alte Fassungen werden nur ×0,85 abgewertet. Jede Seite ist auf 600 Zeichen gekürzt, spätere Absätze einer Norm fehlen also.
18. **Keine harte Enthaltung:**
    - Leeres Retrieval ergibt „(no page hits)“, und das Modell antwortet trotzdem.
    - Retrieval-Fehler werden verschluckt (`gather.ts:193`, `query-planner.ts:185`).
    - Folge: Ein DB-Ausfall erzeugt eine unbelegte Antwort ohne Warnung.
19. **Caller-Instructions** bis 40–60k Zeichen aus dem Browser werden an den System-Prompt angehängt.
20. **Kein Provider-Failover:** `chatWithFallback` greift nur bei Refusal, nicht bei Ausfall. `think` nutzt es gar nicht.

### Engineering und Betrieb

21. **Keine Korrelation Web → Engine:** `setRequestId` hat keinen Aufrufer ✔, und es gibt keinen `x-request-id`.
22. **Kein Sentry in der Engine.** `cost-ledger.ts` ist ein In-Memory-Array, das nur von Evals importiert wird ✔.
23. **Kostenerfassung pro Kanzlei** nur für die Pipeline (`recordUsage`), nicht für Chat, Think oder Copilot (vermutet).
24. **CI-Qualitätsgate:** Smoke-Eval mit `|| true` (`ci.yml:245`) ✔. Holdout- und Heavy-Tests laufen nur per Label. Der Subsumption-Benchmark testet nicht `runThink`, sondern einen Nachbau mit Keyword-Scoring.
25. **Modellwechsel aufwendig:** 265 Modell-ID-Literale in `server/src` und 64 in `src`. Ein Modellwechsel betrifft mindestens 5 Dateien.
26. **God-Files:** `legal-pipeline.ts` (12.387 Zeilen), `web-api.ts` (9.305), `operations.ts` (7.696), `gateway.ts` (4.326, 44× `any`).
27. **Uneinheitliche KI-Routen:** Sie laufen weiterhin in sechs Aufrufstilen.
    - Ohne Credits: `subsumption` (tokenmax), `copilot/tools`, `agents`, `legal/support`.
    - Die Copilot-Werkzeuge rufen dieselben Engine-Operationen auf wie die kostenpflichtigen Routen, aber gratis.

### Stand der P0 vom 18.09.

| Befund                                     | Status                                                                |
| ------------------------------------------ | --------------------------------------------------------------------- |
| P0-1 EU-Routing (bewusst vertagt)          | teilweise: DeepSeek/Grok weg – **aber nur in uncommitteter Änderung** |
| P0-2 matterScope „all“ / Chinese Walls     | **offen** (`web-api.ts:1529`)                                         |
| P0-3 Copilot-Schreibaktionen ohne Freigabe | **offen** (`copilot/tools/route.ts:2103`)                             |
| P0-4 tote Endpunkte                        | **offen**, und größer als gedacht (siehe P0-6)                        |
| P1-3 Grounding-Invariante                  | behoben (CI-Guard), Lücke: `tool-call-bubble`, Briefing, Review-Table |
| P1-8 Sanitizer                             | behoben                                                               |
| Art. 52 → Art. 50                          | teilweise (Dashboard sagt noch Art. 52)                               |

---

## 4. Uncommittete Modell-Änderung: Entscheidung nötig

`server/src/core/model-config.ts` (nicht committed) **stuft jede Stufe herunter**:

| Stufe     | committed (Entscheidung 18.09. „beste Qualität“) | Working Tree |
| --------- | ------------------------------------------------ | ------------ |
| utility   | Sonnet 5                                         | Haiku 4.5    |
| subagent  | Sonnet 5                                         | Haiku 4.5    |
| reasoning | Opus 5                                           | Sonnet 5     |
| deep      | Fable 5.1                                        | Opus 5       |

Auf `utility` laufen die **Fristextraktion** (`llm-deadline-extract.ts:156`) und die **E-Mail-Entwürfe an Mandanten**. Cross-Verify läuft jetzt auf `reasoning`. Bei einfachen Fragen prüft damit Sonnet 5 seine eigene Antwort, die Prüfung ist also nicht mehr modellübergreifend.

Weitere Punkte an der Änderung:

- `fallback: "sonnet"` löst auf `claude-sonnet-4-6` auf.
- Der Doc-Block beschreibt noch DeepSeek und Grok.

Wenn die Kosten der Grund sind: Fristextraktion auf eine eigene Stufe mit Sonnet 5 legen und den Rest herunterstufen. Und nicht ohne Eval-Lauf committen.

---

## 5. Arbeitsalltag: die 10 wirksamsten Verbesserungen

| #   | Maßnahme                                                                                                                                                                                                              | Aufwand |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | Frist-Freigabe reparieren (P0-3): Belegzitat, Dokumentlink, Datum editierbar, Rückgängig                                                                                                                              | S–M     |
| 2   | **Eine** Freigabe-Queue: Review-Inbox (heute versteckt unter Kommunikation), Approvals, Review-Queue, Zeitvorschläge, Copilot-Aktionen zusammen, mit Badge in der Sidebar                                             | M       |
| 3   | „Heute“ als einzige Startseite: Fristen plus offene Freigaben plus neue Post und Dokumente, priorisiert. Briefing, WeeklyReview, Operations-Panel und Banner gehen darin auf                                          | M       |
| 4   | Pilot-Navigation: jede Seite mit `audienceTier` taggen (untagged rutscht heute in den Core-Modus), rund 24 Seiten ausblenden (red-team, berufungs-agent, deep-analysis, graph, brain, agents, fibu, kyc, dictation …) | S       |
| 5   | „In Akte speichern“ an jeder Chat-Antwort und jedem KI-Ergebnis, als `legal_document` mit Grounding-Metadaten                                                                                                         | S–M     |
| 6   | Chatverlauf auf den Server und pro Akte (heute IndexedDB im Browser, daher kein Gerätewechsel und kein Teamzugriff)                                                                                                   | M       |
| 7   | `describeChatError` für alle KI-Seiten nutzen (heute nur im Chat), „Die Subsumio-Dienst“ korrigieren                                                                                                                  | S       |
| 8   | Lange KI-Jobs als Hintergrundjob mit Fortschritt, Abbruch und Benachrichtigung. Dokumentauswahl statt roher Slugs (Deep-Analysis verlangt heute `legal/contracts/vertrag-1` per Hand)                                 | M–L     |
| 9   | Diktat: echte Aufnahme mit Transkription oder aus der Navigation nehmen (heute ein Formular ohne Audio)                                                                                                               | S/M     |
| 10  | Zeitvorschläge editierbar machen und Akte verpflichtend (heute `case_slug: ""` möglich)                                                                                                                               | S       |

---

## 6. Was wirklich gut ist (beibehalten)

- **Crash-sichere Tool-Calls:** Aufrufe werden als pending gespeichert, dann als complete oder failed. Nicht-idempotente Aufrufe werden beim Resume verweigert.
- **Race-freie Budget-Abbuchung:** ein einzelnes atomares UPDATE mit `>=`. Sie muss nur erreicht werden.
- **Agenten-Schreibsandbox:** `put_page` schreibt nur nach `wiki/agents/<id>/`.
- **Rechtsordnung hart im SQL:** Der Filter steht im WHERE und fließt in den Cache-Key ein.
- **Cross-Verify fail-closed:** Bei einem Fehler des Prüfers gilt die Antwort als beanstandet, nicht als bestanden.
- **Sicherer Upload:** Streaming mit Hash, Magic-Byte-Prüfung, Aufräumen im `finally`, Unterscheidung zwischen permanenten und temporären Fehlern.
- **Mail-Fristpfad als Vorbild:** Er erzeugt nur Vorschläge, die Frist-Engine rechnet deterministisch, und `dropUngroundedDates` verwirft Daten ohne Beleg. **Nach diesem Muster müssen alle Fristpfade laufen.**
- **Pipeline-Billing:** Reservieren, Einreihen, bei Fehler erstatten, mit Idempotenz-Schlüssel.
- **Grounding-Invariante mit CI-Guard.**
- **Tests:** große Einheitstest-Suite mit deterministischem LLM-Transport.

---

## 7. Umsetzungsreihenfolge

**Welle 1 (sofort, ca. 1 Woche): Haftung und Leck**

- P0-1: Agenten-Werkzeuge scopen, leere Werkzeugliste gibt keine Werkzeuge, `file_*` aus der Allowlist
- P0-2, P0-3, P0-4: Fristen
  - alle KI-Fristen nur als Vorschlag
  - Freigabe atomar
  - LLM-Fehler wird `failed`
  - `approvalGates` tatsächlich durchsetzen
- P0-7: Rechtsordnung bindend, Ensemble-Paraphrase über die Tier-Konfiguration routen
- Webhook-Ingest (P1-10): `allowedSources` durchsetzen
- Die uncommittete Modelländerung entscheiden

**Welle 2 (ca. 2 Wochen): Was die Oberfläche zeigt, muss stimmen**

- P0-5: korrigierte Antwort an den Browser
- P0-6: typisierter Think-Client plus Contract-Test Web ↔ Engine; tote Funktionen anschließen oder ausblenden
- Budget-Cap im Gateway-Pfad; `.passthrough()` und Credits auf allen KI-Routen
- `<pages>` als Daten markieren; harte Enthaltung bei leerem oder fehlgeschlagenem Retrieval
- Offene P0-2 und P0-3 vom 18.09. (matterScope, serverseitige Freigabe für Copilot-Schreibaktionen)

**Welle 3 (ca. 3–4 Wochen): Betrieb auf Industrieniveau**

- Request-ID Web → Engine, Sentry in der Engine, persistenter Cost-Ledger pro Kanzlei und pro Aufruf
- Outbox als Zustandsmaschine: Paging, Lease, terminaler Zustand „blocked“, ein einziger Retry-Besitzer
- Answer-Quality-Eval auf `runThink` als blockierendes PR-Gate
- Modell-IDs nur noch in `model-config.ts` und `model-pricing.ts`
- `legal-pipeline.ts` und `web-api.ts` in Module aufteilen

**Welle 4 (parallel, Produkt): Arbeitsalltag**

- die Punkte 2–10 aus Abschnitt 5

---

## 8. Umsetzungsstand (19.09.2026, gleiche Session)

Umgesetzt und getestet. Nichts davon ist committet, weil im selben Arbeitsbaum mehrere Sessions parallel arbeiten.

### Welle 1 (Haftung und Leck): erledigt

- **P0-1 Agenten-Werkzeuge:**
  - `allowed_tools: []` bedeutet jetzt keine Werkzeuge.
  - Ein unbekannter Spezialist führt zu einem Fehler statt zur vollen Werkzeugliste.
  - `localOnly`-Operationen werden nie angeboten und beim Aufruf abgewiesen.
  - Kanzlei-Jobs verlieren `file_list`, `file_url`, `get_ingest_log`, `get_recent_salience` und `find_anomalies` (`TENANT_UNSAFE_TOOLS`).
  - `find_contradictions` ist quellgescopt.
  - Tests: `brain-allowlist.serial.test.ts`, `eval-contradictions-integrations.test.ts`.
- **P0-2 Pipeline-Fristen:** Die Verjährungs-Wiedervorlage erzeugt nur noch `suggested_deadlines` ohne erfundenes Datum (`buildWiedervorlageSuggestions`). Die KI-Fristenkalender tragen `review_status: unreviewed`. Das Fristenbuch und der ICS-Export markieren sie mit „KI · UNGEPRÜFT“.
- **P0-3 Frist-Freigabe:**
  - Ein einziger serverseitiger Pfad: `POST /api/review-inbox/deadline-decision` (`src/lib/legal/deadline-decision.ts`).
  - Die Frist wird zuerst geschrieben und geprüft, der Vorschlag wird als ganzes Array neu geschrieben, pro Akte gilt eine Sperre.
  - Alle vier Oberflächen nutzen diesen Pfad: Review-Inbox, Akte → Fristen, Strategie und MatterReviewInbox.
  - Das Datum ist vor der Freigabe editierbar.
  - Behoben: Die Review-Inbox hat die Vorschlagsliste durch ein Objekt ersetzt, und in der Fristen-Ansicht der Akte wurde nach dem Filtern der falsche Index bestätigt.
  - Tests: `deadline-decision.test.ts`.
- **P0-4 Analyse:**
  - Ein Modellfehler liefert jetzt 502 und wird als `analysis_status: failed` gespeichert.
  - Lange Dokumente werden in bis zu 8 Abschnitten analysiert.
  - `key_dates` ohne Beleg im Text werden verworfen.
  - Tests: `analyze-document.test.ts`.
- **P0-7:** Die Rechtsordnung des Aufrufers ist bindend (`bindingJurisdiction`). Ein leerer Quellen-Scope führt nicht mehr zu einer Suche über alle Quellen. Ensemble-, Paraphrase- und Rerank-Aufrufe sowie der Standard-Chat laufen über die Tier-Konfiguration statt über fest verdrahtete DeepSeek- oder GPT-Modelle.
- **Webhook-Ingest:** Das Ziel ist die Schreibquelle des Clients. Ein fremder `x-gbrain-source-id` liefert 403.
- **Qualitäts-Tiers:** Fristextraktion, Tragfähigkeits-Check und E-Mail-Entwurf laufen jetzt auf der Stufe `reasoning`.

### Welle 2 (Anzeige stimmt): erledigt

- **P0-5:** Im finalen SSE-Paket stehen `final_answer`, `answer_revised` und `revision_reason` (`think/final-answer.ts`). Web-Client, Citation-Gate und Schriftsatz übernehmen die Endfassung. Eine weiter beanstandete Neufassung und ein Retrieval-Ausfall erscheinen als sichtbarer Hinweis im Antworttext.
- **P0-6:**
  - Ein typisierter Server-Client `engineThink()` liest SSE, schickt `query` und übernimmt `final_answer`.
  - Umgestellt: Red-Team, Perspektiven-Raum und Draft-Review. Letzteres lief bisher über den Browser-Client, also ohne Mandanten-Header.
  - Widerspruchsprüfung und Briefing laufen über den neuen Engine-Endpunkt `GET /api/legal/contradictions/latest`.
  - Neu ist der Engine-Endpunkt `POST /api/legal/schriftsatz` (Think-Pipeline mit Entwurfsanweisungen).
  - `/api/pipeline/start|resume` leiten auf die abrechnende Trigger-Route um. Die Insights-Seite und Brain-Health sind repariert.
  - Die Copilot-Werkzeuge hat die Session „subsumio-web-aa“ repariert: SSE, `hasCaseContext`, Credits und serverseitiges Freigabe-Token.
- **Vertragstest Web ↔ Engine:** `src/lib/engine-contract.test.ts`. Neue tote Pfade lassen die CI scheitern. Die verbleibenden Lücken stehen in `KNOWN_MISSING`:
  - Fristenreport
  - Autonomous-Cron (`trigger-pipeline`, `workflows`)
  - Statute-Currency-Cron (`/api/operations`)
  - Pipeline-Liste
  - Skillpack-Provisionierung
- **Kosten:**
  - Der Gateway-Pfad bucht nach jedem Zug die echten Kosten ab (`gatewayTurnCostCents`).
  - Jeder Supervisor-Lauf bekommt ein Budget, Standard 300 ¢ über `SUBSUMIO_AGENT_DEFAULT_BUDGET_CENTS`.
  - Kritiker- und Revisions-Kinder erben das Budget.
  - Der Pipeline-Kostenzähler rechnet mit dem echten Modell.
  - `/api/agents` hat ein strikt validiertes Schema, das Modell kommt nur aus dem Katalog, Credits `agent`.
  - `subsumption` bucht Credits ab und läuft auf der Stufe „heavy“.
- **Kritiker:** Er gibt eine strukturierte Zeile `VERDICT:` aus. Ist sie unlesbar, gilt das als `revise`. Bei `reject` bekommt das Ergebnis ein sichtbares Sperr-Banner.
- **Pipeline-Kinder:** `child_done`-Nachrichten werden gepuffert, parallele Waiter verlieren sie nicht mehr.
- **Injection:** `</page>`, `<takes>` und ähnliche Tags im Dokumenttext werden escaped.

### Welle 3 (Betrieb): teilweise

- **Erledigt:**
  - Request-ID Web → Engine: `src/lib/request-context.ts` (AsyncLocalStorage, Logger, `x-request-id` in `ctx.headers` und in der Antwort). Die Engine gibt die ID zurück und loggt langsame oder fehlerhafte Requests mit ihr.
  - Nachbearbeitungs-Warteschlange: kein Wiederbeleben erledigter Aufgaben (Engine: Inhalts-Hash, Web: Status, `force` nur beim Nutzer-Retry), Paging bis 2.000 Einträge, Endzustand `blocked` für gescheiterte Extraktion oder Einbettung.
- **Offen, braucht eine Entscheidung:**
  - Sentry in der Engine (DSN und Abhängigkeit)
  - persistenter Kostenbeleg pro Aufruf (Migration)
  - Antwortqualitäts-Eval als blockierendes PR-Gate (LLM-Kosten pro PR)
  - Aufteilung von `web-api.ts` und `legal-pipeline.ts`. Zurzeit arbeiten mehrere Sessions in diesen Dateien, das wäre nur mit Merge-Chaos machbar.
  - Chunk-Kontext- und Synopse-Modell (DeepSeek). Beide stecken im Korpus-Cache-Hash; ein Wechsel löst eine Neuberechnung des Korpus aus.

### Welle 4 (Arbeitsalltag): nicht begonnen

Fast alle Dashboard-Seiten sind zurzeit in anderen Sessions uncommittet in Arbeit. Die Freigabe von KI-Kalenderzeilen in `deadlines/page.tsx` hat die Session „subsumio-web-e5“ übernommen. Die übrigen Punkte aus Abschnitt 5 folgen nach deren Merge.

### Nachtrag: die fünf offenen Entscheidungen (19.09.2026, abends)

1. **Commit:** Nur meine eigenen Hunks, zusammengestellt und geprüft (Typecheck, Tests) in einem separaten Worktree. Fremde, uncommittete Änderungen anderer Sessions in denselben Dateien bleiben unberührt im Arbeitsbaum.
2. **Sentry in der Engine:** `server/src/core/error-report.ts`, ohne neue Abhängigkeit (Envelope-API).
   - Aktiv, sobald `SENTRY_DSN` gesetzt ist, sonst ein No-op.
   - Gemeldet werden Abstürze, 5xx-Antworten (mit Request-ID) und fehlgeschlagene Hintergrundjobs.
   - Gesendet werden nur Fehlertyp, Meldung, Stack und IDs, keine Prompts und keine Dokumenttexte.
   - Dokumentiert in `server/deploy/hetzner/.env.example`.
3. **Antwortqualitäts-Gate:**
   - **Retrieval-Stufe** (`server/test/answer-quality-retrieval.test.ts`): ohne Modell, blockierend in jeder CI. Geprüft wird, dass die richtige AT-Norm gefunden wird, dass keine DE-Norm auftaucht und dass der Gesetzes-Scope des Query-Planers die Norm erreicht.
   - **Modell-Stufe** (`server/src/eval/answer-quality/run.ts`, Workflow `answer-quality.yml`): blockierend bei Änderungen an Think, Search und AI. Sie braucht das Secret `ANTHROPIC_API_KEY` oder `OPENROUTER_API_KEY`.
   - Lokaler Lauf: **6/6 bestanden**, einschließlich Fristberechnung (Zustellung 3.3.2026 → Berufung bis 31.3.2026) und Enthaltung außerhalb des Korpus.
4. **Chunk-Kontext- und Synopse-Modell:** Beide laufen jetzt über die Utility-Stufe, mit einer gemeinsamen Konstante für Import und Reindex.
   - Korrektur zu Abschnitt 8: Der Wechsel löst **keine** Neuberechnung des Korpus aus. Er entwertet nur Such-Cache-Einträge; neu gerechnet wird ausschließlich bei neuen Importen oder einem expliziten Reindex.
5. **Tote Hintergrundjobs:**
   - **Autonomous-Cron:** Die Analyse läuft über die abrechnende Warteschlange, der Workflow-Start als Supervisor-Lauf mit Budget. Alle Aufgaben laufen jetzt mit den Headern der **Kanzlei-Brain** statt der System-Brain.
   - **Statute-Currency-Cron:** neuer Engine-Endpunkt `POST /api/admin/statute-currency` (AT-Gesetzesquellen granular).
   - **Pipeline-Liste:** neuer Engine-Endpunkt `GET /api/legal-pipeline/list`.
   - **Skillpack:** Der Aufruf bei der Registrierung ist entfernt (lief nie).
   - **Fristenreport:** deterministisch aus dem Fristen-Datenmodell, ohne LLM und ohne Credits, mit Arbeitsprodukt-Quittung.
   - Der Vertragstest läuft jetzt ohne Ausnahmeliste.

**Beim Umsetzen neu gefunden und behoben:**

- Das **native Anthropic-Rezept kannte Sonnet 5, Opus 5 und Fable 5.1 nicht**. Ohne OpenRouter-Modus fielen die Stufen `reasoning` und `deep` still auf „kein LLM verfügbar“ zurück.
- Der **Query-Planer suchte AT-Gesetze nur in der leeren Quelle `law-at`**; die Normen liegen in `law-at-normen` usw. Gesetzes-Teilabfragen fanden in Produktion nichts. Jetzt durchsucht er alle AT-Gesetzesquellen plus EU.
- Der **Autonomous-Cron** arbeitete mit den Headern der System-Brain statt der Kanzlei.

**Braucht eine Aktion von dir:**

- **OpenRouter-Guthaben ist leer** („Insufficient credits“, geprüft mit dem Key aus der lokalen `server/.env`). Läuft Produktion mit diesem Key, ist dort jede KI-Antwort betroffen.
- GitHub-Secret `ANTHROPIC_API_KEY` (oder `OPENROUTER_API_KEY`) für das Antwortqualitäts-Gate setzen.
- `SENTRY_DSN` in der Engine-`.env` auf dem Server setzen.
