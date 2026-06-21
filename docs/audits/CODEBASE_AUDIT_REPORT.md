# Subsumio Codebase Audit Report

**Datum:** 2026-06-20  
**Auditor:** Principal Engineer / Product Architect / UX Lead / QA Lead  
**Scope:** `src/lib/`, `src/app/api/`, `src/components/`, `src/middleware.ts`, `server/src/`  
**Stack:** Next.js 15.5, React 19, Tailwind CSS 4, Radix UI, Zod, Zustand, TanStack Query, Vitest, Playwright

---

## Executive Summary

Die Subsumio-Plattform zeigt ein **reifes Architektur-Fundament** mit zentralisierten Guard-Pipelines, strukturiertem Multi-Tenant-Isolation-Konzept und durchdachten Domain-Modellen. Es gibt jedoch **mehrere Critical- und High-Severity-Funde**, die vor einem Production-Launch behoben werden müssen.

**Severity-Verteilung:**

| Severity      | Count |
| ------------- | ----- |
| 🔴 Critical   | 3     |
| 🟠 High       | 6     |
| 🟡 Medium     | 8     |
| 🟢 Suggestion | 5     |

---

## 🔴 Critical Findings

### C-1: WhatsApp Flow Endpoint — Keine Authentifizierung, Unrestricted Brain Access

**Datei:** `src/app/api/whatsapp/flow-endpoint/route.ts:226-308`  
**Problem:** Der `POST`-Handler ist ein raw `export async function POST` — kein `createHandler`, kein `createWebhookHandler`, keine Signature-Verification. Die `brainId` wird aus dem `flow_token` extrahiert (`tokenParts[1]`), das vom Client kommt. Ein Angreifer kann eine beliebige `brainId` im `flow_token` setzen und so **Brain-Pages in beliebigen Tenant-Brains erstellen** (case creation + appointment booking).

```typescript
// Line 245-246: brainId aus user-controllable flow_token
const tokenParts = request.flow_token?.split(":") ?? [];
const brainId = process.env.WHATSAPP_DEFAULT_BRAIN_ID || tokenParts[1] || "";
```

**Impact:** Cross-Tenant Data Injection — ein Angreifer kann Akten oder Termine in fremdeBrains schreiben.  
**Fix:**

1. `WHATSAPP_DEFAULT_BRAIN_ID` als einzige Quelle für `brainId` verwenden — `tokenParts[1]` darf nicht überschreibbar sein.
2. Wenn dynamische brainIds nötig: Signed `flow_token` mit HMAC verifizieren.
3. Rate-Limiting auf IP-Basis hinzufügen.

---

### C-2: WhatsApp Flow Endpoint — Keine Input-Validation auf Brain-Writes

**Datei:** `src/app/api/whatsapp/flow-endpoint/route.ts:79-112`  
**Problem:** Client-Namen, Gegner-Namen, Beschreibungen und Case-Nummern werden direkt aus dem decrypteten WhatsApp-Payload in Brain-Page-Slugs und -Titel interpoliert, ohne Sanitisierung oder Längenbegrenzung. Die `caseSlug` wird aus `caseNumber` konstruiert, das von einem `Math.random()`-Fallback stammt — es gibt keine Kollisionserkennung.

```typescript
// Line 81: caseNumber kann von Client kommen
const caseNumber = String(
  data.case_number || `2026-${String(Math.floor(Math.random() * 999) + 1).padStart(3, "0")}`
);
const caseSlug = `legal/cases/${caseNumber}`;
```

**Impact:** Path-Traversal via `case_number` (z.B. `../../admin/config`), XSS via `client_name` in Brain-Page-Titel, Slug-Kollisionen.  
**Fix:**

1. `caseNumber` mit Whitelist-Regex validieren: `/^[\w-]+$/`.
2. Alle String-Felder durch `sanitizeUserInput()` aus `prompt-sanitizer.ts` leiten.
3. Slug-Kollision-Check via Brain-API vor dem Schreiben.

---

### C-3: `sanitizeHtml` — Regex-basierter HTML-Sanitizer ist unsicher

**Datei:** `src/lib/sanitize-html.ts:22-57`  
**Problem:** Die Funktion verwendet regex-basiertes HTML-Stripping für Email-HTML in `MailboxClient.tsx:379`. Regex-basierte HTML-Sanitizer sind **fundamental unsicher** — sie können durch verschachtelte Tags, Encoding-Tricks und edge cases umgangen werden. Die Funktion erlaubt `style`-Attribute, was CSS-Injection ermöglicht.

```typescript
// Line 15: style ist erlaubt — CSS-Injection möglich
const ALLOWED_ATTRS = new Set([
  "href", "src", "alt", "title", "width", "height", "style",
  ...
]);
```

**Impact:** XSS in der Admin-Mailbox-Ansicht wenn eine bösartige Email gerendert wird.  
**Fix:** DOMPurify (oder `isomorphic-dompurify` für SSR) verwenden. Die Abhängigkeit ist bereits im Ökosystem etabliert und die Regex-Lösung hat einen bekannten Kommentar "For production use, consider DOMPurify".

---

## 🟠 High Findings

### H-1: CORS Policy — `Access-Control-Allow-Origin: *` mit Credentials

**Datei:** `src/lib/api-handler.ts:114-119`  
**Problem:** Die CORS-Header setzen `Access-Control-Allow-Origin: *` für alle Routes mit `cors: true`. Wenn eine Route auch Session-Cookies verwendet, ist `*` mit `credentials: 'include'` inkompatibel — Browser blockieren die Anfrage. Wenn jedoch `credentials` nicht explizit gesetzt ist, kann jede Website Cross-Origin-Anfragen stellen.

**Fix:** Origin-Whitelist statt `*`, oder `Access-Control-Allow-Origin` dynamisch aus `Origin`-Header setzen mit Validation gegen eine Allowlist.

---

### H-2: `handleCopy` in `ChatMessageBubble` — Kein Error-Handling für Clipboard API

**Datei:** `src/components/chat/chat-message.tsx:65-69`  
**Problem:** `navigator.clipboard.writeText(message.content)` wird ohne `try/catch` oder `.catch()` aufgerufen. In nicht-sicheren Kontexten (HTTP) oder bei fehlenden Permissions wirft die Promise. Auch im Citation-Slug-Copy (Line 168) wird `navigator.clipboard.writeText` ohne Error-Handling aufgerufen.

**Fix:** `try/catch` um Clipboard-Aufrufe oder `.catch(() => {})`.

---

### H-3: Chat Panel — `handleSend` Dependency Array enthält `isStreaming` aber keine Stale-Closure-Prevention

**Datei:** `src/components/chat/chat-panel.tsx:482-692`  
**Problem:** `handleSend` hat `isStreaming` in den Dependencies (Line 690), aber die Guard `if (isStreaming) return` (Line 485) nutzt den Wert zum Zeitpunkt der Callback-Erstellung. Bei schnellem Doppel-Submit kann zwischen dem letzten Render und der Ausführung ein Stream starten, ohne dass `isStreaming` aktualisiert ist. Der `abortControllerRef` wird überschrieben, was zu einem orphaned Stream führt.

**Fix:** Ref-basierte Guard: `const isStreamingRef = useRef(false); if (isStreamingRef.current) return; isStreamingRef.current = true;` und im `finally`-Block auf `false` setzen.

---

### H-4: `handleDeleteSession` — Keine Sanitisierung beim Laden der Nachrichten

**Datei:** `src/components/chat/chat-panel.tsx:1003-1031`  
**Problem:** Beim Löschen einer Session und Laden der Ersatzsession (Line 1021-1022) werden die Nachrichten **ohne** die Sanitisierung geladen, die in `handleSelectSession` (Line 962-996) angewendet wird. Wenn die geladenen Nachrichten `isStreaming: true` oder `pending` Tool-Calls haben, bleiben diese im stale State.

**Fix:** Sanitisierungs-Logik in eine shared `sanitizeLoadedMessages()` Funktion extrahieren und in beiden Pfaden verwenden.

---

### H-5: Stripe Webhook — `store.list()` für Customer-Lookup skaliert nicht

**Datei:** `src/app/api/billing/webhook/route.ts:120-122, 130-132, 141-143`  
**Problem:** Bei `customer.subscription.updated`, `customer.subscription.deleted` und `invoice.payment_failed` wird `store.list()` aufgerufen und dann `users.find(u => u.stripeCustomerId === customerId)` gemacht. Bei wachsender Nutzerzahl wird dies O(n) pro Webhook-Event.

**Fix:** `store.getByStripeCustomerId(customerId)` Methode im Store implementieren (mit Index auf `stripeCustomerId`).

---

### H-6: `renderMarkdown` — Link-Label nicht HTML-escaped nach Regex

**Datei:** `src/lib/markdown.ts:35-39`  
**Problem:** In der Link-Replacement-Funktion wird `label` direkt in den `<a>`-Tag eingefügt. Obwohl der Text am Anfang escaped wird (`&`, `<`, `>`), kann der Label-Text nach der Regex-Verarbeitung wieder unescaped HTML enthalten, wenn die Escaping-Reihenfolge mit anderen Regexen interagiert.

\*\*Beispiel: `[<script>](https://evil.com)` — der `<script>` wird zu `&lt;script&gt;` escaped, aber die Link-Regex feuert danach und baut `<a href="...">&lt;script&gt;</a>` — das ist sicher. Aber: `[click](https://evil.com" onmouseover="alert(1))` — das `href` wird nicht auf Quotes geprüft.

**Fix:** `href` in der Link-Regex auf Quotes escapen: `href="${href.replace(/"/g, '&quot;')}"`.

---

## 🟡 Medium Findings

### M-1: `holidayCache` in `legal-deadlines.ts` — Unbounded Memory Growth

**Datei:** `src/lib/legal-deadlines.ts:60`  
**Problem:** `holidayCache` ist ein module-level `Map<string, Map<string, string>>` ohne Size-Limit oder TTL. Bei Aufrufen mit vielen verschiedenen Jahr/State-Kombinationen wächst der Cache unbegrenzt.

**Fix:** LRU-Cache mit max 500 Einträgen oder TTL-basierten Cache verwenden.

---

### M-2: `chat-panel.tsx` — `handleRegenerate` dupliziert `handleSend`-Logik (~150 Zeilen)

**Datei:** `src/components/chat/chat-panel.tsx:1034-1213`  
**Problem:** Die Streaming-Logik, Tool-Marker-Buffering, Error-Handling und Tool-Detection in `handleRegenerate` ist eine nahezu identische Kopie von `handleSend`. Code-Duplikation führt zu Divergenz-Bugs.

**Fix:** Gemeinsame `streamAssistantResponse(userMsg, assistantMsg)` Funktion extrahieren, die von beiden Pfaden aufgerufen wird.

---

### M-3: WhatsApp Webhook — Error-Message an Client enthält internen Fehler

**Datei:** `src/app/api/whatsapp/webhook/route.ts:114-117`  
**Problem:** Bei einem Processing-Fehler wird die rohe Fehlermeldung an den WhatsApp-Nutzer gesendet: `"Kanzlei OS konnte die Nachricht nicht verarbeiten: ${error}"`. Wenn der Fehler Stack-Traces oder interne Pfade enthält, werden diese an den Endnutzer geleakt.

**Fix:** Generische Fehlermeldung an den Nutzer, internen Fehler nur loggen.

---

### M-4: `encryption.ts` — Dev-Mode Fallback-Key ist hartkodiert

**Datei:** `src/lib/encryption.ts` (laut Session-Summary)  
**Problem:** In Development wird ein Fallback-Verschlüsselungskey verwendet und Daten mit `sbplain:`-Prefix gespeichert. Wenn `NODE_ENV` nicht korrekt auf `production` gesetzt ist, werden sensitive Daten unverschlüsselt gespeichert.

**Fix:** Startup-Check: Wenn `NODE_ENV=production` und `SUBSUMIO_ENCRYPTION_KEY` nicht gesetzt → Process exit mit klarer Fehlermeldung.

---

### M-5: `email/dev-catch/route.ts` — Keine Auth, File-System Write

**Datei:** `src/app/api/email/dev-catch/route.ts:46-93`  
**Problem:** Der Endpoint hat keine Authentifizierung. In Production wird nur durch `NODE_ENV === "production"` und `SUBSUMIO_ALLOW_DEV_CATCH !== "true"` geschützt. Wenn beide Checks fehlschlagen (z.B. durch Fehlkonfiguration), kann jeder E-Mails in das Filesystem schreiben.

**Fix:** Zusätzlicher Secret-Token-Check via Environment-Variable, auch in Dev.

---

### M-6: `chat-panel.tsx` — `handleShare` generiert base64-URL ohne Size-Limit

**Datei:** `src/components/chat/chat-panel.tsx:1302-1321`  
**Problem:** `btoa(encodeURIComponent(JSON.stringify(shareData)))` kann bei langen Chat-Verläufen extrem lange URLs erzeugen, die Browser- oder Server-Limits überschreiten.

**Fix:** Size-Check vor Encoding, Warnung bei >2000 Zeichen, oder serverseitige Speicherung mit Short-Link.

---

### M-7: `tool-call-bubble.tsx` — `key={idx}` als React Key für Items

**Datei:** `src/components/chat/tool-call-bubble.tsx:172`  
**Problem:** `display.items!.map((item, idx) => ...)` verwendet Array-Index als Key. Bei Reordering oder dynamischen Listen kann dies zu Rendering-Bugs führen.

**Fix:** Stabilen Key aus `item.label + item.value` oder `item.href` konstruieren.

---

### M-8: `prompt-sanitizer.ts` — Injection-Patterns sind nicht erschöpfend

**Datei:** `src/lib/prompt-sanitizer.ts:10-20`  
**Problem:** Die Regex-Patterns erfassen nur englische Injection-Versuche. Deutsche Varianten wie "Ignoriere alle vorherigen Anweisungen" oder "Vergiss alles davor" werden nicht erfasst. Auch Unicode-Obfuscation (z.B. homoglyphs) wird nicht behandelt.

**Fix:** Deutschsprachige Patterns hinzufügen. Als Defense-in-Depth das LLM-Model selbst mit System-Prompt-Anweisungen absichern (was bereits teilweise geschieht).

---

## 🟢 Suggestions

### S-1: `retry.ts` — `fetchWithRetry` konsumiert Response-Body bei Error

`res.text().catch(() => "")` in Line 92 konsumiert den Body. Bei Retry-Versuchen ist der Body nicht mehr verfügbar. Für non-retryable Errors ist das OK, aber das Logging könnte den Body für Debugging nützlich haben.

### S-2: `workflow.ts` — `buildWorkflowSlug` verwendet nur Sekunden-Präzision

`stamp = date.toISOString().replace(/[:.]/g, "-").slice(0, 19)` — bei schnellen Doppel-Submits können Slug-Kollisionen auftreten. `randomUUID()` als Suffix hinzufügen.

### S-3: `chat-message.tsx` — `parseGapType` macht Fuzzy-String-Matching

`lower.includes(key)` kann false positives liefern. Eine exaktere Matching-Strategie oder ein Lookup-Table wäre robuster.

### S-4: `engine.ts` — `engineContext()` macht 3 DB-Calls pro Request

`getStore().getById()`, `getOrgStore().getById()`, `getStore().getById()` für den Owner. Bei hoher Last könnte ein Cache (mit kurzer TTL) die DB-Last reduzieren.

### S-5: `api-handler.ts` — Audit-Logging nur bei `response.ok`

Audit-Logs werden nur bei erfolgreichen Responses geschrieben (Line 329). Fehlgeschlagene Authorisierungs-Versuche oder Validation-Errors werden nicht auditiert. Für Compliance (GOBD, DSGVO) sollten auch fehlgeschlagene Versuche geloggt werden.

---

## Architecture Observations

### Positiv

- **Zentrale Guard-Pipeline** (`createHandler`) mit Auth, RBAC, CSRF, Rate-Limit, Quota, Validation — sehr gut durchdacht.
- **Tenant Guard** mit 6-Level-Isolation (Org, Brain, Source, Matter, User, Ethical Wall).
- **CSRF Double-Submit Cookie** Pattern korrekt implementiert mit `timingSafeCompare`.
- **Prompt Sanitizer** mit Delimiter-Wrapping und Injection-Pattern-Stripping.
- **Citation Gate** mit Statuten-Extraktion und Corpus-Grounding.
- **Idempotency** im Stripe Webhook mit DB-basiertem Event-Tracking.
- **Error Classes** mit stabilen Codes und HTTP Status Codes.
- **Retry Utility** mit Exponential Backoff + Jitter und RetryableError/PermanentError-Tags.
- **Signed Identity Tokens** (HMAC-SHA256) für WhatsApp Matter-Scope.
- **Account Lockout** nach 5 fehlgeschlagenen Login-Versuchen.
- **2FA Support** mit TOTP und Challenge-Token-Flow.

### Verbesserungspotenzial

- **Raw Handler Adoption:** 21 API-Routes verwenden noch raw `export async function POST/GET` statt `createHandler`. Die `handler-adoption.test.ts` deckt nur 6 Routes ab. SCIM-Routes verwenden `requireScimAuth` (eigene Auth), was OK ist, aber Auth-Routes (login, signup, etc.) haben individuelle Rate-Limiting-Logik, die schwerer zu warten ist.
- **`as any` Usage:** 23 Vorkommen in 3 Lib-Files (hauptsächlich in `api-handler.test.ts` — OK für Tests, aber `hooks/use-dashboard-form.ts` und `legal-types.ts` sollten type-safe gemacht werden).
- **Code-Duplikation** in `handleSend` vs `handleRegenerate` im Chat Panel.

---

## Priorisierte Action-List

| #   | Severity | Finding                                             | Aufwand | Priority             |
| --- | -------- | --------------------------------------------------- | ------- | -------------------- |
| 1   | 🔴 C-1   | WhatsApp Flow: Auth + Brain-ID-Lockdown             | 2h      | **P0 — Blocker**     |
| 2   | 🔴 C-2   | WhatsApp Flow: Input-Validation + Slug-Sanitization | 2h      | **P0 — Blocker**     |
| 3   | 🔴 C-3   | sanitizeHtml → DOMPurify Migration                  | 3h      | **P0 — Blocker**     |
| 4   | 🟠 H-6   | renderMarkdown: href-Quote-Escaping                 | 30min   | **P1 — Pre-Launch**  |
| 5   | 🟠 H-1   | CORS: Origin-Whitelist statt `*`                    | 1h      | **P1 — Pre-Launch**  |
| 6   | 🟠 H-3   | Chat: isStreaming Ref-Guard                         | 30min   | **P1 — Pre-Launch**  |
| 7   | 🟠 H-4   | Chat: sanitizeLoadedMessages DRY                    | 1h      | **P1 — Pre-Launch**  |
| 8   | 🟠 H-2   | Clipboard: try/catch                                | 30min   | **P1 — Pre-Launch**  |
| 9   | 🟠 H-5   | Stripe: getByStripeCustomerId                       | 2h      | **P1 — Pre-Launch**  |
| 10  | 🟡 M-5   | dev-catch: Secret-Token                             | 30min   | **P2 — Hardening**   |
| 11  | 🟡 M-3   | WhatsApp Webhook: Generic Error Message             | 15min   | **P2 — Hardening**   |
| 12  | 🟡 M-4   | Encryption: Startup-Check                           | 30min   | **P2 — Hardening**   |
| 13  | 🟡 M-1   | holidayCache: LRU                                   | 1h      | **P2 — Hardening**   |
| 14  | 🟡 M-2   | Chat: streamAssistantResponse DRY                   | 3h      | **P2 — Hardening**   |
| 15  | 🟡 M-6   | Chat: Share-URL Size-Check                          | 30min   | **P2 — Hardening**   |
| 16  | 🟡 M-7   | tool-call-bubble: Stable Keys                       | 15min   | **P2 — Hardening**   |
| 17  | 🟡 M-8   | prompt-sanitizer: German patterns                   | 1h      | **P2 — Hardening**   |
| 18  | 🟢 S-5   | Audit: Log failed attempts                          | 2h      | **P3 — Compliance**  |
| 19  | 🟢 S-2   | workflow.ts: UUID suffix in slug                    | 15min   | **P3 — Polish**      |
| 20  | 🟢 S-4   | engine.ts: Context cache                            | 3h      | **P3 — Performance** |
| 21  | 🟢 S-1   | retry.ts: Body consumption note                     | 15min   | **P3 — Polish**      |
| 22  | 🟢 S-3   | chat-message: parseGapType exactness                | 1h      | **P3 — Polish**      |

---

## Regression Test Recommendations

1. **C-1/C-2:** E2E-Test: WhatsApp Flow mit manipuliertem `flow_token` → muss 403 zurückgeben. Slug-Injection-Versuch → muss 400 zurückgeben.
2. **C-3:** Unit-Test: `sanitizeHtml` mit verschachtelten Tags, Encoding-Tricks und `style`-Attribut → darf kein `<script>` oder `onload` durchlassen.
3. **H-6:** Unit-Test: `renderMarkdown('[click](https://evil.com" onmouseover="alert(1))')` → darf kein `onmouseover` enthalten.
4. **H-3:** E2E-Test: Doppel-Submit im Chat → nur ein Stream darf aktiv sein.
5. **H-4:** Unit-Test: `handleDeleteSession` → geladene Nachrichten dürfen kein `isStreaming: true` haben.

---

## Status

**Audit abgeschlossen.** Die 3 Critical-Funde (C-1, C-2, C-3) sind **Launch-Blocker** und müssen vor dem Production-Deployment behoben werden. Die High-Funde sollten vor Launch adressiert werden, sind aber nicht alleine blockierend (mit Ausnahme von H-6 bei externem Markdown-Input).

**Empfehlung:** P0-Funde sofort beheben, dann P1 in einem Hardening-Sprint, P2/P3 im nächsten Iterationszyklus.
