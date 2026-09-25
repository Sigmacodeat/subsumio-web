import { describe, expect, it } from "vitest";
import {
  formatObligationDate,
  obligationTypeLabel,
  recurringLabel,
  urgencyLabel,
} from "./obligation-labels";

describe("obligation labels", () => {
  it("German labels instead of raw English values", () => {
    expect(urgencyLabel("critical")).toBe("kritisch");
    expect(obligationTypeLabel("termination")).toBe("Kündigung");
    expect(recurringLabel("monthly")).toBe("monatlich");
  });

  it("ISO dates in Austrian form, without a UTC day shift", () => {
    expect(formatObligationDate("2026-01-01")).toBe("01.01.2026");
    expect(formatObligationDate("2026-03-29T00:00:00Z")).toBe("29.03.2026");
    expect(formatObligationDate("30 Tage nach Lieferung")).toBe("30 Tage nach Lieferung");
  });
});
