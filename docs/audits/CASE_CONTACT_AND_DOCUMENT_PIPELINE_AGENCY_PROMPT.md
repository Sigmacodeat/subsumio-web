# Agency-Level Implementation Prompt: Case Contact Assignment & Document Upload Pipeline

**Context:** Use this prompt after reading `/docs/audits/CASE_CONTACT_AND_DOCUMENT_PIPELINE_AUDIT.md`. The goal is to transform the case-detail contact assignment and document upload flows from MVP to agency-level production quality.

**Operating mode:** Blueprint-first, then atomic packages, then implementation with self-audit after each package. No mocks, no placeholders, no manual follow-up work. All user flows must be complete (CRUD, error, empty, loading, undo, keyboard, offline where applicable).

---

## Phase 0 — Blueprint

Before writing code, produce a concise blueprint in the chat with:

1. **Goal from the user’s perspective:** A lawyer can create contacts inside a case, assign them, and upload/link documents to a case, with every document reliably surfacing in the brain and in the matter context.
2. **Core user flows:**
   - Create a contact from the case detail page and auto-assign it.
   - Assign an existing contact to a case with conflict check.
   - Upload multiple documents to a case (drag-drop, progress, status).
   - Link an existing brain page to a case.
   - Remove a document from a case (soft-delete/tombstone).
   - View all case documents in the matter context, even if the case array drifted.
3. **UI interactions:** click, hover, focus, keyboard, drag-drop, dialog, toast, progress.
4. **Data model & state management:** how contacts, cases, and documents are represented, where the single source of truth lives, and how the UI reconciles state.
5. **Architecture decisions:** inline dialog vs. separate page, offline mutation queue, engine query strategy, audit log approach.
6. **Edge cases & error scenarios:** duplicate contacts, offline creation, upload failure, large files, unsupported formats, OCR failure, case array drift, permissions.
7. **Definition of Done:** list of verifiable acceptance criteria.

Only proceed after the blueprint is complete and approved.

---

## Phase 1 — Fix the Document Source of Truth (Critical)

### Package 1.1 — Query documents by `case_slug` in matter context

- **File:** `src/lib/matter-context.ts`
- **Goal:** Ensure `buildMatterContext` returns ALL documents that belong to a case, not just the ones listed in the case frontmatter.
- **Implementation:**
  - In `buildMatterContext`, after fetching the case page, perform a second query to the engine for pages where `frontmatter.case_slug === <caseSlug>` and `frontmatter.type === "document"` (or `source_format` is present).
  - If no direct engine query exists, use `fetchEngineSearch` or add a new lightweight endpoint on the engine (`/api/search?q=case_slug:<caseSlug>`) that returns document pages.
  - Merge the two collections:
    - Start with documents from `caseData.documents` (user-curated list).
    - Add any `case_slug`-stamped documents not already in that list.
    - De-duplicate by `slug` (prefer the case array entry for `kind`/`description` if present).
  - Update `MatterDocumentSummary` so each document includes `slug`, `name`, `source_type`, `extraction_status`, `extraction_unverified`, `size`, `uploaded_at`, `url`.
- **Acceptance:**
  - A document uploaded to the case appears in the matter context even if `caseData.documents` is temporarily empty or corrupted.
  - The Superbrain chat for the case can answer questions based on the uploaded document.

### Package 1.2 — Reconcile case.documents with `case_slug` documents

- **Goal:** Keep the case frontmatter array and the canonical `case_slug` frontmatter in sync, idempotently.
- **Implementation:**
  - In the Next.js `/api/upload` route, after a successful engine upload, PATCH the case page to add the new document to `caseData.documents` if it is not already there.
  - Alternatively, add an engine-side hook in `server/src/commands/web-api.ts` `/api/upload` that, after `put_page` with `case_slug`, also writes the document reference back to the case’s `documents` array atomically. This is preferred if the engine has direct case access.
  - If the frontend remains responsible, make it robust: retry the case PATCH once on failure, and log a warning.
- **Acceptance:**
  - Uploading a document adds it to both the brain page frontmatter AND the case frontmatter documents array.
  - The two sources never permanently diverge for normal upload flow.

### Package 1.3 — Soft-delete and tombstone documents

- **File:** `src/app/dashboard/cases/[...slug]/page.tsx`, `src/app/api/pages/[...slug]/route.ts`, engine `server/src/commands/web-api.ts`.
- **Goal:** Removing a document from a case must not leave a searchable orphan in the brain.
- **Implementation:**
  - When the user deletes a document from the case UI, remove it from `caseData.documents` and PATCH the case.
  - Then call the engine to update the document page frontmatter: `case_slug = null`, `assignment_status = "unassigned"`, and add a `tombstoned_at` timestamp.
  - Alternatively, if the engine supports it, add a `tombstone` flag to the page.
  - Add an audit log entry to the case: `action: "document_removed"`, `actor`, `document_slug`, `document_name`, `at`.
- **Acceptance:**
  - After deletion, the document is no longer in the case list.
  - The document page is no longer included in the matter context for that case.
  - The document page still exists in the brain (for compliance) but is marked unassigned.
  - The case audit log records the removal.

---

## Phase 2 — Inline Contact Creation from Case Detail

### Package 2.1 — Inline contact creation dialog

- **File:** `src/app/dashboard/cases/[...slug]/page.tsx`, new component `src/components/legal/ContactCreateDialog.tsx`.
- **Goal:** A lawyer can create a contact from the case page and immediately assign it to the current case.
- **Implementation:**
  - Add a small “+” icon / “Kontakt erstellen” button next to each contact dropdown (Client, Opponent, Court, Lawyer).
  - Open a modal/dialog with fields: name (required), role (pre-selected based on which dropdown was clicked), company, email, phone, address, notes.
  - Pre-fill `name` from any typed value in the case’s related text input (e.g., if the user typed “Toni Remik” in the opponent field before opening the dialog).
  - On submit:
    - Validate the form (email format, name non-empty).
    - Duplicate check: search existing contacts by name/email/phone. If a match exists, show a warning and offer to use the existing contact instead.
    - Create the contact via `api.brain.createPage` or `enqueueMutation` if offline.
    - Update the case frontmatter to assign the new contact (set `clientSlug` + `clientName`, etc.).
    - Refresh the local contacts list and select the new contact in the dropdown.
    - Show a success toast and close the dialog.
- **Acceptance:**
  - User creates a contact from the case page without navigation.
  - The new contact is selected in the correct dropdown immediately.
  - The case is saved with the assignment.
  - Offline creation works and syncs when online.

### Package 2.2 — Duplicate detection and conflict re-check

- **File:** `src/components/legal/ContactCreateDialog.tsx`, `src/lib/contact-conflict.ts`.
- **Goal:** Prevent duplicate contacts and re-check conflicts when assigning.
- **Implementation:**
  - In the dialog, before creating, query `api.brain.listPages({ type: "legal_contact", limit: 500 })` and compare normalized name, email, phone.
  - If a duplicate exists, show: “Kontakt ‘X’ existiert bereits. Verwenden?” with a primary action to assign the existing contact and a secondary action to create anyway.
  - When assigning any contact (new or existing) to a case, run `checkInternalConflict` on the case’s current parties. If a conflict is detected, show a warning but allow the user to confirm with a note (lawyer discretion).
- **Acceptance:**
  - Creating a contact with the same name/email as an existing contact triggers a duplicate warning.
  - Assigning a client and opponent to the same case triggers a conflict warning.

### Package 2.3 — Contact list refresh and cross-page sync

- **File:** `src/app/dashboard/cases/[...slug]/page.tsx`, `src/app/dashboard/contacts/page.tsx`.
- **Goal:** After a contact is created anywhere, all open case pages see the new contact.
- **Implementation:**
  - Add a lightweight polling interval (e.g., 30s) or SSE event listener for contact creation in the case detail page.
  - Alternatively, broadcast a custom event from `contacts/page.tsx` on successful contact creation, and listen in the case page (same-origin tab communication only).
  - At minimum, refresh the contacts list when the case page regains focus (`window.addEventListener("focus", ...)`).
- **Acceptance:**
  - Create a contact in a contacts page tab, switch to the case page tab, and the new contact appears in the dropdown within 30 seconds or on focus.

---

## Phase 3 — Document Upload Agency UX

### Package 3.1 — Multi-file drag-drop with progress

- **File:** `src/app/dashboard/cases/[...slug]/page.tsx`, new component `src/components/legal/CaseFileUpload.tsx`.
- **Goal:** Real-world document upload UX.
- **Implementation:**
  - Replace the hidden single-file `<input>` with a dropzone area (or keep it as a fallback) that supports multiple files.
  - For each file, show a progress row: filename, size, progress bar, status (queued, uploading, processing, done, error).
  - Use `api.upload.file` with `onProgress` callback.
  - After each upload succeeds, append the document to the case and call `saveCaseUpdate` once per batch or per file (per file is simpler and matches the current pattern).
- **Acceptance:**
  - User can drop 5 files at once and see individual progress.
  - Failed uploads show a retry button.
  - Uploads are still associated with the correct case.

### Package 3.2 — Offline upload queue

- **File:** `src/lib/offline-store.ts`, `src/lib/use-mutation.ts`, `src/app/dashboard/cases/[...slug]/page.tsx`.
- **Goal:** Uploads queue when offline and retry when online.
- **Implementation:**
  - Add a new queued mutation type `uploadFile` with payload: `{ file: File (not storable) | serialized, caseSlug, title, source, tags }`.
  - Note: IndexedDB cannot store `File` objects reliably. Store a placeholder document entry in the case frontmatter and queue the metadata; when online, if the actual File is unavailable, show the user a toast that they need to re-upload. A better approach: store the File in a separate IndexedDB object store as an ArrayBuffer; implement `storeFileBuffer(key, buffer)` and `retrieveFileBuffer(key)` in `offline-store.ts`.
  - Implement the retry logic in `useMutationQueue` to read the buffer from IndexedDB, upload it, and on success remove the buffer and placeholder.
- **Acceptance:**
  - When offline, the user can select files; the upload is queued and appears with status “Wartet auf Verbindung”.
  - When online, the queue uploads the files automatically.
  - If the browser was closed, the placeholder remains and the user is notified to re-upload (or use the IndexedDB buffer if available).

### Package 3.3 — Document type/category and extraction status

- **File:** `src/app/dashboard/cases/[...slug]/page.tsx`, `src/lib/legal-types.ts`, `src/lib/api.ts`.
- **Goal:** Documents are categorized and their brain processing status is visible.
- **Implementation:**
  - In the upload dialog/dropzone, add an optional “Dokumententyp” select: `Vollmacht`, `Klage`, `Schriftsatz`, `Beweis`, `Korrespondenz`, `Vertrag`, `Sonstiges`.
  - Send the type as `document_type` in the upload form data and store it in the document frontmatter.
  - In the document list, show a badge for the document type.
  - Read the upload response `extraction_status` and `extraction_unverified` and display a status badge:
    - `text_layer` → “Durchsuchbar”
    - `ocr_vision` → “OCR (unverifiziert)”
    - `ocr_failed` → “OCR fehlgeschlagen”
    - `pending` → “Wird verarbeitet…”
  - Update the document list to re-fetch or poll for extraction status for documents that are pending.
- **Acceptance:**
  - Each uploaded document has a type badge.
  - Scanned PDFs show “OCR (unverifiziert)” with a tooltip warning.
  - Pending documents show a spinner and update automatically when ready.

### Package 3.4 — Link existing brain page to case

- **File:** `src/app/dashboard/cases/[...slug]/page.tsx`.
- **Goal:** Attach documents that were uploaded elsewhere (chat, email, API) to the case.
- **Implementation:**
  - Add a “Vorhandenes Dokument verknüpfen” button.
  - Open a search dialog that queries `api.brain.search` for pages matching the case title or with `frontmatter.case_slug` not equal to the current case (or no `case_slug`).
  - Allow the user to select one or more pages.
  - For each selected page, PATCH the document page frontmatter to set `case_slug` and `assignment_status: "assigned"`, and add it to the case `documents` array.
- **Acceptance:**
  - Existing brain pages can be linked to the case.
  - Linked documents appear in the case document list and in the matter context.

### Package 3.5 — Client-side validation and upload policy

- **File:** `src/components/legal/CaseFileUpload.tsx`, `src/app/api/upload/route.ts`.
- **Goal:** Prevent bad uploads before they start.
- **Implementation:**
  - Client-side: reject files > 50 MB (matching engine limit), show accepted formats (PDF, DOCX, PNG, JPG, HEIC, EML), warn about unsupported formats.
  - Server-side: keep the existing 415 unsupported format response and improve the error message to include the file extension and accepted formats.
  - Add a placeholder for an AV/malware scan in `/api/upload` (log-only or integrate with a scan provider if configured). Do not block uploads if no AV provider is configured, but add a frontmatter marker `av_scan_status: "pending"` or similar.
- **Acceptance:**
  - Uploading a 60 MB file shows a client-side error before sending.
  - Unsupported formats show a clear, actionable message.

---

## Phase 4 — Polish, Accessibility, Tests

### Package 4.1 — Accessibility and keyboard

- Ensure all new dialogs are reachable via keyboard, have focus traps, `aria-label`s, and close on `Escape`.
- Upload dropzone must work with keyboard (Enter/Space to open file picker).
- Contact select must be usable with keyboard; consider a searchable select/combobox.

### Package 4.2 — Audit log and notifications

- Add audit log entries for:
  - `contact_assigned` (role, contact slug, contact name)
  - `contact_created_and_assigned`
  - `document_uploaded`
  - `document_linked`
  - `document_removed`
- Use the existing `audit_log` frontmatter array in the case page.

### Package 4.3 — E2E tests

- **Files:** `tests/e2e-playwright/case-contacts.spec.ts`, `tests/e2e-playwright/case-documents.spec.ts`, `tests/e2e-playwright/matter-context-documents.spec.ts`.
- Cover:
  - Create contact from case, assign it, verify it appears in the case header.
  - Upload a PDF, verify it appears in the document list, verify the matter context references it.
  - Upload a scanned image/PDF, verify OCR status badge.
  - Remove a document from case, verify it no longer appears in the matter context.
  - Link existing brain page to case.
  - Offline upload queue (if possible in Playwright via network throttling).

---

## Final Definition of Done

- [ ] All packages above implemented and self-audited.
- [ ] `bun run tsc` passes with no errors.
- [ ] All new E2E tests pass.
- [ ] No UI element without a clear purpose; no dead buttons; no missing error/empty/loading states.
- [ ] The case detail page is usable for the entire contact + document flow without navigation away from the case.
- [ ] Every document with `case_slug = <case>` is visible in the matter context.
- [ ] Document deletion leaves a clear tombstone/audit trail.
- [ ] Offline flows degrade gracefully and sync when reconnected.
