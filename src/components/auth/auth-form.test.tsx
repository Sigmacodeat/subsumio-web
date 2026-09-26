import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/at/signup",
}));
vi.mock("@/lib/use-market", () => ({
  useMarket: () => ({ market: "at", p: (path: string) => `/at${path}` }),
}));

// Motion components observe visibility; jsdom has no IntersectionObserver.
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

import AuthForm from "./auth-form";

describe("AuthForm signup — contract acceptance", () => {
  it("shows required boxes with links to AGB, Datenschutzerklärung and AVV", async () => {
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 404 })) as never;
    render(<AuthForm mode="signup" />);
    const group = await screen.findByTestId("signup-legal");
    const boxes = group.querySelectorAll('input[type="checkbox"]');
    expect(boxes).toHaveLength(2);
    boxes.forEach((b) => expect((b as HTMLInputElement).required).toBe(true));
    const hrefs = [...group.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/at/terms", "/at/privacy", "/at/dpa"]);
  });

  it("login shows no contract boxes", async () => {
    globalThis.fetch = vi.fn(async () => new Response("{}", { status: 404 })) as never;
    render(<AuthForm mode="login" />);
    await screen.findAllByRole("button");
    expect(screen.queryByTestId("signup-legal")).toBeNull();
  });
});
