// @vitest-environment jsdom
// UIS-0-19: the queued scan shows a German status, not the raw "queued".
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/api", () => ({
  api: {
    legal: {
      caseScan: vi.fn(async () => ({
        success: true,
        job_id: "job-1",
        status: "queued",
        look_ahead_days: 7,
        evidence_threshold: 1,
        max_cases: 50,
      })),
    },
  },
}));
vi.mock("@/lib/use-lang", async () => {
  const actual = await vi.importActual<typeof import("@/content/dashboard")>("@/content/dashboard");
  const t = actual.createT("de");
  return { useLang: () => ({ lang: "de", t, setLang: vi.fn() }) };
});

import { D } from "@/content/dashboard";
import CaseScannerPage from "./page";

describe("case scanner page", () => {
  it("labels the queued job in German", async () => {
    render(<CaseScannerPage />);
    fireEvent.click(screen.getByRole("button", { name: D["scanner.start"].de }));
    expect(await screen.findByText(D["scanner.status_queued"].de)).toBeInTheDocument();
    expect(screen.queryByText("queued")).not.toBeInTheDocument();
  });
});
