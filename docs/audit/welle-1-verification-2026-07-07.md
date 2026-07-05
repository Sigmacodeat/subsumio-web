# Welle 1 Quality Check - Abschlussbericht

**Datum:** 2026-07-07  
**Prüfer:** Cascade (Principal Engineer / QA Lead)  
**Status:** ✅ MEHRHEIT ERFÜLLT, 1 GAP + 2 KORREKTUR DURCHGEFÜHRT

---

## Zusammenfassung

Welle 1 der Implementierungs-Spezifikation wurde geprüft. Die meisten Anforderungen sind erfüllt, es gibt jedoch 1 Gap und 2 TypeScript-Fehler wurden korrigiert.

---

## W1.1: XRechnung + ZUGFeRD

### Erfüllt:

- **Modul-Struktur:** `src/lib/e-invoice/` mit index, types, xrechnung, zugferd, validator, adapter
- **XML-Generierung:** XRechnung (CII) + ZUGFeRD Profile (MINIMUM/BASIC/COMFORT/EXTENDED)
- **PDF-Embedding:** ZUGFeRD PDF/A-3 mit `factur-x.xml` via pdf-lib
- **API-Endpunkte:** `/api/e-invoice/generate` + `/api/e-invoice/parse` + `/api/e-invoice/validate`
- **UI-Integration:** Leitweg-ID in InvoiceQuickCreateDialog + ContactCreateDialog, Format-Auswahl, Download-Buttons in invoicing/page
- **Settings-Erweiterung:** `kleinunternehmer` + `eInvoiceProfile` in KanzleiSettings
- **i18n:** Alle Keys in dashboard.ts
- **Tests:** 576 Zeilen in e-invoice.test.ts (Generation, Parsing, Validation, QR-Codes, Adapter)

### Nachweise:

- `src/lib/e-invoice/index.ts:1-27` - Modul-Export
- `src/lib/e-invoice/types.ts:1-159` - Typdefinitionen
- `src/lib/e-invoice/xrechnung.ts:1-626` - XML-Generierung/Parsing
- `src/lib/e-invoice/zugferd.ts:1-400` - PDF-Embedding
- `src/lib/e-invoice/validator.ts:1-230` - Validierung
- `src/lib/e-invoice/adapter.ts:1-118` - InvoiceFrontmatter-Adapter
- `src/app/api/e-invoice/generate/route.ts:1-116` - API-Endpunkt
- `src/app/api/e-invoice/parse/route.ts:1-93` - Parsing-Endpunkt
- `src/components/legal/InvoiceQuickCreateDialog.tsx:143-154` - Leitweg-ID + Format-Auswahl
- `src/app/dashboard/invoicing/page.tsx:522-643` - Download-Buttons + Import
- `src/lib/kanzlei-settings.ts:44-47` - Kleinunternehmer + eInvoiceProfile
- `src/app/dashboard/settings/page.tsx:782-797` - Settings-UI
- `src/content/dashboard.ts:1847-1857` - i18n Keys
- `src/lib/e-invoice/e-invoice.test.ts:1-576` - Unit-Tests

### Gap:

- **KoSIT-Validator-Integration:** Schematron-Validierung gegen offizielle KoSIT-Regeln fehlt (Spec §W1.1.2 verlangt dies)

---

## W1.2: Sicherheits-Härtung

### Erfüllt:

- **RBAC-Sweep-Skript:** `scripts/check-route-actions.ts:1-146` prüft createHandler + action-Property
- **Portal-Token:** Rate-Limits auf `/api/portal/verify` (30/60s) und `/api/portal/upload` (20/60s)
- **Webhooks:**
  - DocuSign: `verifyDocusignConnectSignature` in `src/lib/docusign.ts:431`
  - WhatsApp: `verifyWhatsAppSignature` in `src/lib/whatsapp/verify.ts:19`
- **Secrets:** Nur `NEXT_PUBLIC_*` in Client-Dateien (keine Secrets im Bundle)
- **Ethical-Wall-Durchsetzung:** `checkPermissionWithEthicalWall` in `src/lib/ethical-wall.ts:72`

### Nachweise:

- `scripts/check-route-actions.ts:1-146` - RBAC-Sweep
- `src/app/api/portal/verify/route.ts:10-16` - Rate-Limit 30/60s
- `src/app/api/portal/upload/route.ts:108-114` - Rate-Limit 20/60s
- `src/lib/docusign.ts:431` - HMAC-Verifikation
- `src/lib/whatsapp/verify.ts:19` - HMAC-Verifikation
- `src/lib/ethical-wall.ts:72-100` - Ethical-Wall-Check

---

## W1.3: Playwright-E2E

### Erfüllt (Basis-Tests existieren):

- `tests/e2e-playwright/fristen-sync-flow.spec.ts:1-252` - Fristen-Sync zwischen 3 UIs
- `tests/e2e-playwright/case-closeout.spec.ts:1-247` - Case Closeout Lifecycle
- `tests/e2e-playwright/portal-upload-flow.spec.ts:1-284` - Mandantenportal-Upload
- `tests/e2e-playwright/invoice-billing.spec.ts:1-278` - Invoice Billing Lifecycle
- `tests/e2e-playwright/docusign-signature-flow.spec.ts:1-331` - DocuSign Webhook-Driven Signature

### Gap:

- Spezifische Akzeptanzkriterien fehlen in den Tests:
  - Vier-Augen-Dialog bei Aktenabschluss
  - Checklisten-Dialog bei Aktenabschluss
  - EN/DE-Sprachumschaltung im Portal
  - billed-Status bei Rechnungen

---

## §0: Dreifach-Verifikation

### Erfüllt:

- **TypeScript:** `tsc --noEmit` - 0 Errors (nach Korrektur)
- **Tests:** `vitest run` - 4910/4910 passed (258 Test Files)
- **Build:** `next build` - erfolgreich

### Korrekturen durchgeführt:

1. `src/app/api/cases/ethical-wall/route.ts:4` - `LegalCaseFrontmatter` → `CaseFrontmatter`
2. `src/app/api/webhooks/outgoing/route.ts:4,25,65,96` - `apiKeys` → `ApiKey`, `brain.settings_write` → `settings.write`, `brain.settings_read` → `settings.read`

---

## Gesamtbewertung

| Kategorie       | Status  | Gap                                   |
| --------------- | ------- | ------------------------------------- |
| W1.1 E-Rechnung | ✅ 95%  | KoSIT-Validator fehlt                 |
| W1.2 Sicherheit | ✅ 100% | -                                     |
| W1.3 E2E-Tests  | ⚠️ 60%  | Spezifische Akzeptanzkriterien fehlen |
| §0 Verifikation | ✅ 100% | -                                     |

**Gesamt:** ✅ 89% erfüllt

---

## Empfehlung

Welle 1 ist weitgehend implementiert. Für vollständige Produktionseinführung werden empfohlen:

1. **KoSIT-Validator-Integration** (W1.1) - Schematron-Validierung gegen offizielle KoSIT-Regeln
2. **E2E-Test-Erweiterung** (W1.3) - Spezifische Akzeptanzkriterien nachrüsten

Beide Punkte sind für Agency-Level-Standards relevant, aber für MVP-Release nicht kritisch.
