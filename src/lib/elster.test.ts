import { describe, test, expect, vi } from "vitest";
import {
  validateElsterForm,
  buildElsterXml,
  submitElsterForm,
  getElsterConnectionStatus,
  taxReturnToElsterForm,
  isElsterEnabled,
} from "./elster";

describe("ELSTER validation", () => {
  test("validates required fields", () => {
    const errors = validateElsterForm({
      clientId: "",
      clientName: "",
      formType: "UStVA",
      period: "",
      year: 2025,
    });
    expect(errors).toContain("client_id_required");
    expect(errors).toContain("period_required");
  });

  test("validates UStVA monthly period format", () => {
    const errors = validateElsterForm({
      clientId: "c1",
      clientName: "Müller",
      formType: "UStVA",
      period: "2025-Q2",
      year: 2025,
    });
    expect(errors).toContain("period_format_monthly");
  });

  test("validates ZM quarterly period format", () => {
    const errors = validateElsterForm({
      clientId: "c1",
      clientName: "Müller",
      formType: "ZM",
      period: "2025-06",
      year: 2025,
    });
    expect(errors).toContain("period_format_quarterly");
    expect(errors).toContain("eu_country_code_invalid");
  });

  test("accepts valid UStVA form", () => {
    const errors = validateElsterForm({
      clientId: "c1",
      clientName: "Müller",
      formType: "UStVA",
      period: "2025-06",
      year: 2025,
      taxAmount: 1234.56,
    });
    expect(errors.length).toBe(0);
  });

  test("rejects negative amounts", () => {
    const errors = validateElsterForm({
      clientId: "c1",
      clientName: "Müller",
      formType: "UStVA",
      period: "2025-06",
      year: 2025,
      taxAmount: -100,
      refundAmount: -50,
    });
    expect(errors).toContain("tax_amount_negative");
    expect(errors).toContain("refund_amount_negative");
  });
});

describe("ELSTER XML builder", () => {
  test("builds XML with escaped values", () => {
    const xml = buildElsterXml({
      clientId: "c1<>",
      clientName: "Müller & Co",
      formType: "UStVA",
      period: "2025-06",
      year: 2025,
      taxAmount: 1000,
    });
    expect(xml).toContain("<DatenArt>UStVA</DatenArt>");
    expect(xml).toContain("<Kz09>1000.00</Kz09>");
    expect(xml).toContain("Müller &amp; Co");
    expect(xml).toContain("c1&lt;&gt;");
  });

  test("throws on invalid form", () => {
    expect(() =>
      buildElsterXml({
        clientId: "",
        clientName: "",
        formType: "UStVA",
        period: "",
        year: 2025,
      })
    ).toThrow();
  });
});

describe("ELSTER submission", () => {
  test("disabled mode rejects submission", async () => {
    vi.stubEnv("ELSTER_MODE", "disabled");
    await expect(
      submitElsterForm({
        clientId: "c1",
        clientName: "Müller",
        formType: "UStVA",
        period: "2025-06",
        year: 2025,
      })
    ).rejects.toThrow("ELSTER is disabled");
    vi.unstubAllEnvs();
  });

  test("sandbox mode returns submitted submission", async () => {
    vi.stubEnv("ELSTER_MODE", "sandbox");
    const submission = await submitElsterForm({
      clientId: "c1",
      clientName: "Müller",
      formType: "UStVA",
      period: "2025-06",
      year: 2025,
      taxAmount: 1234.56,
    });
    expect(submission.status).toBe("submitted");
    expect(submission.elsterReference).toMatch(/^SANDBOX-/);
    vi.unstubAllEnvs();
  });
});

describe("ELSTER connection status", () => {
  test("disabled mode reports disconnected", () => {
    vi.stubEnv("ELSTER_MODE", "disabled");
    const status = getElsterConnectionStatus();
    expect(status.connected).toBe(false);
    expect(status.mode).toBe("disabled");
    vi.unstubAllEnvs();
  });

  test("sandbox mode without cert reports disconnected", () => {
    vi.stubEnv("ELSTER_MODE", "sandbox");
    vi.stubEnv("ELSTER_CERT_B64", "");
    const status = getElsterConnectionStatus();
    expect(status.connected).toBe(false);
    expect(status.lastError).toContain("certificate");
    vi.unstubAllEnvs();
  });

  test("sandbox mode with cert reports connected", () => {
    vi.stubEnv("ELSTER_MODE", "sandbox");
    vi.stubEnv("ELSTER_CERT_B64", "dGVzdA==");
    const status = getElsterConnectionStatus();
    expect(status.connected).toBe(true);
    vi.unstubAllEnvs();
  });
});

describe("taxReturnToElsterForm", () => {
  test("maps a tax return to a form data object", () => {
    const form = taxReturnToElsterForm(
      {
        clientId: "c1",
        clientName: "Müller",
        type: "UStVA",
        year: 2025,
        taxAmount: 500,
      },
      "2025-06"
    );
    expect(form.formType).toBe("UStVA");
    expect(form.period).toBe("2025-06");
    expect(form.taxAmount).toBe(500);
  });
});

describe("isElsterEnabled", () => {
  test("returns false when mode is disabled", () => {
    vi.stubEnv("ELSTER_MODE", "disabled");
    expect(isElsterEnabled()).toBe(false);
    vi.unstubAllEnvs();
  });

  test("returns true when mode is sandbox", () => {
    vi.stubEnv("ELSTER_MODE", "sandbox");
    expect(isElsterEnabled()).toBe(true);
    vi.unstubAllEnvs();
  });
});
