// @vitest-environment jsdom
// Einstellungen → Verrechnung (UIS-3-6): after a failed read of the firm
// settings, saving is locked; the SMTP password is never prefilled (OPS-18).
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const loadStrict = vi.hoisted(() => vi.fn());
const save = vi.hoisted(() => vi.fn());
// Stable hook results — fresh objects per render would loop the page's effects.
const q = vi.hoisted(() => ({
  me: { data: { user: { role: "admin", plan: "team" } }, isLoading: false },
  team: { data: { members: [] } },
  keys: { data: undefined, refetch: () => undefined },
  mutation: { mutateAsync: async () => undefined },
  stats: { data: undefined, refetch: () => undefined },
  params: new URLSearchParams("tab=kanzlei"),
  lang: null as null | Record<string, unknown>,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => q.params,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/dashboard/settings",
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/lib/kanzlei-settings", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/kanzlei-settings")>("@/lib/kanzlei-settings");
  return {
    ...actual,
    loadKanzleiSettingsStrict: (...a: unknown[]) => loadStrict(...a),
    saveKanzleiSettings: (...a: unknown[]) => save(...a),
  };
});
vi.mock("@/lib/queries/auth", () => ({ useMe: () => q.me }));
vi.mock("@/lib/queries/settings", () => ({
  useTeam: () => q.team,
  useSettingsApiKeys: () => q.keys,
  useSaveSettingsApiKeys: () => q.mutation,
  useUpdateTeamRole: () => q.mutation,
}));
vi.mock("@/lib/queries/brain", () => ({ useBrainStats: () => q.stats }));
vi.mock("@/lib/use-unsaved-changes", () => ({ useUnsavedChanges: vi.fn() }));
vi.mock("@/components/dashboard/acl-settings", () => ({ AclSettings: () => null }));
vi.mock("@/components/dashboard/settings-hub", () => ({ SettingsHub: () => null }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock("@/lib/csrf", () => ({ csrfFetch: vi.fn(async () => Response.json({})) }));
vi.mock("@/lib/use-lang", async () => {
  const actual = await vi.importActual<typeof import("@/content/dashboard")>("@/content/dashboard");
  if (!q.lang) q.lang = { lang: "de", t: actual.createT("de"), setLang: () => undefined };
  return { useLang: () => q.lang };
});

import SettingsPage from "./page";
import { normalizeKanzleiSettings } from "@/lib/kanzlei-settings";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({}))
  );
});

const saveButton = () =>
  screen.getByRole("button", { name: /^Einstellungen speichern$|^Gespeichert$/ });

describe("Settings → Verrechnung", () => {
  test("a failed read locks saving and explains why", async () => {
    loadStrict.mockRejectedValue(new Error("HTTP 503"));
    render(<SettingsPage />);
    expect(await screen.findByText(/Speichern ist gesperrt/)).toBeTruthy();
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });

  test("after a successful read saving is possible; the password field stays empty", async () => {
    loadStrict.mockResolvedValue(
      normalizeKanzleiSettings({ kanzleiName: "Kanzlei A", smtpPasswordSet: true })
    );
    render(<SettingsPage />);
    await waitFor(() => expect((saveButton() as HTMLButtonElement).disabled).toBe(false));
    const pw = document.getElementById("settings-smtp-password") as HTMLInputElement;
    expect(pw.value).toBe("");
    expect(pw.placeholder).toMatch(/Gespeichert/);
  });
});
