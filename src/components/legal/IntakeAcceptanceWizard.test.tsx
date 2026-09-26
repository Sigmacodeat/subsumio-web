import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { poaStepComplete } from "./IntakeAcceptanceWizard";

describe("poaStepComplete (W4-04)", () => {
  it("a ticked 'signed' without a linked power of attorney is not enough", () => {
    expect(poaStepComplete({ required: true, status: "signed" })).toBe(false);
  });
  it("a linked, signed power of attorney completes the step", () => {
    expect(
      poaStepComplete({ required: true, status: "signed", poa_slug: "legal/poa/poa-1" })
    ).toBe(true);
  });
  it("no power of attorney needed completes the step", () => {
    expect(poaStepComplete({ required: false, status: "not_required" })).toBe(true);
  });
  it("pending is open", () => {
    expect(poaStepComplete({ required: true, status: "pending" })).toBe(false);
  });
});
