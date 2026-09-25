import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const csrf = vi.hoisted(() => ({
  fn: vi.fn(async () => Response.json({ slug: "agents/templates/pruefung", success: true })),
}));
vi.mock("@/lib/csrf", () => ({ csrfFetch: csrf.fn }));
vi.mock("@/lib/use-lang", () => ({
  useLang: () => ({ lang: "de", t: (k: string) => k, setLang: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/dashboard/workflows/builder",
}));

import WorkflowBuilderPage from "./page";

afterEach(() => {
  vi.unstubAllGlobals();
  csrf.fn.mockClear();
  window.history.replaceState(null, "", "/");
});

describe("Workflow builder — editing", () => {
  it("opens ?template=… and saves back into the same template (PATCH, no new one)", async () => {
    window.history.replaceState(null, "", "/?template=agents%2Ftemplates%2Fpruefung");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          slug: "agents/templates/pruefung",
          name: "Prüfung",
          description: "d",
          steps: [{ id: "s1", specialist: "analyze", prompt: "Analysiere" }],
        })
      )
    );
    render(<WorkflowBuilderPage />);
    await waitFor(() => expect(screen.getByDisplayValue("Prüfung")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Ablauf speichern"));
    await waitFor(() => expect(csrf.fn).toHaveBeenCalled());
    const [url, init] = csrf.fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("PATCH");
    expect(url).toBe(`/api/agent-templates/${encodeURIComponent("agents/templates/pruefung")}`);
  });
});
