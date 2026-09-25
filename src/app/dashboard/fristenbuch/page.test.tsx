import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (k: string) => k, lang: "de" }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/fristenbuch",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
let fristenData: Record<string, unknown>;
vi.mock("@/lib/queries/legal", () => ({
  useFristen: () => ({ data: fristenData, isLoading: false, isError: false, refetch: vi.fn() }),
}));

import FristenbuchPage from "./page";

const frist = {
  id: "f1",
  title: "Berufung",
  due_date: "2026-10-05",
  status: "pending",
  type: "deadline",
  source: "legal_deadline",
};

let blobs: string[];
beforeEach(() => {
  blobs = [];
  vi.stubGlobal(
    "Blob",
    class {
      constructor(parts: string[]) {
        blobs.push(parts.join(""));
      }
    }
  );
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Fristenbuch — unvollständige Daten (UIS-0-9)", () => {
  it("shows a visible warning when a deadline source failed (partial)", () => {
    fristenData = { fristen: [frist], partial: true };
    render(<FristenbuchPage />);
    expect(screen.getByTestId("fristenbuch-partial").textContent).toContain(
      "deadlines.error_partial"
    );
    // The printout carries the warning as well.
    expect(screen.getAllByText(/WARNUNG: deadlines.error_partial/).length).toBeGreaterThan(0);
  });

  it("the CSV export starts with the incompleteness warning", () => {
    fristenData = { fristen: [frist], partial: true };
    render(<FristenbuchPage />);
    fireEvent.click(screen.getByText("deadlines.fristenbuch_csv"));
    expect(blobs[0]).toContain("WARNUNG: deadlines.error_partial");
    expect(blobs[0].indexOf("WARNUNG")).toBeLessThan(blobs[0].indexOf("Datum"));
  });

  it("no warning when all sources loaded", () => {
    fristenData = { fristen: [frist] };
    render(<FristenbuchPage />);
    expect(screen.queryByTestId("fristenbuch-partial")).toBeNull();
    fireEvent.click(screen.getByText("deadlines.fristenbuch_csv"));
    expect(blobs[0]).not.toContain("WARNUNG");
  });
});
