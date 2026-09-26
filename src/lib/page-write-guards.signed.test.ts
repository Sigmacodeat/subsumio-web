// @vitest-environment node
import { describe, expect, it } from "vitest";
import { checkSignedDocumentWrite } from "@/lib/page-write-guards";

const signedPoa = {
  slug: "legal/poa/1",
  type: "power_of_attorney",
  content: "Ich bevollmächtige …",
  frontmatter: {
    type: "power_of_attorney",
    status: "signed",
    signed_at: "2026-09-20T10:00:00Z",
    signature_id: "sig-portal-abc",
    signed_document_hash: "a".repeat(64),
  },
};

describe("checkSignedDocumentWrite", () => {
  it("refuses an edit of the signed text", () => {
    const r = checkSignedDocumentWrite(signedPoa, { mode: "merge", content: "andere Fassung" });
    expect(r?.error).toBe("document_signed");
    expect(r?.status).toBe(409);
  });

  it("refuses replacing the signed document or altering its signature evidence", () => {
    expect(checkSignedDocumentWrite(signedPoa, { mode: "replace" })?.error).toBe("document_signed");
    expect(
      checkSignedDocumentWrite(signedPoa, {
        mode: "merge",
        frontmatter: { signed_document_hash: "b".repeat(64) },
      })?.error
    ).toBe("document_signed");
  });

  it("allows status bookkeeping such as revoking a signed power of attorney", () => {
    expect(
      checkSignedDocumentWrite(signedPoa, {
        mode: "merge",
        content: signedPoa.content,
        frontmatter: { status: "revoked", revoked_at: "2026-09-25" },
      })
    ).toBeNull();
  });

  it("leaves unsigned documents and other page types alone", () => {
    expect(
      checkSignedDocumentWrite(
        { ...signedPoa, frontmatter: { type: "power_of_attorney", status: "sent" } },
        { mode: "merge", content: "neu" }
      )
    ).toBeNull();
    expect(
      checkSignedDocumentWrite(
        { type: "note", content: "x", frontmatter: { status: "signed" } },
        { mode: "merge", content: "y" }
      )
    ).toBeNull();
  });
});
