import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import {
  DpaContent,
  ImprintContent,
  PrivacyContent,
  PROCESSORS,
  TermsContent,
} from "@/components/legal/legal-content";
import { LEGAL_VERSIONS, formatLegalVersion } from "@/lib/auth/legal-acceptance";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const textOf = (el: React.ReactElement) => render(el).container.textContent ?? "";

describe("Datenschutzerklärung und AVV — Auftragsverarbeiter", () => {
  // Jeder Dienst, an den der Code Daten schickt, muss in der Liste stehen.
  const required = [
    "netcup",
    "Anthropic",
    "OpenRouter",
    "Mistral",
    "Stripe",
    "Resend",
    "Sentry",
    "Meta",
    "Twilio",
    "DocuSign",
    "WorkOS",
    "OpenSanctions",
    "Apple",
    "Google",
    "PDF-AS",
    "Upstash",
    "PostHog",
  ];

  it("lists every provider the code sends data to", () => {
    const names = PROCESSORS.map((p) => p.name).join(" | ");
    for (const r of required) expect(names).toContain(r);
  });

  it("renders the same table in privacy policy and AVV", () => {
    const privacy = textOf(<PrivacyContent home="/at" />);
    const dpa = textOf(<DpaContent home="/at" />);
    for (const p of PROCESSORS) {
      expect(privacy).toContain(p.name);
      expect(dpa).toContain(p.name);
    }
  });

  it("marks optional providers and names the transfer basis generically", () => {
    const whatsapp = PROCESSORS.find((p) => p.name.includes("WhatsApp"));
    expect(whatsapp?.condition).toMatch(/nur wenn die Kanzlei die Funktion aktiviert/);
    const posthog = PROCESSORS.find((p) => p.name === "PostHog");
    expect(posthog?.condition).toMatch(/Einwilligung/);
    const anthropic = PROCESSORS.find((p) => p.name.startsWith("Anthropic"));
    expect(anthropic?.condition).toBeUndefined();
    expect(anthropic?.location).toContain(
      "Standardvertragsklauseln bzw. EU-US Data Privacy Framework"
    );
  });
});

describe("AVV — innere Widerspruchsfreiheit", () => {
  const dpa = () => textOf(<DpaContent home="/at" />);

  it("uses one breach-notification deadline (48 h), never 72 h", () => {
    const text = dpa();
    expect(text).not.toMatch(/72 Stunden/);
    expect(text.match(/48 Stunden/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("points to section 8 of the privacy policy for the processor list", () => {
    expect(dpa()).toContain("Datenschutzerklärung (Abschnitt 8)");
  });

  it("claims no database-level AES-256 encryption", () => {
    const text = dpa();
    expect(text).not.toMatch(/AES-256 at-rest für Datenbank/);
    expect(text).toContain("Originaldateien werden mit AES-256-GCM verschlüsselt");
    expect(text).toContain("Datenbank selbst ist nicht zusätzlich");
  });

  it("describes self-service deletion honestly (team data only on instruction)", () => {
    const text = dpa();
    expect(text).not.toMatch(/GDPR-Data-Deletion-Endpunkt/);
    expect(text).toMatch(/nicht die gemeinsamen\s+Kanzleidaten/);
  });
});

describe("Datenschutzerklärung — Website-Analyse", () => {
  it("names PostHog, consent as legal basis and how to revoke", () => {
    const text = textOf(<PrivacyContent home="/at" />);
    expect(text).toContain("§ 165 Abs. 3 TKG 2021");
    expect(text).toContain("Cookie-Einstellungen");
    expect(text).toContain("Fassung vom 01.09.2026");
  });
});

describe("Rechtstexte — keine Entwurfsvermerke/Platzhalter, elektronischer AVV", () => {
  it("AVV: no draft notice, no fill-in placeholders, electronic conclusion", () => {
    const dpa = textOf(<DpaContent home="/at" />);
    expect(dpa).not.toMatch(/Entwurf/);
    expect(dpa).not.toMatch(/\[Name des Verantwortlichen\]|\[Anschrift\]/);
    expect(dpa).not.toMatch(/unterzeichnen Sie die Vorlage/);
    expect(dpa).toMatch(/elektronisch abgeschlossen \(Art\. 28 Abs\. 9 DSGVO\)/);
  });

  it("AGB, Datenschutz and AVV show the version the acceptance record stores", () => {
    expect(textOf(<TermsContent home="/at" />)).toContain(formatLegalVersion(LEGAL_VERSIONS.terms));
    expect(textOf(<PrivacyContent home="/at" />)).toContain(
      formatLegalVersion(LEGAL_VERSIONS.privacy)
    );
    expect(textOf(<DpaContent home="/at" />)).toContain(formatLegalVersion(LEGAL_VERSIONS.dpa));
  });

  it("AGB: contract with express acceptance at registration", () => {
    expect(textOf(<TermsContent home="/at" />)).toMatch(/ausdrücklich\s+akzeptiert/);
  });

  it("imprint shows no UID placeholder", () => {
    expect(textOf(<ImprintContent home="/at" />)).not.toMatch(/wird nach Zuteilung/);
  });
});
