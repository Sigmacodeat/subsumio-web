import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProposalParams } from "./planning-mode-panel";

vi.mock("@/lib/use-lang", () => ({
  useLang: () => ({ lang: "de", t: (key: string) => key, setLang: vi.fn() }),
}));
vi.mock("@/lib/csrf", () => ({ csrfFetch: vi.fn() }));

describe("ProposalParams", () => {
  it("shows every recipient and the whole text readable, not as tiny cut-off JSON", () => {
    const text = "Sehr geehrte Frau Kollegin, " + "Absatz. ".repeat(250);
    const { container } = render(
      <ProposalParams
        params={{
          to: ["a@example.com", "b@example.com", "c@extern.example"],
          subject: "Fristerstreckung",
          text,
        }}
      />
    );
    for (const r of ["a@example.com", "b@example.com", "c@extern.example"]) {
      expect(screen.getByText(r)).toBeInTheDocument();
    }
    expect(screen.getByText(text.trim(), { normalizer: (s) => s.trim() })).toBeInTheDocument();
    const dl = container.querySelector("dl")!;
    expect(dl.className).toMatch(/\btext-xs\b/);
    expect(dl.className).not.toMatch(/text-\[8px\]|max-h-20/);
  });
});
