// @vitest-environment node

import { describe, test, expect } from "vitest";
import { signatureRequestSchema } from "./signature";

describe("signatureRequestSchema", () => {
  test("accepts valid signature request", () => {
    const result = signatureRequestSchema.safeParse({
      documentName: "Vertrag.pdf",
      recipientEmail: "signer@example.com",
      expiresDays: "14",
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid email", () => {
    const result = signatureRequestSchema.safeParse({
      documentName: "Vertrag.pdf",
      recipientEmail: "not-an-email",
      expiresDays: "14",
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty documentName", () => {
    const result = signatureRequestSchema.safeParse({
      documentName: "",
      recipientEmail: "signer@example.com",
      expiresDays: "14",
    });
    expect(result.success).toBe(false);
  });

  test("applies default expiresDays", () => {
    const result = signatureRequestSchema.parse({
      documentName: "Vertrag.pdf",
      recipientEmail: "signer@example.com",
    });
    expect(result.expiresDays).toBe("14");
  });
});
