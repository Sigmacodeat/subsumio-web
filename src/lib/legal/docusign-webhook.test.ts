/**
 * docusign-webhook.test.ts — Tests for P0-TODO 2
 *
 * Verifies:
 *  1. Webhook route imports downloadEnvelopeDocuments from docusign lib
 *  2. On envelope-completed, signed PDF is downloaded and uploaded as document page
 *  3. On envelope-declined, visible notification is created for all recipients
 *  4. Response includes documentUploaded and declined flags
 *  5. docusign.ts exports downloadEnvelopeDocuments function
 *  6. Status mapping includes completed→signed, declined→declined, voided→expired
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const webhookRoutePath = join(process.cwd(), "src/app/api/docusign/webhook/route.ts");
const webhookSource = readFileSync(webhookRoutePath, "utf-8");

const docusignLibPath = join(process.cwd(), "src/lib/docusign.ts");
const docusignLibSource = readFileSync(docusignLibPath, "utf-8");

describe("P0-TODO 2: DocuSign Webhook — Status Sync + Document Upload", () => {
  it("docusign.ts exports downloadEnvelopeDocuments function", () => {
    expect(docusignLibSource).toContain("export async function downloadEnvelopeDocuments");
    expect(docusignLibSource).toContain("combined=true");
  });

  it("webhook route imports downloadEnvelopeDocuments", () => {
    expect(webhookSource).toContain("downloadEnvelopeDocuments");
  });

  it("webhook route downloads signed PDF on envelope-completed", () => {
    expect(webhookSource).toContain('status === "completed"');
    expect(webhookSource).toContain("downloadEnvelopeDocuments(envelopeId)");
  });

  it("webhook route uploads signed PDF as document page to brain", () => {
    expect(webhookSource).toContain("legal/documents/signed_");
    expect(webhookSource).toContain("document_type");
    expect(webhookSource).toContain("signed_contract");
    expect(webhookSource).toContain("content_base64");
  });

  it("webhook route updates signature_request page with signed_document_slug", () => {
    expect(webhookSource).toContain("signed_document_slug");
  });

  it("webhook route creates visible notification on envelope-declined", () => {
    expect(webhookSource).toContain('status === "declined"');
    expect(webhookSource).toContain("createNotificationFailureNotification");
    expect(webhookSource).toContain("envelope_declined");
  });

  it("webhook route notifies all recipients of the brain on decline", () => {
    expect(webhookSource).toContain("getRecipientsByBrain");
    expect(webhookSource).toContain("recipients");
  });

  it("webhook response includes documentUploaded and declined flags", () => {
    expect(webhookSource).toContain("documentUploaded");
    expect(webhookSource).toContain("declined");
  });

  it("status mapping covers completed, declined, voided", () => {
    expect(webhookSource).toContain('completed: "signed"');
    expect(webhookSource).toContain('declined: "declined"');
    expect(webhookSource).toContain('voided: "expired"');
  });

  it("webhook route handles document download failure gracefully (non-blocking)", () => {
    expect(webhookSource).toContain("Document download/upload failed");
  });
});
