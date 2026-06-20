# Security Architecture — Paket 13A

## AI Security, Prompt Injection Defense und Upload Safety

**Stand:** 2026-06-20  
**Benchmark:** OWASP LLM Top 10, NIST AI RMF  
**Status:** Produktionsreif

---

## 1. Prompt Injection Defense

### Mechanismus
`src/lib/prompt-sanitizer.ts` — Pattern-basierte Erkennung + Neutralisierung:
- "ignore/disregard/forget previous instructions"
- Role-Hijacking ("you are now a...")
- System-Tag-Injection (`[SYSTEM]`, `<system>`, `<instruction>`)
- "override system/safety/content"
- Control-Character + Null-Byte Stripping
- Input-Length-Limit: 50.000 Zeichen

### Durchsetzung (systemweit)

| Endpunkt | Mechanismus |
|----------|------------|
| `/api/think` | `sanitizeObjectStrings(body)` |
| `/api/legal/analyze` | `sanitizeUserInput(text)` |
| `/api/legal/contract-redline` | `sanitizeObjectStrings(payload)` |
| `/api/legal/ai-deadlines` | `sanitizeUserInput(text)` |
| `/api/agent-templates/[slug]/run` | `sanitizeUserInput(input)` |
| 12+ `createEngineProxy`-Routen | `sanitizeBody: true` (Default) |

**`sanitizeObjectStrings`** — Rekursives Sanitization für beliebig verschachtelte Objekte. Automatisch aktiv in `createEngineProxy` via `sanitizeBody ?? true`.

**Abgedeckte createEngineProxy-Routen:** memo, contract-draft, document-review, risk-analysis, summarize, translate, anonymize, precedent-search, conflict-check, case-scanner, due-diligence, tabular-review, obligation-extract.

---

## 2. Upload Safety

### Pipeline (`src/lib/upload-pipeline.ts`)

**`scanUpload(file)` — zentraler Pipeline-Schritt für alle Upload-Pfade:**

1. **validateUpload** — MIME-Allowlist, Size-Tiers, File-Presence
2. **sanitizeFilename** — Path-Traversal-Schutz, Special-Char-Stripping, 200-Zeichen-Limit
3. **scanFile** — Magic-Byte-Validation, Executable-Detection, ClamAV (optional)

### MIME-Type Allowlist

- **Dokumente:** PDF, Markdown, Plain Text, HTML, MS Word, DOCX, ODT, RTF
- **Tabellen:** XLSX, ODS
- **Bilder:** PNG, JPEG, TIFF

### Size-Tiers

- Standard-Dokumente: 50 MB
- Bilder: 25 MB

### Virus Scan (Multi-Layer)

1. **Magic-Byte-Validation** — Dateiinhalt muss deklariertem MIME-Type entsprechen
2. **Executable-Detection** — PE/EXE, ELF, Mach-O, Java Class werden blockiert
3. **ClamAV** — Optional bei gesetzter `CLAMAV_HOST` Environment-Variable

---

## 3. HTML Sanitization

`src/lib/sanitize-html.ts` — Zero-Dependency HTML-Stripper:
- Entfernt: `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, `<applet>`, `<meta>`, `<link>`, `<base>`, `<form>`, `<input>`, `<button>`
- Strippt Event-Handler (`on*`-Attribute)
- Blockiert `javascript:`, `data:text/html`, `vbscript:`, `file:` URLs
- Einsatz: Mailbox-Client für E-Mail-HTML
- AI-Output ist JSON/SSE — React-Renderer ist XSS-sicher

---

## 4. Encryption at Rest

`src/lib/encryption.ts` — AES-256-GCM via Web Crypto API:
- Format: `sbenc:<base64url(IV + ciphertext)>`
- Production: `SUBSUMIO_ENCRYPTION_KEY` muss gesetzt sein (Fail-Fast)
- Verschlüsselte Felder: TOTP Secrets, DocuSign Tokens, API Keys
- 18 Regressionstests: Roundtrip, Null-Handling, Legacy, Corruption, Unicode, IV-Randomness, Key-Isolation, Production-Guard

---

## 5. Rate Limiting

| Tier | Limit | Endpunkte |
|------|-------|-----------|
| standard | 120/min | conflict-check, non-AI routes |
| search | 60/min | precedent-search, judgements-search |
| heavy | 30/min | think, memo, contract-draft, contract-redline, document-review, risk-analysis, summarize, translate, anonymize, ai-deadlines, upload, agents |

Key = `api:{tier}:{userId}` (per-User). Durchsetzung in `createHandler` via `requireEngineContext`.

---

## 6. Security Headers

`next.config.ts` — alle Responses:

| Header | Value |
|--------|-------|
| X-Frame-Options | DENY |
| Strict-Transport-Security | max-age=31536000; includeSubDomains; preload |
| X-Content-Type-Options | nosniff |
| Referrer-Policy | strict-origin-when-cross-origin |
| Permissions-Policy | camera=(self), microphone=(), geolocation=(), interest-cohort=() |
| Content-Security-Policy | default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; upgrade-insecure-requests |

---

## 7. CSRF Protection

`src/middleware.ts` — Double-Submit-Cookie-Pattern:
- Cookie: `csrf_token` (non-httpOnly, SameSite=Lax, Secure in Production)
- Header: `x-csrf-token` muss mit Cookie übereinstimmen
- Ausnahmen: Login/Signup/Reset, Cron (Secret-Auth), Webhooks (Signature-Verification)

---

## 8. Idempotency

`src/lib/idempotency.ts` — Postgres-backed mit In-Memory-Fallback:
- Verwendung: WhatsApp Dedup, DocuSign Events, Stripe Events, Generic Webhooks
- TTL: 30 Minuten (configurable)
- Schema: Auto-CREATE TABLE IF NOT EXISTS

---

## 9. Audit Trail

`src/lib/audit-labels.ts` — Strukturiertes Audit-Logging:
- Jede API-Aktion wird mit Action-Label, Entity-Type, Entity-ID und Details geloggt
- Fire-and-forget (blockiert nie die Response)
- Labels auf Deutsch für Compliance-Reports

---

## Compliance-Mapping

| Framework | Abdeckung |
|-----------|-----------|
| OWASP LLM Top 10 (LLM01: Prompt Injection) | §1 — Prompt Sanitizer systemweit |
| OWASP LLM Top 10 (LLM02: Insecure Output) | §3 — HTML Sanitization |
| OWASP Top 10 (A04: Insecure Design) | §2 — Upload Pipeline |
| OWASP Top 10 (A02: Crypto Failures) | §4 — AES-256-GCM at Rest |
| OWASP Top 10 (A05: Security Misconfiguration) | §6 — Security Headers |
| OWASP Top 10 (A07: Auth Failures) | §7 — CSRF + §5 — Rate Limiting |
| NIST AI RMF (Detect) | §9 — Audit Trail |
| NIST AI RMF (Govern) | §5 — Rate Limiting + Quota |
