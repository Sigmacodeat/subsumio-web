// @vitest-environment jsdom
// UIS-4-7: the coverage status of an inquiry can be changed in the list.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const csrfFetch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/csrf", () => ({ csrfFetch: (...a: unknown[]) => csrfFetch(...a) }));
vi.mock("@/lib/api", () => ({ api: { brain: { listAllPages: vi.fn(async () => []) } } }));
vi.mock("@/lib/use-lang", async () => {
  const actual = await vi.importActual<typeof import("@/content/dashboard")>("@/content/dashboard");
  const t = actual.createT("de");
  return { useLang: () => ({ lang: "de", t, setLang: vi.fn() }) };
});

import LegalInsurancePage from "./page";

const item = {
  id: "rsv-1-abc",
  case_slug: "legal/cases/m1",
  client_name: "Alice Example",
  insurance_provider: "Versicherung A",
  coverage_status: "pending",
  created_at: "2026-09-01T08:00:00.000Z",
  updated_at: "2026-09-01T08:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ data: { items: [item] } }))
  );
});

describe("legal insurance page", () => {
  it("sends the new coverage status", async () => {
    csrfFetch.mockResolvedValue(Response.json({ data: { rsv: { ...item } } }));
    render(<LegalInsurancePage />);
    const select = await screen.findByLabelText("Deckungsstatus ändern: Alice Example");
    fireEvent.change(select, { target: { value: "approved" } });
    await waitFor(() => expect(csrfFetch).toHaveBeenCalled());
    const [url, init] = csrfFetch.mock.calls[0];
    expect(url).toBe("/api/legal-insurance");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ id: "rsv-1-abc", coverage_status: "approved" });
  });

  it("shows the server's error when the change is refused", async () => {
    csrfFetch.mockResolvedValue(
      Response.json({ error: "Deckungsanfrage nicht gefunden", code: "not_found" }, { status: 404 })
    );
    render(<LegalInsurancePage />);
    fireEvent.change(await screen.findByLabelText("Deckungsstatus ändern: Alice Example"), {
      target: { value: "denied" },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Deckungsanfrage nicht gefunden");
  });
});
