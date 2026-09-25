// @vitest-environment jsdom
// KYC page: sanctions toast reads the unwrapped response (UIS-2-1), a failed
// list read is an error (UIS-2-8), verify asks first (UIS-2-8), a recorded
// hit is not unticked by hand (OPS-8).
import { beforeEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const addToast = vi.hoisted(() => vi.fn());
const csrfFetch = vi.hoisted(() => vi.fn());
const mockConfirm = vi.hoisted(() => vi.fn(async () => true));

vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast }) }));
vi.mock("@/lib/csrf", () => ({ csrfFetch: (...a: unknown[]) => csrfFetch(...a) }));
vi.mock("@/components/ui/confirm-dialog", () => ({
  useConfirm: () => mockConfirm,
  ConfirmProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/api", () => ({
  api: { brain: { listAllPages: vi.fn(async () => []) }, upload: { file: vi.fn() } },
}));
vi.mock("@/lib/use-lang", async () => {
  const actual = await vi.importActual<typeof import("@/content/dashboard")>("@/content/dashboard");
  return { useLang: () => ({ lang: "de", t: actual.createT("de"), setLang: vi.fn() }) };
});

import KYCPage from "./page";

const base = {
  id: "k1",
  case_slug: "legal/cases/m1",
  client_name: "Alice Example",
  party_type: "natural",
  status: "in_progress",
  provider: "manual",
  pep_check: true,
  risk_level: "low",
  risk_factors: [],
  transparenzregister_checked: false,
  created_at: "2026-09-01",
  updated_at: "2026-09-01",
};

let listItems: Array<Record<string, unknown>>;
let listStatus: number;

beforeEach(() => {
  vi.clearAllMocks();
  listItems = [base];
  listStatus = 200;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      listStatus === 200
        ? Response.json({ data: { items: listItems, expiring: [] } })
        : new Response("x", { status: listStatus })
    )
  );
});

async function openRecord() {
  render(<KYCPage />);
  fireEvent.click(await screen.findByRole("button", { name: /Alice Example/ }));
}

describe("KYC page", () => {
  test("reports a sanctions hit as a hit (response data is already unwrapped)", async () => {
    csrfFetch.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.action === "sanctions_check") {
        return Response.json({
          data: { verification: { ...base, sanctions_hit: true, sanctions_source: "EU" } },
        });
      }
      return Response.json({ data: { verification: base, missing: [] } });
    });
    await openRecord();
    fireEvent.click(screen.getByRole("button", { name: /Jetzt abgleichen/ }));
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: "error", title: "Treffer auf der Sanktionsliste" })
      )
    );
  });

  test("a failed list read shows an error instead of an empty list", async () => {
    listStatus = 500;
    render(<KYCPage />);
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: "error" }))
    );
  });

  test("closing the check asks first; declining sends nothing", async () => {
    mockConfirm.mockResolvedValueOnce(false);
    await openRecord();
    fireEvent.click(screen.getByRole("button", { name: /Prüfung abschließen/ }));
    await waitFor(() => expect(mockConfirm).toHaveBeenCalled());
    expect(csrfFetch).not.toHaveBeenCalled();
  });

  test("server error text comes from `error` (apiError shape)", async () => {
    csrfFetch.mockResolvedValue(
      Response.json(
        { error: "Die Identitätsprüfung ist noch nicht vollständig.", code: "kyc_incomplete" },
        { status: 422 }
      )
    );
    await openRecord();
    fireEvent.click(screen.getByRole("button", { name: /^Speichern$/ }));
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Die Identitätsprüfung ist noch nicht vollständig." })
      )
    );
  });

  test("a recorded sanctions hit cannot be unticked by hand", async () => {
    listItems = [{ ...base, sanctions_hit: true, sanctions_checked_at: "2026-09-20" }];
    await openRecord();
    const box = screen.getByRole("checkbox", { name: /Treffer auf einer Sanktionsliste/ });
    expect((box as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole("button", { name: /Treffer als ausgeräumt erfassen/ })).toBeTruthy();
  });
});
