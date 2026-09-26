// @vitest-environment jsdom
// UIS-3-14: a failed load shows an error with retry, never "Keine Bestandsakten".
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const listAllPages = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/api", () => ({
  api: {
    brain: {
      listAllPages: (...a: unknown[]) => listAllPages(...a),
      getPage: vi.fn(async () => null),
    },
  },
}));
vi.mock("@/lib/csrf", () => ({ csrfFetch: vi.fn() }));
// Stable toast: the page reloads whenever `addToast` changes identity.
const toast = vi.hoisted(() => ({ addToast: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => toast }));
vi.mock("@/lib/use-lang", async () => {
  const actual = await vi.importActual<typeof import("@/content/dashboard")>("@/content/dashboard");
  const t = actual.createT("de");
  return { useLang: () => ({ lang: "de", t, setLang: vi.fn() }) };
});

import { D } from "@/content/dashboard";
import AltlastenPage from "./page";

beforeEach(() => {
  listAllPages.mockReset();
});

describe("altlasten page", () => {
  it("shows a load error instead of the empty state", async () => {
    listAllPages.mockRejectedValue(new Error("engine down"));
    render(<AltlastenPage />);
    expect(await screen.findByText(D["altlasten.err_load"].de)).toBeInTheDocument();
    expect(screen.queryByText("Keine Bestandsakten")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeInTheDocument();
  });
});
