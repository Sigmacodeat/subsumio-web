# Audit: Case → Contact Assignment & Document Upload Pipeline

**Date:** 2026-06-22  
**Scope:** `/dashboard/cases/[...slug]` detail page, `/dashboard/contacts`, `/api/upload`, engine ingestion pipeline (`server/src/core/import-file.ts`, `server/src/commands/web-api.ts`, `server/src/core/extract-document.ts`).  
**Goal:** Bring contact assignment and document upload from MVP to agency-level production readiness.

---

## 1. Executive Summary

Both workflows are **functionally MVP-complete** but have clear agency-level gaps:

- **Contact assignment** works end-to-end, but forces the user to leave the case, create a contact elsewhere, and return. No inline creation, no auto-refresh, no pre-fill, no duplicate detection.
- **Document upload** successfully stores files in the brain, extracts text (PDF/DOCX/OCR/email), and stamps `case_slug`. However, the UI is single-file, has no progress, no offline queue, no document type/category, and the matter-context only trusts the case's `documents` array rather than the canonical `case_slug` frontmatter on document pages.

**Critical finding:** A case can end up with documents that have `case_slug = <case>` but are **not** in the case's `documents` array (manual edits, sync bugs, external uploads, partial failures). The current matter-context ignores those documents, so the brain sees them but the case context does not. This is the most important agency-level gap to fix.

---

## 2. Contact Assignment Workflow

### 2.1 Current Flow

1. Case detail page loads contacts via `api.brain.listPages({ type: "legal_contact" })`.
2. Dropdowns filter by role: `client`, `opponent`, `court`, `lawyer`.
3. Selecting a contact updates `caseData.clientSlug/opponentSlugs/courtSlug/ownLawyerSlug` + name and calls `saveCaseUpdate()`.
4. `saveCaseUpdate()` PATCHes the case frontmatter with `client_name`, `client_slug`, `opponent_name`, `opponent_slugs`, etc.
5. Contact page (`/dashboard/contacts`) creates contacts as `legal_contact` pages.
6. Contact cards show `findLinkedCases(contact.slug, cases)` — cases whose frontmatter references that slug.
7. `NewCasePage` has a lightweight conflict check (`checkInternalConflict`) between client and opponent names typed during creation.

### 2.2 What Works (Agency-Ready)

- Data model: contact page + case frontmatter references is clean and supports many-to-many (one contact → many cases).
- `findLinkedCases` correctly derives linked cases from the case frontmatter, so the contact page shows all assigned cases.
- Slug handling for multi-segment case slugs is now correct after the recent fix.
- Conflict check at creation time is a good MVP safety net.

### 2.3 Gaps (Not Agency-Level)

| #   | Gap                                                                                                                                                                              | Severity | Impact                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------- |
| C1  | **No inline contact creation** in the case detail page. The user sees “Noch keine Kontakte angelegt. Kontakt anlegen →” and must navigate to `/dashboard/contacts`, then return. | High     | Breaks flow, increases clicks, risk of losing context.    |
| C2  | **No “create + assign” action.** Even if the user opens contacts, they create a contact, then must return and select it.                                                         | High     | Two separate workflows where one should suffice.          |
| C3  | **No pre-fill from typed name.** If the user typed “Toni Remik” in the case’s Gegner field, the create-contact form does not receive that value.                                 | Medium   | Duplicate data entry, errors.                             |
| C4  | **Contact list does not auto-refresh** after the user creates a contact in another tab or via inline dialog. The case page only loads on mount.                                  | High     | User creates a contact, returns, and it is still missing. |
| C5  | **No contact duplicate detection** when creating from a case. The same person could be created as `contact/toni-remik-123` and `contact/toni-remik-456`.                         | High     | Data quality, conflict-check false negatives.             |
| C6  | **No conflict re-check on assignment.** `checkInternalConflict` runs only during case creation, not when later assigning a client/opponent to an existing case.                  | Medium   | Can silently assign opposing parties later.               |
| C7  | **No contact search/typeahead** in the select; plain `<select>` with all contacts.                                                                                               | Medium   | Poor UX with 50+ contacts.                                |
| C8  | **No visual “currently assigned” state** on the contact page beyond the linked-cases list.                                                                                       | Low      | Harder to audit contact usage.                            |
| C9  | **No bulk assign / replace** for contact roles.                                                                                                                                  | Low      | Manual per-case operation.                                |
| C10 | **No contact history/audit** inside the case.                                                                                                                                    | Low      | Compliance/traceability.                                  |

---

## 3. Document Upload Pipeline

### 3.1 Current Flow

1. Case detail page → “Dokumente” tab → hidden `<input type="file">`.
2. `api.upload.file(file, { title, source: "legal_case", tags: [caseData.slug], case_slug: caseData.slug })` sends a `multipart/form-data` POST to `/api/upload`.
3. Next.js `/api/upload` route:
   - Validates `case_slug` exists in engine.
   - Runs duplicate check (`brainDuplicateStore`).
   - Forwards to `ENGINE_URL/api/upload`.
4. Engine `/api/upload`:
   - Parses multipart, extracts source/tags/case_slug.
   - Generates slug via `slugFromUpload(source, filename, title)`.
   - Calls `buildMarkdownFromUpload()` → text extraction:
     - PDF → `unpdf` text layer, OCR fallback for scanned PDFs.
     - DOCX → `mammoth`.
     - Images → OCR via vision model.
     - EML → email parse.
     - Unsupported formats → 415.
   - Calls `importFromContent()` → parse, chunk, embed (if provider configured), transaction.
   - Stamps `case_slug` and `assignment_status: "assigned"` on the document page via `put_page` with `merge: true`.
   - Adds `caseData.slug` as a tag.
   - Returns `{ slug, title }`.
5. Frontend appends the returned document to `caseData.documents` and calls `saveCaseUpdate({ documents: updated })` to PATCH the case.
6. `MatterContextPanel` later builds context from `fm.documents` of the case page.

### 3.2 What Works (Agency-Ready)

- Engine extraction pipeline is robust: PDF text layer + OCR fallback, DOCX, EML, image OCR, unsupported-format rejection.
- Duplicate detection on the Next.js side via `brainDuplicateStore`.
- Case association via `case_slug` frontmatter is the correct canonical source of truth.
- Tagging and matter-scope assertions are present.
- `caseData.documents` gives the user immediate visibility in the case UI.

### 3.3 Critical Gaps

| #   | Gap                                                                                                                                                                      | Severity | Impact                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------- |
| D1  | **Matter context trusts case.documents, not `case_slug` on document pages.** If the case array drifts, the brain knows about the document but the case context does not. | Critical | Incomplete case picture, missing documents in AI context. |
| D2  | **No sync from `case_slug` documents back into case.documents.** Two sources of truth can diverge.                                                                       | Critical | Same as D1.                                               |
| D3  | **Document deletion only removes the case.documents entry, not the brain page.** The document remains searchable in the brain without a clear tombstone.                 | High     | Ghost data, compliance risk.                              |
| D4  | **Single-file upload only.** No drag-drop, no multi-file, no progress bar.                                                                                               | High     | Slow for real case volumes.                               |
| D5  | **No offline upload queue.** Upload fails immediately when offline; no retry.                                                                                            | High     | Lawyers on the move lose work.                            |
| D6  | **No document type/category.** Cannot mark a document as “Vollmacht”, “Klage”, “Schriftsatz”, etc.                                                                       | High     | Poor organization, weak AI context.                       |
| D7  | **No OCR/extraction status in the case UI.** User cannot see if a scanned PDF is pending OCR, failed, or unverified.                                                     | Medium   | Users trust unverified OCR as fact.                       |
| D8  | **No link-existing-document flow.** Cannot attach an existing brain page to a case.                                                                                      | High     | Documents added via chat, email, or API are orphaned.     |
| D9  | **No upload validation before sending.** No client-side size/type check, no error for >50mb.                                                                             | Medium   | Wasted bandwidth, poor UX.                                |
| D10 | **No document preview or thumbnail.** List shows only filename + size.                                                                                                   | Medium   | Slower orientation.                                       |
| D11 | **No versioning / replacement.** Re-uploading the same file creates a duplicate brain page unless the duplicate hash catches it.                                         | Medium   | Multiple versions scattered.                              |
| D12 | **No full-text search within the case’s documents.**                                                                                                                     | Medium   | Users must open each document.                            |
| D13 | **No document request ↔ upload integration.** Client portal document requests are not tied to uploaded fulfillment.                                                      | Medium   | Workflow gap.                                             |
| D14 | **No malware/AV scan.** Only duplicate check runs before engine ingestion.                                                                                               | Medium   | Security/compliance gap.                                  |
| D15 | **No upload audit log entry.** The case audit log does not record document uploads.                                                                                      | Low      | Traceability.                                             |

---

## 4. Recommended Priority Order

### Phase A — Fix the Source of Truth (must-have)

- A1: Change `buildMatterContext` to query documents by `case_slug` frontmatter AND merge with case.documents.
- A2: Add a server-side or engine-side sync/reconciliation that keeps case.documents in sync with `case_slug` documents (idempotent).
- A3: Implement soft-delete / tombstone for documents removed from a case, and record an audit log entry.

### Phase B — Inline Contact Creation (high UX impact)

- B1: Add inline “+ Kontakt erstellen” dialog in case detail page for each role.
- B2: Pre-fill name from the typed input field; allow selecting role.
- B3: On create, assign the contact to the case immediately and refresh the contact list.
- B4: Duplicate detection: warn if a contact with the same name/email/phone already exists.
- B5: Conflict re-check when assigning a new contact to an existing case.

### Phase C — Document Upload Agency UX (high impact)

- C1: Multi-file drag-drop with progress bars and individual file status.
- C2: Offline upload queue (reuse `offline-store` mutation queue pattern).
- C3: Document type/category selector (auto-suggest via filename/AI).
- C4: Extraction status badge in the document list (text_layer, ocr_vision, ocr_failed, pending).
- C5: Link existing brain page to case (search existing pages by tag/case_slug/title).
- C6: Client-side validation (size, type) before upload.

### Phase D — Polish & Compliance (medium)

- D1: Document preview / thumbnail.
- D2: Full-text search within case documents.
- D3: Document request fulfillment integration.
- D4: AV/malware scan placeholder + policy note.
- D5: Upload audit log entries.

---

## 5. Files to Touch

- `src/app/dashboard/cases/[...slug]/page.tsx` — inline contact creation, contact refresh, document upload UX, extraction status.
- `src/app/dashboard/contacts/page.tsx` — pre-fill param handling, duplicate detection, refresh broadcast.
- `src/lib/matter-context.ts` — query documents by `case_slug` + merge.
- `src/app/api/upload/route.ts` — case validation, malware placeholder, response enrichment.
- `src/app/api/pages/[...slug]/route.ts` — add case.documents reconciliation endpoint if not handled by engine.
- `src/lib/offline-store.ts` / `src/lib/use-mutation.ts` — add `uploadFile` mutation type.
- `server/src/commands/web-api.ts` — `/api/upload` endpoint: expose extraction status, enforce case_slug reconciliation.
- `server/src/core/import-file.ts` — ensure `case_slug` indexing/querying is possible.
- `src/lib/legal-types.ts` — add `DocumentEntry.kind`, `extraction_status`, etc.
- `src/content/dashboard.ts` — new translation keys.

---

## 6. Definition of Done (Agency-Level)

- [ ] User can create a contact directly from a case detail page without leaving the case.
- [ ] The new contact is immediately assigned to the case and appears in the correct dropdown.
- [ ] Duplicate contact detection is enforced at creation time.
- [ ] Conflict check is re-run when assigning a contact to an existing case.
- [ ] Documents uploaded to a case are always visible in the matter context, regardless of whether the case.documents array is in sync.
- [ ] Document upload supports multiple files, drag-drop, progress, and offline retry.
- [ ] Each uploaded document shows its extraction status and verification warning.
- [ ] Users can link existing brain pages to a case.
- [ ] Document deletion from a case soft-deletes/tombstones the brain page and logs the action.
- [ ] All flows have loading, error, empty, and success states; all are keyboard-accessible.
- [ ] E2E tests cover contact assignment, document upload, matter-context document visibility, and offline retry.
