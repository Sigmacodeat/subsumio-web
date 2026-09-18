import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RatgTariffForm, type RatgBereich, type TariffInvoiceLine } from "./RatgTariffForm";

function setup(bereich: RatgBereich) {
  const onChange = vi.fn<(lines: TariffInvoiceLine[]) => void>();
  render(<RatgTariffForm lines={[]} onChange={onChange} initialBereich={bereich} />);
  fireEvent.change(screen.getByLabelText("Leistung *"), { target: { value: "Testleistung" } });
  return onChange;
}

const add = () => fireEvent.click(screen.getByRole("button", { name: /Position berechnen/ }));

describe("RatgTariffForm", () => {
  it("Strafsachen: default Hauptverhandlung wegen sonstiger Vergehen, 1 Stunde", () => {
    const onChange = setup("straf");
    add();
    const lines = onChange.mock.calls[0][0];
    // 307,60 + 153,80 für die zweite halbe Stunde; Einheitssatz 50 %
    expect(lines.map((l) => l.amount)).toEqual([461.4, 230.7]);
    expect(lines[0].description).toContain("TP 4 Z 5");
  });

  it("Besprechung: needs a Bemessungsgrundlage", () => {
    const onChange = setup("neben");
    add();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(/Bemessungsgrundlage/);
    fireEvent.change(screen.getByLabelText("Bemessungsgrundlage in Euro *"), {
      target: { value: "10.000,00" },
    });
    add();
    expect(onChange.mock.calls[0][0].map((l) => l.amount)).toEqual([238.2]);
  });

  it("Geschäft außerhalb der Kanzlei mit Einheitssatz", () => {
    const onChange = setup("tp7");
    fireEvent.change(screen.getByLabelText("Bemessungsgrundlage in Euro *"), {
      target: { value: "1000" },
    });
    add();
    expect(onChange.mock.calls[0][0].map((l) => l.amount)).toEqual([73.6, 44.16]);
  });

  it("Reise: Zeitversäumnis ohne Einheitssatz", () => {
    const onChange = setup("tp9");
    fireEvent.change(screen.getByLabelText(/Zeitversäumnis in Stunden/), {
      target: { value: "2,5" },
    });
    add();
    expect(onChange.mock.calls[0][0].map((l) => l.amount)).toEqual([101.7]);
  });

  it("Zivilverfahren bleibt der Standard", () => {
    render(<RatgTariffForm lines={[]} onChange={vi.fn()} />);
    expect(screen.getByLabelText("Tarifpost")).toBeInTheDocument();
  });
});
