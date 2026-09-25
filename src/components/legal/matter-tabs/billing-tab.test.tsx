import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (k: string) => k, lang: "de" }) }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/cases/a",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/api", () => ({ api: { time: { unbill: vi.fn() } } }));
const addToast = vi.fn();
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast }) }));

const saveCaseUpdate = vi.fn();
const setTimeEntries = vi.fn();
const timeEntries = [
  {
    id: "te-billed",
    description: "Klage verfasst",
    minutes: 120,
    date: "2026-09-01T10:00:00Z",
    billable: true,
    billed: true,
    invoice_number: "R-1",
  },
  {
    id: "te-open",
    description: "Telefonat",
    minutes: 15,
    date: "2026-09-02T10:00:00Z",
    billable: true,
    billed: false,
  },
];
vi.mock("@/lib/matter-detail-context", () => ({
  useMatterDetail: () => ({
    caseData: { slug: "cases/a", status: "active" },
    timeEntries,
    setTimeEntries,
    saveCaseUpdate,
    setSaveError: vi.fn(),
    expensesList: [],
    unbilledExpenses: 0,
    expenseForm: { register: () => ({}), handleSubmit: () => () => undefined },
    onExpenseSubmit: vi.fn(),
    deleteExpense: vi.fn(),
    unbillExpense: vi.fn(),
  }),
}));

import { BillingTab } from "./billing-tab";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BillingTab — Zeiteinträge löschen (UIS-3-4)", () => {
  it("offers no delete button for a billed entry", () => {
    render(<BillingTab />);
    const deletes = screen.getAllByRole("button", { name: "cases.detail_time_delete" });
    // Only the open entry can be deleted.
    expect(deletes).toHaveLength(1);
  });

  it("asks before deleting and does nothing when the user cancels", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<BillingTab />);
    fireEvent.click(screen.getByRole("button", { name: "cases.detail_time_delete" }));
    expect(confirm).toHaveBeenCalledWith("cases.detail_time_delete_confirm");
    expect(saveCaseUpdate).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("deletes the open entry after confirmation and keeps the billed one", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<BillingTab />);
    fireEvent.click(screen.getByRole("button", { name: "cases.detail_time_delete" }));
    expect(saveCaseUpdate).toHaveBeenCalledWith({ timeEntries: [timeEntries[0]] });
    confirm.mockRestore();
  });
});
