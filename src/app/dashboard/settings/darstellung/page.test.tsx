// @vitest-environment jsdom
// Einstellungen → Darstellung: Radiogruppen sind beschriftet, eine Auswahl
// wirkt sofort auf <html> und landet im Storage; das Farbschema nutzt den
// bestehenden subsumio-theme-Mechanismus (Key + Ereignis), nicht einen eigenen.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { A11Y_STORAGE_KEY } from "@/lib/a11y-preferences";
import { THEME_STORAGE_KEY } from "@/lib/theme-init-script";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/settings/darstellung",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/use-lang", async () => {
  const { createT } = await import("@/content/dashboard");
  return { useLang: () => ({ lang: "de", t: createT("de"), setLang: vi.fn() }) };
});

import DarstellungSettingsPage from "./page";

const ATTRS = ["data-font-scale", "data-contrast", "data-motion", "data-theme"] as const;

beforeEach(() => {
  localStorage.clear();
  for (const a of ATTRS) document.documentElement.removeAttribute(a);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn() }));
});
afterEach(() => {
  localStorage.clear();
  for (const a of ATTRS) document.documentElement.removeAttribute(a);
  vi.unstubAllGlobals();
});

describe("Darstellung", () => {
  it("zeigt vier beschriftete Radiogruppen mit Standardauswahl", () => {
    render(<DarstellungSettingsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Darstellung" })).toBeInTheDocument();
    for (const name of ["Schriftgröße", "Kontrast", "Bewegung reduzieren", "Farbschema"]) {
      expect(screen.getByRole("group", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("radio", { name: /100 %/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /^Standard$/ })).toBeChecked();
  });

  it("wendet Schriftgröße und Kontrast sofort an und speichert sie", () => {
    render(<DarstellungSettingsPage />);
    fireEvent.click(screen.getByRole("radio", { name: /125 %/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Erhöht/ }));
    expect(document.documentElement.getAttribute("data-font-scale")).toBe("125");
    expect(document.documentElement.getAttribute("data-contrast")).toBe("high");
    expect(JSON.parse(localStorage.getItem(A11Y_STORAGE_KEY) ?? "{}")).toMatchObject({
      fontScale: "125",
      contrast: "high",
    });
    expect(screen.getByRole("status")).toHaveTextContent(/Gespeichert/);
  });

  it("schaltet das Farbschema über den bestehenden subsumio-theme-Mechanismus", () => {
    const changed = vi.fn();
    window.addEventListener("subsumio:theme-change", changed);
    render(<DarstellungSettingsPage />);
    fireEvent.click(screen.getByRole("radio", { name: /Dunkel/ }));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(changed).toHaveBeenCalledTimes(1);
    const themeGroup = within(screen.getByRole("group", { name: "Farbschema" }));
    fireEvent.click(themeGroup.getByRole("radio", { name: /System/ }));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    window.removeEventListener("subsumio:theme-change", changed);
  });

  it("liest gespeicherte Werte beim Öffnen und setzt alles zurück", () => {
    localStorage.setItem(
      A11Y_STORAGE_KEY,
      JSON.stringify({ fontScale: "112", contrast: "high", motion: "reduce" })
    );
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    render(<DarstellungSettingsPage />);
    expect(screen.getByRole("radio", { name: /112 %/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: /Hell/ })).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: /Auf Standard zurücksetzen/ }));
    expect(localStorage.getItem(A11Y_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.getAttribute("data-font-scale")).toBeNull();
    expect(screen.getByRole("radio", { name: /100 %/ })).toBeChecked();
  });

  it("verlinkt die Barrierefreiheitserklärung", () => {
    render(<DarstellungSettingsPage />);
    expect(screen.getByRole("link", { name: /Barrierefreiheitserklärung/ })).toHaveAttribute(
      "href",
      "/at/barrierefreiheit"
    );
  });
});
