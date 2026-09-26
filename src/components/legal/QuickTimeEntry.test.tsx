import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const addToast = vi.fn();
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast }) }));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ lang: "de", t: (k: string) => k }) }));

import { QuickTimeEntry } from "./QuickTimeEntry";

describe("QuickTimeEntry (audit UI-1)", () => {
  const fetchMock = vi.fn(async (..._args: unknown[]) => Response.json({ data: { id: "t1" } }));

  beforeEach(() => {
    document.cookie = "sb_csrf=test-csrf-token; path=/";
    fetchMock.mockClear();
    addToast.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends the CSRF header with the time booking", async () => {
    render(<QuickTimeEntry caseSlug="cases/2026-0001" />);
    fireEvent.click(screen.getByRole("button", { name: /Zeit buchen/ }));
    fireEvent.change(screen.getByPlaceholderText("Womit haben Sie gearbeitet?"), {
      target: { value: "Telefonat Mandant" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Speichern/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/time");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("x-csrf-token")).toBe("test-csrf-token");
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: "success" }))
    );
  });

  it("reports a rejected booking as an error, not as success", async () => {
    fetchMock.mockImplementationOnce(async () =>
      Response.json({ error: "csrf_token_invalid" }, { status: 403 })
    );
    render(<QuickTimeEntry caseSlug="cases/2026-0001" />);
    fireEvent.click(screen.getByRole("button", { name: /Zeit buchen/ }));
    fireEvent.change(screen.getByPlaceholderText("Womit haben Sie gearbeitet?"), {
      target: { value: "Telefonat Mandant" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Speichern/ }));
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: "error" }))
    );
    expect(addToast).not.toHaveBeenCalledWith(expect.objectContaining({ type: "success" }));
  });
});
