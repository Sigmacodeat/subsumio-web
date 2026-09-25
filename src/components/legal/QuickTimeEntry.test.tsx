import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QuickTimeEntry } from "./QuickTimeEntry";

vi.mock("@/lib/use-lang", () => ({
  useLang: () => ({ lang: "de", t: (key: string) => key, setLang: vi.fn() }),
}));

const addToast = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ addToast }),
}));

function openForm() {
  render(<QuickTimeEntry caseSlug="legal/cases/abc" />);
  fireEvent.click(screen.getByRole("button", { name: /zeit buchen/i }));
  fireEvent.change(screen.getByPlaceholderText(/womit haben sie gearbeitet/i), {
    target: { value: "Recherche BGB" },
  });
  fireEvent.click(screen.getByRole("button", { name: /speichern/i }));
}

describe("QuickTimeEntry", () => {
  beforeEach(() => {
    addToast.mockClear();
    document.cookie = "sb_csrf=test-csrf-token";
  });

  it("sends the CSRF token header on the time-entry POST", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    openForm();

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/time");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("x-csrf-token")).toBe("test-csrf-token");
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: "success" }))
    );
  });

  it("shows an error toast instead of a success when the save fails", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "Speichern fehlgeschlagen" }), { status: 500 })
      );
    vi.stubGlobal("fetch", fetchSpy);

    openForm();

    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: "error", title: "Speichern fehlgeschlagen" })
      )
    );
    expect(addToast).not.toHaveBeenCalledWith(expect.objectContaining({ type: "success" }));
  });
});
