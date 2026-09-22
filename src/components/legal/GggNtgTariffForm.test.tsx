import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GggTariffForm } from "./GggTariffForm";
import { NtgTariffForm } from "./NtgTariffForm";
import type { TariffInvoiceLine } from "./RatgTariffForm";

describe("GggTariffForm", () => {
  it("rechnet TP 1 und fügt die Position hinzu", () => {
    const onChange = vi.fn<(lines: TariffInvoiceLine[]) => void>();
    render(<GggTariffForm lines={[]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Position *"), {
      target: { value: "Klage HG Wien" },
    });
    fireEvent.change(screen.getByLabelText(/Streitwert/), { target: { value: "10.000,00" } });
    fireEvent.click(screen.getByRole("button", { name: /Gebühr berechnen/ }));
    const lines = onChange.mock.calls[0][0];
    expect(lines).toHaveLength(1);
    expect(lines[0].id).toMatch(/^ggg-/);
    expect(lines[0].amount).toBe(792);
    expect(lines[0].description).toContain("TP1");
  });

  it("zeigt Fehler ohne Streitwert", () => {
    const onChange = vi.fn<(lines: TariffInvoiceLine[]) => void>();
    render(<GggTariffForm lines={[]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Position *"), { target: { value: "Klage" } });
    fireEvent.click(screen.getByRole("button", { name: /Gebühr berechnen/ }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(/Streitwert/);
  });
});

describe("NtgTariffForm", () => {
  it("rechnet die Wertgebühr § 18 und fügt die Position hinzu", () => {
    const onChange = vi.fn<(lines: TariffInvoiceLine[]) => void>();
    render(<NtgTariffForm lines={[]} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Position *"), {
      target: { value: "Notariatsakt Kaufvertrag" },
    });
    fireEvent.change(screen.getByLabelText(/Bemessungsgrundlage/), {
      target: { value: "200" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Gebühr berechnen/ }));
    const lines = onChange.mock.calls[0][0];
    expect(lines[0].id).toMatch(/^ntg-/);
    expect(lines[0].amount).toBe(23.5);
    expect(lines[0].description).toContain("§ 18 Abs 1");
  });
});
