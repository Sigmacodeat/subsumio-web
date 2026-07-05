import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SettingsHub } from "@/components/dashboard/settings-hub";

vi.mock("@/lib/use-lang", () => ({
  useLang: () => ({
    lang: "de",
    t: (key: string) => {
      const map: Record<string, string> = {
        "settings.tier_quick_start": "Schnellstart",
        "settings.tier_erweitert": "Erweitert",
        "settings.tier_dach_integration": "DACH-Integration",
        "settings.tier_system": "System",
        "settings.hub_search_placeholder": "Suchen …",
        "settings.hub_no_results": "Keine Ergebnisse",
        "settings.tile_billing_desc": "Abo verwalten",
        "settings.tile_audit_desc": "Audit-Log",
        "settings.tile_ai_model_desc_full": "KI-Modell",
        "settings.tile_connectors_desc": "Integrationen",
        "settings.tile_datev_export_desc": "DATEV-Export",
        "nav.billing": "Abrechnung",
        "nav.audit_log": "Audit-Log",
        "nav.ai_model": "KI-Modell",
        "nav.connectors": "Integrationen",
        "nav.datev_export": "DATEV",
        "nav.settings": "Einstellungen",
        "nav.admin": "Team",
        "nav.security": "Sicherheit",
        "nav.onboarding": "Onboarding",
        "nav.directory": "Verzeichnis",
        "nav.api_keys": "API Keys",
        "nav.scim": "SCIM",
        "nav.agents": "Agenten",
        "nav.rag_eval": "RAG Eval",
        "nav.chat_analytics": "Chat Analytics",
        "nav.chat_compare": "Modellvergleich",
        "nav.reports": "Berichte",
        "nav.adoption_analytics": "Adoption",
        "nav.shared_spaces": "Shared Spaces",
        "nav.monitoring": "Monitoring",
        "nav.mobile": "Mobile",
        "nav.experience": "Erfahrung",
        "nav.portfolio_insights": "Portfolio",
        "nav.process_strategy": "Prozessstrategie",
        "nav.client_portal": "Mandantenportal",
        "nav.version_history": "Versionen",
        "nav.signature": "Unterschrift",
        "nav.vault": "Vault",
        "nav.cost_calculator": "Kostenrechner",
        "nav.kanzlei": "Kanzlei",
        "nav.bea": "beA",
        "nav.word_addin": "Word Add-In",
        "nav.compliance": "Compliance",
        "nav.retention": "Aufbewahrung",
        "nav.anonymize": "Anonymisierung",
        "nav.verfahrensdoku": "Verfahrensdoku",
        "nav.data_export": "Datenexport",
        "nav.import_kanzlei": "Import",
        "nav.whatsapp_templates": "WhatsApp Vorlagen",
        "nav.calendar_export": "Kalender-Export",
        "nav.judgements_sync": "Urteile Sync",
        "nav.opponents": "Gegner",
        "settings.tab_account": "Account",
        "settings.tab_brain": "Wissensbasis",
        "settings.tab_dream": "Dream",
        "settings.tab_kanzlei": "Kanzlei",
        "settings.tab_team": "Team",
        "settings.tab_api": "API",
        "settings.tab_acls": "Berechtigungen",
        "settings.tab_scim": "SCIM",
        "settings.tile_account_desc": "Account desc",
        "settings.tile_brain_desc": "Brain desc",
        "settings.tile_dream_desc": "Dream desc",
        "settings.tile_kanzlei_desc": "Kanzlei desc",
        "settings.tile_team_desc": "Team desc",
        "settings.tile_api_desc": "API desc",
        "settings.tile_acls_desc": "ACLs desc",
        "settings.tile_scim_desc": "SCIM desc",
        "settings.tile_security_desc": "Security desc",
        "settings.tile_ai_model_desc": "AI Model desc",
      };
      return map[key] ?? key;
    },
    setLang: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/queries/auth", () => ({
  useMe: () => ({ data: { role: "admin" } }),
}));

describe("SettingsHub", () => {
  it("renders all four audience tier groups", () => {
    render(<SettingsHub userRole="admin" />);

    expect(screen.getByText("Schnellstart")).toBeInTheDocument();
    expect(screen.getByText("Erweitert")).toBeInTheDocument();
    expect(screen.getByText("DACH-Integration")).toBeInTheDocument();
    expect(screen.getByText("System")).toBeInTheDocument();
  });

  it("shows quick-start items like billing and onboarding", () => {
    render(<SettingsHub userRole="admin" />);

    expect(screen.getByText("Abrechnung")).toBeInTheDocument();
    expect(screen.getByText("Onboarding")).toBeInTheDocument();
  });

  it("shows dach-integration items like DATEV and beA", () => {
    render(<SettingsHub userRole="admin" />);

    expect(screen.getByText("DATEV")).toBeInTheDocument();
    expect(screen.getByText("beA")).toBeInTheDocument();
  });

  it("shows system items like Audit-Log and KI-Modell", () => {
    render(<SettingsHub userRole="admin" />);

    expect(screen.getAllByText("Audit-Log").length).toBeGreaterThan(0);
    expect(screen.getAllByText("KI-Modell").length).toBeGreaterThan(0);
  });

  it("filters items by search query", () => {
    render(<SettingsHub userRole="admin" />);

    const input = screen.getByPlaceholderText("Suchen …");
    fireEvent.change(input, { target: { value: "DATEV" } });

    expect(screen.getByText("DATEV")).toBeInTheDocument();
    expect(screen.queryByText("Audit-Log")).not.toBeInTheDocument();
  });

  it("shows no results message for unmatched search", () => {
    render(<SettingsHub userRole="admin" />);

    const input = screen.getByPlaceholderText("Suchen …");
    fireEvent.change(input, { target: { value: "xyznonexistent" } });

    expect(screen.getByText("Keine Ergebnisse")).toBeInTheDocument();
  });

  it("hides admin-only items for non-admin roles", () => {
    render(<SettingsHub userRole="assistant" />);

    expect(screen.queryByText("Audit-Log")).not.toBeInTheDocument();
    expect(screen.queryByText("SCIM")).not.toBeInTheDocument();
  });
});
