import { describe, it, expect } from "vitest";
import {
  createCapturedSignature,
  validateCaptureInput,
  deriveLegalLevel,
  LEGAL_LEVEL_LABELS,
  type CaptureInput,
} from "./signature-capture";

const validBase: CaptureInput = {
  document_slug: "legal/poa/poa-123",
  document_type: "power_of_attorney",
  signer_name: "Max Mustermann",
  signature_format: "canvas_png",
  signature_data: "data:image/png;base64,iVBORw0KGgo=",
};

describe("signature-capture", () => {
  it("creates a captured signature with id and timestamp", () => {
    const sig = createCapturedSignature(validBase);
    expect(sig.id).toMatch(/^sig-\d+-/);
    expect(sig.captured_at).toBeTruthy();
    expect(sig.signer_name).toBe("Max Mustermann");
    expect(sig.document_slug).toBe("legal/poa/poa-123");
  });

  it("derives legal level simple for canvas_png", () => {
    expect(deriveLegalLevel("canvas_png")).toBe("simple");
    expect(deriveLegalLevel("canvas_svg")).toBe("simple");
    expect(deriveLegalLevel("typed_name")).toBe("simple");
  });

  it("derives legal level advanced for docusign", () => {
    expect(deriveLegalLevel("docusign")).toBe("advanced");
  });

  it("allows explicit legal_level override (e.g. qualified)", () => {
    const sig = createCapturedSignature({ ...validBase, legal_level: "qualified" });
    expect(sig.legal_level).toBe("qualified");
  });

  it("validates missing document_slug", () => {
    expect(validateCaptureInput({ ...validBase, document_slug: "" })).toBe(
      "missing_document_slug"
    );
  });

  it("validates missing signer_name", () => {
    expect(validateCaptureInput({ ...validBase, signer_name: "" })).toBe(
      "missing_signer_name"
    );
  });

  it("validates missing signature_data", () => {
    expect(validateCaptureInput({ ...validBase, signature_data: "" })).toBe(
      "missing_signature_data"
    );
  });

  it("validates typed_name too short", () => {
    expect(
      validateCaptureInput({
        ...validBase,
        signature_format: "typed_name",
        signature_data: "M",
      })
    ).toBe("typed_name_too_short");
  });

  it("validates canvas_png must start with data:image/png", () => {
    expect(
      validateCaptureInput({
        ...validBase,
        signature_data: "not-a-png",
      })
    ).toBe("invalid_png_data");
  });

  it("accepts valid typed_name input", () => {
    expect(
      validateCaptureInput({
        ...validBase,
        signature_format: "typed_name",
        signature_data: "Max Mustermann",
      })
    ).toBeNull();
  });

  it("accepts valid canvas_png input", () => {
    expect(validateCaptureInput(validBase)).toBeNull();
  });

  it("has legal level labels with warnings for DACH", () => {
    expect(LEGAL_LEVEL_LABELS.simple.warning_de).toContain("qES");
    expect(LEGAL_LEVEL_LABELS.qualified.warning_de).toContain("gleichgestellt");
    expect(LEGAL_LEVEL_LABELS.advanced.warning_de).toBeTruthy();
  });
});
