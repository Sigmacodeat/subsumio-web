# Blueprint: Mandatsannahme-Pipeline (Client Intake → Matter Acceptance Workflow)

**Status:** Phase 1 — System-Blueprint (2026-07-09)  
**Scope:** Verkettung der existierenden Bausteine `Intake`, `Kollisionsprüfung`, `KYC/GwG`, `Vollmacht` und `Mandatsannahme-Schreiben` zu einer **erzwungenen, geführten Pipeline**.  
**Rechtliche Anker:** § 43a BRAO (Mandanten- und Interessenkonflikte), § 1 ff. GwG (Identifizierung), § 50 BRAO (Aufbewahrung).

---

## 1) Ziel des Systems / Features (aus User-Sicht)

Ein Anwalt darf heute eine Akte anlegen, ohne dass das System ihn zwingt, eine Kollisionsprüfung durchzuführen. Das führt zu Haftungslücken und Berufsrechtsverstößen. Diese Pipeline stellt sicher, dass aus einer **Anfrage** erst eine **Akte** wird, wenn alle Pflichtschritte erfüllt oder explizit freigegeben sind:

**Anfrage → Kollisionsprüfung (blockierend) → KYC/GwG → Vollmacht → Mandatsannahme-Schreiben → Akte.**

Das System führt den Anwalt Schritt für Schritt, zeigt offene Blocker im Cockpit und schreibt jeden Schritt auditfest ins Frontmatter.

---

## 2) Kern-Userflows

### Beginner / First-Use

1. Nutzer klickt im Dashboard auf **„Posteingang triagieren“** (`/dashboard/intake`).
2. Er sieht eine neue Anfrage mit dem **Status `new`** und einem Badge **„Kollisionsprüfung ausstehend“**.
3. Er klickt auf **„Mandatsannahme starten“**.
4. Ein Wizard öffnet sich. Schritt 1: **Kollisionsprüfung** — der Kunde-Name wird aus dem Intake übernommen und der Prüf-Button ausgeführt. Bei `severity: critical` blockiert das System.
5. Schritt 2: **KYC/GwG** — einfache Risikoabfrage; bei hohem Risiko wird ein KYC-Datensatz angelegt.
6. Schritt 3: **Vollmacht** — ein Prozessvollmacht wird vorgeschlagen und der Antrag kann per E-Mail/DocuSign versendet werden.
7. Schritt 4: **Mandatsannahme-Schreiben** — der Standardbrief wird generiert und zur finalen Prüfung angeboten.
8. Schritt 5: **Akte anlegen** — der Intake wird in eine Akte konvertiert; Status `converted`; Akte bekommt `mandate_accepted_at`.

### Normal / Täglicher Betrieb

1. Anwalt legt aus dem Schnell-Dialog (`CaseQuickCreateDialog`) einen neuen Fall an.
2. Bevor die Akte erstellt wird, prüft das System: **gibt es einen bestehenden Intake oder Kontakt mit Konflikt?** Falls ja, blockiert es die Erstellung und leitet zur Pipeline.
3. Im Akt zeigt der **AI-Tab** / **Cockpit-Widget** offene Annahme-Schritte: „Kollisionsprüfung noch nicht erfasst“, „KYC ausstehend“, „Vollmacht nicht unterschrieben“.
4. Ein Klick auf eine Karte öffnet den jeweiligen Sub-Workflow.

### Power-User / Edge

- Ein Partner kann mit **Audit-Begründung** einen Konflikt-Blocker per Waiver (`conflict_waived`) freigeben (Partner/Admin-Rolle erforderlich).
- Mehrere Intakes desselben Mandanten werden erkannt und können im Bulk bearbeitet werden.
- Über `/api/intake/:slug/acceptance` kann ein Schritt per API fortgeschrieben werden (für WhatsApp/Portal-Integrationen).

---

## 3) Alle UI-Elemente & Interaktionen

### Klick

- **Intake-Listenkarte**: Button **„Mandatsannahme starten“** statt nur „Konvertieren“.
- **Wizard-Stepper**: Links auf die 5 Schritte; vergangene Schritte sind klickbar, zukünftige nur wenn Vorbedingungen erfüllt.
- **„Konflikt prüfen“**-Button übernimmt `client_name` und führt `api.legal.conflictCheck` aus.
- **„KYC anlegen“**-Button leitet auf `/dashboard/kyc` vorbelegt mit `case_slug`/`client_name`.
- **„Vollmacht anlegen“**-Button leitet auf `/dashboard/power-of-attorney` vorbelegt.
- **„Mandatsannahme-Schreiben generieren“**-Button erzeugt ein `type: engagement_letter` Dokument.
- **„Akte anlegen (Mandatsannahme abschließen)“**-Button ist disabled, bis alle required Schritte erfüllt.

### Hover

- Stepper-Steps zeigen Tooltip mit Status und fehlenden Pflichten.
- Konflikt- und KYC-Badges zeigen Detail-Tooltip (Wer hat geprüft? Wann? Ergebnis?).
- Deaktivierter „Akte anlegen“-Button zeigt Tooltip mit Blocker-Liste.

### Focus

- Alle Formularfelder im Wizard haben sichtbaren Focus-Ring.
- ARIA-Labels für Stepper (`aria-current="step"`), für Alert-Regionen bei Fehlern.

### Keyboard

- Wizard per `Tab`, `Space`, `Enter` bedienbar.
- Stepper-Navigation per Pfeiltasten.
- `Esc` schließt den Wizard ohne Speichern (Bestätigungsdialog bei laufenden Änderungen).

### Drag / Drop

- Nicht relevant für diese Pipeline.

---

## 4) Datenmodell & State-Management

### Intake-Frontmatter (`src/lib/intake.ts`)

```ts
export interface IntakeAcceptanceWorkflow {
  conflict_check_required: true; // immer true für Rechtssicherheit
  conflict_check?: {
    status: ConflictCheckStatus; // pending | clear | conflict | needs_review
    performed_at?: string;
    performed_by?: string;
    severity?: "none" | "low" | "critical";
    matches?: string[];
    waived?: boolean;
    waived_by?: string;
    waived_reason?: string;
    waived_at?: string;
  };
  kyc?: {
    required: boolean;
    status: "pending" | "verified" | "failed" | "not_required";
    verification_slug?: string;
    verified_at?: string;
    risk_level?: "low" | "medium" | "high";
  };
  poa?: {
    required: boolean;
    status: "pending" | "draft" | "sent" | "signed";
    poa_slug?: string;
  };
  engagement_letter?: {
    status: "pending" | "draft" | "sent";
    document_slug?: string;
    sent_at?: string;
  };
  accepted_at?: string;
  accepted_by?: string;
}
```

Neues Feld in `IntakeRequestFrontmatter`:

```ts
acceptance: IntakeAcceptanceWorkflow;
```

### Akten-Frontmatter (`src/lib/intake-conversion.ts`, `buildCaseFromIntake`)

Neue Felder beim Konvertieren:

```ts
mandate_acceptance: {
  intake_slug: string;
  accepted_at: string;
  accepted_by: string;
  conflict_check: {
    status;
    severity;
    performed_at;
    performed_by;
  }
  kyc: {
    required;
    status;
    verification_slug;
    risk_level;
  }
  poa: {
    required;
    status;
    poa_slug;
  }
  engagement_letter: {
    status;
    document_slug;
    sent_at;
  }
}
```

### Workflow-State-Modell (`src/lib/matter-workflow.ts`)

Neuer `MatterWorkflowActionKind`:

```ts
"complete_acceptance" | "verify_kyc" | "create_poa" | "send_engagement_letter";
```

### State-Management

- Server-Source-of-Truth: Frontmatter in Engine-Pages.
- Client: React-Query + `useMutation` wie bisher im Intake-Page.
- Kein separater global Store; `invalidateQueries` nach jedem Schritt.

---

## 5) Architektur-Entscheidungen

1. **Sicherheitsregeln in der Schreibschicht** (`src/app/api/intake/convert/route.ts`):
   - `POST /api/intake/convert` prüft `acceptance.conflict_check.status` (muss `clear` oder `waived` sein).
   - Bei `waived` muss `waived_by` eine Partner/Admin-Rolle haben und `waived_reason` gesetzt sein.
   - Backend validiert KYC-Status (nur `not_required` oder `verified` erlaubt, wenn `required`).
   - Backend validiert POA-Status (nur `not_required` oder `signed` erlaubt, wenn `required`).

2. **Keine Parallel-Äste** — Pipeline ist sequentiell, aber KYC und Vollmacht können parallel ablaufen, sobald Konfliktprüfung erledigt ist.

3. **Bestehende Seiten wiederverwenden**:
   - `/dashboard/kollisionspruefung` als isoliertes Tool bleibt erhalten.
   - `/dashboard/kyc` und `/dashboard/power-of-attorney` werden mit `prefill` verbessert.
   - Neue zentrale Pipeline-Wizard-Komponente: `IntakeAcceptanceWizard.tsx`.

4. **Einheitliche API**:
   - `PATCH /api/intake` erweitern, um `acceptance` zu aktualisieren.
   - `POST /api/intake/convert` bleibt der Endpunkt, aber führt Prüfungen durch.
   - Keine neue Domain-Route nötig.

5. **Audit-Trail**:
   - Jeder Schritt-Wechsel schreibt `audit_action` (bestehendes `audit` System).
   - Waiver speichert `waived_by`, `waived_reason`, `waived_at` unveränderlich.

6. **KI-Assistenz**:
   - System schlägt Konfliktkandidaten basierend auf `client_name`/`email`/`phone_hash` vor.
   - System schlägt `kyc.required` und `poa.type` basierend auf Rechtsgebiet und Mandantenstruktur vor.
   - Keine KI-Entscheidung ohne menschliche Freigabe (Review-Pattern).

---

## 6) Edge-Cases & Fehlerszenarien

### Pflicht / Kritisch

- **Kollisionsprüfung `critical`**: Konvertierung blockiert; Anwalt muss entweder ablehnen oder einen Waiver eines Partners einholen.
- **Waiver unzureichend**: Prüfung in `convert` auf Rolle + Begründung; 403 bei Fehlschlag.
- **KYC hochrisiko**: Konvertierung nicht möglich, solange KYC nicht `verified` (nur `not_required` bei niedrigem Risiko).
- **POA abgelaufen**: Bei `expires_at` in der Vergangenheit wird `poa.status` auf `expired` gesetzt; Pipeline blockiert.
- **Doppelter Akten-Slug**: Prüfung bleibt bestehend (`checkRes`), aber zusätzlich wird `source_intake_slug` geprüft.

### UX

- **Kein Client-Name**: Wizard kann nicht starten, bis Name gepflegt ist.
- **Intake ohne `legal_area`**: System erlaubt Konvertierung, warnt aber im Wizard.
- **Offline**: Mutation wird in `offline-store` queue eingereiht; Validierung läuft beim Replay serverseitig.
- **Schnelles Klicken**: `isPending` / `setSubmitting` sperrt Buttons; `AbortController` bricht alte API-Calls ab.
- **Konvertieren abbrechen**: Wizard-Dialog bei `onOpenChange` mit ungespeicherten Änderungen warnt.

### Recht

- **Waiver unvollständig**: `waived_by` und `waived_reason` Pflicht; `waived_at` wird automatisch gesetzt.
- **Partner verlässt Kanzlei**: Waiver bleibt historisch gültig; Audit-Log speichert E-Mail + Rolle zum Zeitpunkt der Freigabe.
- **KYC Dokumente fehlen**: Wizard erlaubt Speichern, aber nicht Konvertierung.

---

## 7) Definition of Done (klar überprüfbar)

### Funktional

- [ ] Intake kann nicht mehr in eine Akte konvertiert werden, ohne dass `conflict_check.status` `clear` oder `waived` ist.
- [ ] `CaseQuickCreateDialog` prüft vor Erstellung, ob ein Intake/Kontakt mit demselben Namen existiert, und leitet ggf. zur Pipeline.
- [ ] Ein `IntakeAcceptanceWizard` führt durch 5 Schritte (Konflikt, KYC, Vollmacht, Mandatsbrief, Akte anlegen).
- [ ] KYC-Prüfung erzeugt über `/api/kyc` eine `kyc_verification`-Page und verlinkt sie im Intake.
- [ ] Vollmacht erzeugt über `/api/power-of-attorney` eine `power_of_attorney`-Page und verlinkt sie im Intake.
- [ ] Mandatsannahme-Schreiben generiert ein `engagement_letter`-Dokument und speichert `document_slug`.
- [ ] Akte bekommt `mandate_acceptance` Frontmatter mit allen Prüf-Metadaten.

### Daten & API

- [ ] `src/lib/intake.ts` erweitert um `IntakeAcceptanceWorkflow`.
- [ ] `src/lib/intake-conversion.ts` erweitert `buildCaseFromIntake` um `mandate_acceptance`.
- [ ] `src/app/api/intake/route.ts` erweitert PATCH-Schema um `acceptance`.
- [ ] `src/app/api/intake/convert/route.ts` erzwingt `conflict_check` clear/waived + optional KYC/POA.
- [ ] `src/lib/api.ts` erweitert `api.intake.update` und `api.intake.convert` um `acceptance`.

### UI

- [ ] Intake-Page zeigt Pipeline-Status und Start-Button.
- [ ] `MatterWorkflowAction` listet offene Annahme-Schritte (KYC, POA, Engagement Letter).
- [ ] `CaseQuickCreateDialog` blockiert Konvertierung bei Konflikt und bietet Pipeline-Start.

### Tests

- [ ] Unit-Tests für `buildCaseFromIntake` mit `mandate_acceptance`.
- [ ] Unit-Test für `canConvertIntake` / `validateAcceptanceForConversion`.
- [ ] Integrationstest für API `/api/intake/convert` mit blockierten und erlaubten Pfaden.
- [ ] Playwright-E2E: Anfrage → Pipeline → Akte.

### Qualität

- [ ] `tsc --noEmit` 0 Fehler.
- [ ] `npx vitest run` alle relevanten Tests grün.
- [ ] `npx next build` erfolgreich.
- [ ] i18n-Keys (`de`/`en`) in `src/content/dashboard.ts` ergänzt.
- [ ] Keine neuen `node:`-Module in Client-Dateien.

---

## 8) Betroffene Dateien (Anker)

- `src/lib/intake.ts`
- `src/lib/intake-conversion.ts`
- `src/lib/intake.test.ts`
- `src/lib/intake-conversion.test.ts`
- `src/app/api/intake/route.ts`
- `src/app/api/intake/convert/route.ts`
- `src/app/dashboard/intake/page.tsx`
- `src/components/legal/IntakeAcceptanceWizard.tsx` (neu)
- `src/components/legal/CaseQuickCreateDialog.tsx`
- `src/lib/matter-workflow.ts`
- `src/lib/matter-workflow.test.ts`
- `src/lib/api.ts`
- `src/content/dashboard.ts`
- `src/lib/kyc.ts` (neue Helper, falls nötig)
- `src/lib/power-of-attorney.ts` (neue Helper, falls nötig)
- `src/lib/audit.ts` / `src/lib/audit-labels.ts` (neue Audit-Actions)

---

## 9) Abgrenzung (was in dieser Welle NICHT passiert)

- Keine vollständige Neufassung der KYC-UI (nur Vorbelegung/Verlinkung).
- Keine vollständige Neufassung der Vollmacht-UI (nur Vorbelegung/Verlinkung).
- Keine Mandatsannahme-Brief-Automatisierung (nur ein einfaches Dokument-Template; der KI-Text-Generator bleibt als spätere Erweiterung).
- Keine beA-Schnittstelle für Zustellung (Thema Nr. 2 aus deinem Befund bleibt separat).
