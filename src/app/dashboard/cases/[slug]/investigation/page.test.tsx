import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Suspense } from "react";
import { describe, expect, it, vi } from "vitest";
import InvestigationLauncherPage from "./page";

const push = vi.fn();
const caseInvestigation = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ lang: "de" }) }));
vi.mock("@/lib/api", () => ({
  api: { legal: { caseInvestigation: (...a: unknown[]) => caseInvestigation(...a) } },
}));

describe("Sachverhaltsprüfung starten", () => {
  it("renders without the matter layout and starts a run for the matter in the URL", async () => {
    caseInvestigation.mockResolvedValue({ run_id: "r1" });
    const params = Promise.resolve({ slug: encodeURIComponent("legal/cases/a") });
    await act(async () => {
      render(
        <Suspense fallback={null}>
          <InvestigationLauncherPage params={params} />
        </Suspense>
      );
    });
    await userEvent.click(
      await screen.findByRole("button", { name: /Neue Sachverhaltsprüfung starten/ })
    );
    expect(caseInvestigation).toHaveBeenCalledWith(
      expect.objectContaining({ case_slug: "legal/cases/a" })
    );
    expect(push).toHaveBeenCalledWith("/dashboard/cases/legal%2Fcases%2Fa/investigation/r1");
  });
});
