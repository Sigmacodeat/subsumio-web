// @vitest-environment jsdom
// "Deaktivieren" in the personnel register only changes the personnel file —
// the confirmation says that the login account stays.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const confirm = vi.fn(async (_o: { message: string }) => false);
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => confirm }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
const csrfFetch = vi.fn(async () => Response.json({ data: {} }));
vi.mock("@/lib/csrf", () => ({ csrfFetch: (...a: unknown[]) => csrfFetch(...(a as [])) }));

import PersonalPage from "./page";

beforeEach(() => {
  confirm.mockClear();
  csrfFetch.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        data: {
          members: [
            {
              id: "s1",
              name: "Sam Example",
              email: "sam@kanzlei.example",
              role: "assistenz",
              vacation_days_per_year: 25,
              vacation_carryover_days: 0,
              active: true,
              created_at: "2026-01-01T00:00:00.000Z",
              updated_at: "2026-01-01T00:00:00.000Z",
              vacation: { entitlement: 25, used: 0, planned: 0, remaining: 25 },
            },
          ],
        },
      })
    )
  );
});

describe("Personal → Deaktivieren", () => {
  it("asks first and says the login account stays; cancelling changes nothing", async () => {
    render(<PersonalPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Deaktivieren/ }));
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(confirm.mock.calls[0][0].message).toMatch(/Zugang dieser Person bleibt bestehen/);
    expect(csrfFetch).not.toHaveBeenCalled();
  });
});
