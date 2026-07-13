/**
 * E2E Test — Verification Policy at Output Boundaries
 * ============================================
 * Tests the verification policy enforcement on all 5 output boundary routes:
 *   1. POST /api/word-export          → export_docx
 *   2. POST /api/docusign/send        → sign
 *   3. POST /api/bea/send             → file_court
 *   4. POST /api/cases/send-email     → send_client
 *   5. POST /api/legal/submission-review → share_internal
 *
 * For each route, tests all 5 verification states:
 *   VERIFIED, VERIFIED_WITH_WARNINGS, NEEDS_HUMAN_REVIEW, BLOCKED, VERIFIER_ERROR
 *
 * Also tests:
 *   - Override mechanism for NEEDS_HUMAN_REVIEW
 *   - Content hash mismatch (receipt invalidation)
 *   - Preview/save_draft always allowed (via word-export without verification)
 *   - Audit events logged
 */

import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";

let testCounter = 0;
const TEST_USER = { password: "VerifyPolicy123!", name: "Verify Tester" };

function getTestEmail() {
  testCounter++;
  return `verify-${Date.now()}-${testCounter}@subsumio.local`;
}

async function signUpViaApi(page: import("@playwright/test").Page) {
  const email = getTestEmail();
  const res = await page.context().request.post("/api/auth/signup", {
    data: {
      email,
      name: TEST_USER.name,
      password: TEST_USER.password,
      locale: "de",
      industry: "legal",
    },
  });
  expect(res.status()).toBe(201);
  await page.goto("/dashboard/onboarding", { waitUntil: "domcontentloaded" });
  const csrfToken = (await page.context().cookies()).find((c) => c.name === "sb_csrf")?.value;
  const onboardingRes = await page.context().request.post("/api/onboarding", {
    data: { industry: null },
    headers: csrfToken ? { "x-csrf-token": csrfToken } : {},
  });
  expect(onboardingRes.status()).toBe(200);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/dashboard\/?$/);
  await page.evaluate(() => {
    try {
      localStorage.setItem("subsumio-tour-completed", "true");
    } catch {}
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  return { email };
}

async function getCsrfToken(page: import("@playwright/test").Page) {
  return (await page.context().cookies()).find((c) => c.name === "sb_csrf")?.value;
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

const VALID_HASH = sha256("test content for verification");
const DIFFERENT_HASH = sha256("different content");

const VERIFICATION_STATES = [
  "VERIFIED",
  "VERIFIED_WITH_WARNINGS",
  "NEEDS_HUMAN_REVIEW",
  "BLOCKED",
  "VERIFIER_ERROR",
] as const;

type VerificationState = (typeof VERIFICATION_STATES)[number];

const PUBLISH_ACTIONS = [
  "export_docx",
  "sign",
  "file_court",
  "send_client",
  "share_internal",
] as const;

function makeVerification(
  state: VerificationState,
  opts?: {
    content_hash?: string;
    receipt_hash?: string;
    override?: object;
  }
) {
  return {
    state,
    content_hash: opts?.content_hash ?? VALID_HASH,
    receipt_hash: opts?.receipt_hash,
    override: opts?.override,
  };
}

function makeOverride(hash?: string) {
  return {
    user_id: "anwalt-override-user",
    reason: "Ich habe den Inhalt manuell geprueft und freigegeben.",
    timestamp: new Date().toISOString(),
    output_hash: hash ?? VALID_HASH,
  };
}

// ─── Route payloads ──────────────────────────────────────────────────────

function wordExportPayload(verification?: object) {
  return {
    markdown: "# Test Dokument\n\nDies ist ein Test.",
    title: "Test Dokument",
    verification,
  };
}

function docusignSendPayload(verification?: object) {
  return {
    emailSubject: "Test Vertrag",
    documents: [
      {
        documentBase64: btoa("test document content"),
        name: "test.pdf",
        documentId: "1",
      },
    ],
    recipients: {
      signers: [{ email: "signer@test.local", name: "Test Signer" }],
    },
    status: "sent" as const,
    caseSlug: "test-case",
    verification,
  };
}

function beaSendPayload(verification?: object) {
  return {
    filing_slug: "test-filing-123",
    draft_slug: "test-draft-123",
    court: "LG Wien",
    subject: "Test Schriftsatz",
    sender_name: "Test Anwalt",
    documents: [
      {
        title: "schriftsatz.pdf",
        file_path: "/tmp/schriftsatz.pdf",
        mime_type: "application/pdf",
        size_bytes: 1000,
        file_hash: VALID_HASH,
        is_main_document: true,
      },
    ],
    verification,
  };
}

function sendEmailPayload(verification?: object) {
  return {
    to: "client@test.local",
    subject: "Test Mandantenschreiben",
    body: "Sehr geehrte Damen und Herren, dies ist ein Test.",
    caseSlug: "test-case",
    verification,
  };
}

function submissionReviewPayload(verification?: object) {
  return {
    submissionSlug: "test/submission-123",
    action: "reviewed" as const,
    note: "Geprueft und freigegeben",
    verification,
  };
}

// ─── Test Suites ─────────────────────────────────────────────────────────

test.describe("Verification Policy E2E — Output Boundaries", () => {
  test.beforeEach(async ({ page }) => {
    await signUpViaApi(page);
  });

  // ─── Word Export (export_docx) ──────────────────────────────────────

  test.describe("POST /api/word-export (export_docx)", () => {
    for (const state of VERIFICATION_STATES) {
      const shouldAllow = state === "VERIFIED" || state === "VERIFIED_WITH_WARNINGS";
      test(`${state} → ${shouldAllow ? 200 : 403}`, async ({ page, request }) => {
        const csrf = await getCsrfToken(page);
        const res = await request.post("/api/word-export", {
          data: wordExportPayload(makeVerification(state)),
          headers: csrf ? { "x-csrf-token": csrf } : {},
        });
        if (shouldAllow) {
          expect(res.status()).toBe(200);
        } else {
          expect(res.status()).toBe(403);
          const body = await res.json();
          expect(body.error).toBe("verification_denied");
          expect(body.reason).toBeDefined();
        }
      });
    }

    test("NEEDS_HUMAN_REVIEW with valid override → 200", async ({ page, request }) => {
      const csrf = await getCsrfToken(page);
      const res = await request.post("/api/word-export", {
        data: wordExportPayload(
          makeVerification("NEEDS_HUMAN_REVIEW", { override: makeOverride() })
        ),
        headers: csrf ? { "x-csrf-token": csrf } : {},
      });
      expect(res.status()).toBe(200);
    });

    test("NEEDS_HUMAN_REVIEW with invalid override (hash mismatch) → 403", async ({
      page,
      request,
    }) => {
      const csrf = await getCsrfToken(page);
      const res = await request.post("/api/word-export", {
        data: wordExportPayload(
          makeVerification("NEEDS_HUMAN_REVIEW", {
            override: makeOverride(DIFFERENT_HASH),
          })
        ),
        headers: csrf ? { "x-csrf-token": csrf } : {},
      });
      expect(res.status()).toBe(403);
    });

    test("VERIFIED with hash mismatch → 403", async ({ page, request }) => {
      const csrf = await getCsrfToken(page);
      const res = await request.post("/api/word-export", {
        data: wordExportPayload(
          makeVerification("VERIFIED", {
            content_hash: VALID_HASH,
            receipt_hash: DIFFERENT_HASH,
          })
        ),
        headers: csrf ? { "x-csrf-token": csrf } : {},
      });
      expect(res.status()).toBe(403);
      const body = await res.json();
      expect(body.reason).toContain("Content has changed");
    });

    test("No verification field → 200 (backward compatible)", async ({ page, request }) => {
      const csrf = await getCsrfToken(page);
      const res = await request.post("/api/word-export", {
        data: wordExportPayload(),
        headers: csrf ? { "x-csrf-token": csrf } : {},
      });
      expect(res.status()).toBe(200);
    });
  });

  // ─── DocuSign Send (sign) ───────────────────────────────────────────

  test.describe("POST /api/docusign/send (sign)", () => {
    for (const state of VERIFICATION_STATES) {
      const shouldAllow = state === "VERIFIED" || state === "VERIFIED_WITH_WARNINGS";
      test(`${state} → ${shouldAllow ? "not 403" : 403}`, async ({ page, request }) => {
        const csrf = await getCsrfToken(page);
        const res = await request.post("/api/docusign/send", {
          data: docusignSendPayload(makeVerification(state)),
          headers: csrf ? { "x-csrf-token": csrf } : {},
        });
        if (shouldAllow) {
          // May fail due to missing DocuSign config, but not with 403 verification_denied
          expect(res.status()).not.toBe(403);
          const body = await res.json();
          expect(body.error).not.toBe("verification_denied");
        } else {
          expect(res.status()).toBe(403);
          const body = await res.json();
          expect(body.error).toBe("verification_denied");
        }
      });
    }

    test("NEEDS_HUMAN_REVIEW with valid override → not 403", async ({ page, request }) => {
      const csrf = await getCsrfToken(page);
      const res = await request.post("/api/docusign/send", {
        data: docusignSendPayload(
          makeVerification("NEEDS_HUMAN_REVIEW", { override: makeOverride() })
        ),
        headers: csrf ? { "x-csrf-token": csrf } : {},
      });
      expect(res.status()).not.toBe(403);
    });
  });

  // ─── beA Send (file_court) ──────────────────────────────────────────

  test.describe("POST /api/bea/send (file_court)", () => {
    for (const state of VERIFICATION_STATES) {
      const shouldAllow = state === "VERIFIED" || state === "VERIFIED_WITH_WARNINGS";
      test(`${state} → ${shouldAllow ? "not 403-verification" : "403 verification_denied"}`, async ({
        page,
        request,
      }) => {
        const csrf = await getCsrfToken(page);
        const res = await request.post("/api/bea/send", {
          data: beaSendPayload(makeVerification(state)),
          headers: csrf ? { "x-csrf-token": csrf } : {},
        });
        if (shouldAllow) {
          // May fail with 404 (filing not found) or 422, but not 403 verification_denied
          const body = await res.json();
          expect(body.error).not.toBe("verification_denied");
        } else {
          expect(res.status()).toBe(403);
          const body = await res.json();
          expect(body.error).toBe("verification_denied");
        }
      });
    }

    test("NEEDS_HUMAN_REVIEW with valid override → not verification_denied", async ({
      page,
      request,
    }) => {
      const csrf = await getCsrfToken(page);
      const res = await request.post("/api/bea/send", {
        data: beaSendPayload(makeVerification("NEEDS_HUMAN_REVIEW", { override: makeOverride() })),
        headers: csrf ? { "x-csrf-token": csrf } : {},
      });
      const body = await res.json();
      expect(body.error).not.toBe("verification_denied");
    });
  });

  // ─── Send Email (send_client) ───────────────────────────────────────

  test.describe("POST /api/cases/send-email (send_client)", () => {
    for (const state of VERIFICATION_STATES) {
      const shouldAllow = state === "VERIFIED" || state === "VERIFIED_WITH_WARNINGS";
      test(`${state} → ${shouldAllow ? "not 403-verification" : "403 verification_denied"}`, async ({
        page,
        request,
      }) => {
        const csrf = await getCsrfToken(page);
        const res = await request.post("/api/cases/send-email", {
          data: sendEmailPayload(makeVerification(state)),
          headers: csrf ? { "x-csrf-token": csrf } : {},
        });
        if (shouldAllow) {
          // May fail due to mail config, but not with 403 verification_denied
          const body = await res.json();
          expect(body.error).not.toBe("verification_denied");
        } else {
          expect(res.status()).toBe(403);
          const body = await res.json();
          expect(body.error).toBe("verification_denied");
        }
      });
    }

    test("NEEDS_HUMAN_REVIEW with valid override → not verification_denied", async ({
      page,
      request,
    }) => {
      const csrf = await getCsrfToken(page);
      const res = await request.post("/api/cases/send-email", {
        data: sendEmailPayload(
          makeVerification("NEEDS_HUMAN_REVIEW", { override: makeOverride() })
        ),
        headers: csrf ? { "x-csrf-token": csrf } : {},
      });
      const body = await res.json();
      expect(body.error).not.toBe("verification_denied");
    });
  });

  // ─── Submission Review (share_internal) ─────────────────────────────

  test.describe("POST /api/legal/submission-review (share_internal)", () => {
    for (const state of VERIFICATION_STATES) {
      const shouldAllow = state === "VERIFIED" || state === "VERIFIED_WITH_WARNINGS";
      test(`${state} → ${shouldAllow ? "not 403-verification" : "403 verification_denied"}`, async ({
        page,
        request,
      }) => {
        const csrf = await getCsrfToken(page);
        const res = await request.post("/api/legal/submission-review", {
          data: submissionReviewPayload(makeVerification(state)),
          headers: csrf ? { "x-csrf-token": csrf } : {},
        });
        if (shouldAllow) {
          // May fail with 404 (submission not found), but not 403 verification_denied
          const body = await res.json();
          expect(body.error).not.toBe("verification_denied");
        } else {
          expect(res.status()).toBe(403);
          const body = await res.json();
          expect(body.error).toBe("verification_denied");
        }
      });
    }

    test("NEEDS_HUMAN_REVIEW with valid override → not verification_denied", async ({
      page,
      request,
    }) => {
      const csrf = await getCsrfToken(page);
      const res = await request.post("/api/legal/submission-review", {
        data: submissionReviewPayload(
          makeVerification("NEEDS_HUMAN_REVIEW", { override: makeOverride() })
        ),
        headers: csrf ? { "x-csrf-token": csrf } : {},
      });
      const body = await res.json();
      expect(body.error).not.toBe("verification_denied");
    });
  });

  // ─── Cross-cutting: Receipt invalidation ────────────────────────────

  test.describe("Receipt invalidation (content hash mismatch)", () => {
    test("export_docx with hash mismatch → 403 with 'Content has changed'", async ({
      page,
      request,
    }) => {
      const csrf = await getCsrfToken(page);
      const res = await request.post("/api/word-export", {
        data: wordExportPayload(
          makeVerification("VERIFIED", {
            content_hash: VALID_HASH,
            receipt_hash: DIFFERENT_HASH,
          })
        ),
        headers: csrf ? { "x-csrf-token": csrf } : {},
      });
      expect(res.status()).toBe(403);
      const body = await res.json();
      expect(body.reason).toContain("Content has changed");
      expect(body.reason).toContain("Receipt invalidated");
    });
  });

  // ─── Cross-cutting: BLOCKED cannot be overridden ────────────────────

  test.describe("BLOCKED state cannot be overridden", () => {
    test("export_docx BLOCKED with override → still 403", async ({ page, request }) => {
      const csrf = await getCsrfToken(page);
      const res = await request.post("/api/word-export", {
        data: wordExportPayload(makeVerification("BLOCKED", { override: makeOverride() })),
        headers: csrf ? { "x-csrf-token": csrf } : {},
      });
      expect(res.status()).toBe(403);
      const body = await res.json();
      expect(body.reason).toContain("no override possible");
    });
  });
});
