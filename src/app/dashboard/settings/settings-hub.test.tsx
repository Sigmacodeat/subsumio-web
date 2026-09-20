import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsHub } from "@/components/dashboard/settings-hub";

vi.mock("@/lib/use-lang", () => ({
  useLang: () => ({
    lang: "de",
    t: (key: string) => {
      const map: Record<string, string> = {
        "settings.hub_search_placeholder": "Suchen …",
        "settings.hub_no_results": "Keine Ergebnisse",
        "settings.notification_warning_label": "E-Mail nicht eingerichtet",
        "settings.notification_warning_tooltip": "SMTP fehlt",
      };
      return map[key] ?? key;
    },
    setLang: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

describe("SettingsHub", () => {
  it("groups settings by topic a partner recognises", () => {
    render(<SettingsHub userRole="admin" />);

    for (const group of [
      "Kanzlei",
      "Benutzer und Rollen",
      "Sicherheit und Datenschutz",
      "Integrationen",
      "KI und Kanzleiwissen",
      "Konto und Abrechnung",
    ]) {
      expect(screen.getByRole("heading", { name: group })).toBeInTheDocument();
    }
  });

  it("gives every tile a one-sentence explanation", () => {
    render(<SettingsHub userRole="admin" />);

    const tiles = screen.getAllByRole("link");
    expect(tiles.length).toBeGreaterThan(10);
    for (const tile of tiles) {
      expect(tile.querySelectorAll("p").length).toBe(2);
    }
  });

  it("lists each target only once", () => {
    render(<SettingsHub userRole="admin" />);

    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("does not show work surfaces or technical jargon as settings", () => {
    render(<SettingsHub userRole="admin" />);

    for (const text of ["Diktat", "Red-Team", "Agenten", "SCIM Directory Sync", "Audit-Log"]) {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    }
  });

  it("finds settings by keyword, e.g. Stundensatz", () => {
    render(<SettingsHub userRole="admin" />);

    fireEvent.change(screen.getByPlaceholderText("Suchen …"), {
      target: { value: "Stundensatz" },
    });

    expect(screen.getByText("Verrechnung und E-Rechnung")).toBeInTheDocument();
    expect(screen.queryByText("Änderungsprotokoll")).not.toBeInTheDocument();
  });

  it("shows no results message for unmatched search", () => {
    render(<SettingsHub userRole="admin" />);

    fireEvent.change(screen.getByPlaceholderText("Suchen …"), {
      target: { value: "xyznonexistent" },
    });

    expect(screen.getByText("Keine Ergebnisse")).toBeInTheDocument();
  });

  it("hides admin-only settings for other roles", () => {
    render(<SettingsHub userRole="assistant" />);

    expect(screen.queryByText("Änderungsprotokoll")).not.toBeInTheDocument();
    expect(screen.queryByText("Benutzerabgleich (SCIM)")).not.toBeInTheDocument();
    expect(screen.getByText("Anmeldung und Zwei-Faktor")).toBeInTheDocument();
    expect(screen.getByText("Mein Konto")).toBeInTheDocument();
  });
});
