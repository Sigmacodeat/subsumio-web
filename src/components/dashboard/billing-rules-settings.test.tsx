import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BillingRulesSettings } from "./billing-rules-settings";

describe("BillingRulesSettings (OPS-16)", () => {
  it("is a switch, off by default, and reports changes", () => {
    const onChange = vi.fn();
    render(
      <BillingRulesSettings enabled={false} onEnabledChange={onChange} abrechnungstakt="10" />
    );
    const box = screen.getByRole("checkbox");
    expect((box as HTMLInputElement).checked).toBe(false);
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
    expect(screen.getByText(/wirkt erst nach dem Einschalten/)).toBeTruthy();
  });

  it("previews 22 min at Takt 10 → 30 min and the rate sources in order", () => {
    render(
      <BillingRulesSettings
        enabled
        onEnabledChange={() => {}}
        abrechnungstakt="10"
        stundensatz="200"
        rechtsgebietSaetze={{ arbeitsrecht: 230 }}
        areaLabel={(k) => (k === "arbeitsrecht" ? "Arbeitsrecht" : k)}
      />
    );
    const rounding = screen.getByTestId("billing-rules-example-rounding").textContent ?? "";
    expect(rounding).toContain("Erfasst 22 Minuten, Takt 10 Minuten → verrechnet 30 Minuten.");
    expect(rounding).toContain("115,00 €");
    const sources = screen.getByTestId("billing-rules-example-sources").textContent ?? "";
    expect(sources.indexOf("Honorarvereinbarung")).toBeLessThan(
      sources.indexOf("Satz je Rechtsgebiet")
    );
    expect(sources.indexOf("Satz je Rechtsgebiet")).toBeLessThan(
      sources.indexOf("Kanzlei-Stundensatz")
    );
    expect(sources).toContain("Arbeitsrecht: 230,00 €/h");
    expect(sources).toContain("200,00 €/h");
  });

  it("warns about an invalid increment while switched on", () => {
    render(<BillingRulesSettings enabled onEnabledChange={() => {}} abrechnungstakt="90" />);
    expect(screen.getByText(/Kein gültiger Abrechnungstakt/)).toBeTruthy();
  });

  it("RATG: no automatic calculation, links to the tariff calculator", () => {
    render(<BillingRulesSettings enabled={false} onEnabledChange={() => {}} tarifModell="ratg" />);
    const hint = screen.getByTestId("billing-rules-ratg");
    expect(hint.textContent).toContain("nicht automatisch berechnet");
    expect(hint.querySelector("a")?.getAttribute("href")).toBe("/dashboard/invoicing");
  });
});
