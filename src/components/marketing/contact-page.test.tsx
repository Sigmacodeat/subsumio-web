import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/at/contact",
}));
vi.mock("@/lib/use-market", () => ({
  useMarket: () => ({
    market: "at",
    p: (path: string) => `/at${path}`,
    ui: { watchDemo: "Demo" },
  }),
}));

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.IntersectionObserver ??= NoopObserver as never;
globalThis.matchMedia ??= ((q: string) => ({
  matches: false,
  media: q,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  onchange: null,
  dispatchEvent: () => false,
})) as never;

import ContactPage from "./contact-page";

describe("ContactPage — consent is the visitor's own", () => {
  it("has a required consent box next to a privacy link", () => {
    render(<ContactPage />);
    const box = screen.getByTestId("contact-consent") as HTMLInputElement;
    expect(box.required).toBe(true);
    expect(box.checked).toBe(false);
    const link = screen.getByRole("link", { name: "Datenschutzerklärung" });
    expect(link.getAttribute("href")).toBe("/at/privacy");
  });

  it("sends consent only as ticked by the visitor", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const { container } = render(<ContactPage />);
    const form = container.querySelector("form")!;
    (form.querySelector('input[name="name"]') as HTMLInputElement).value = "A";
    (form.querySelector('input[name="email"]') as HTMLInputElement).value = "a@b.at";
    // Submit without the tick (bypassing native validation) → consent false.
    fireEvent.submit(form);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const body = JSON.parse(
      String((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body)
    );
    expect(body.consent).toBe(false);
    vi.unstubAllGlobals();
  });
});
