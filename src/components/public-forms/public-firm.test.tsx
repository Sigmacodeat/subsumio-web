import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { PublicFirmGate, PublicFirmHeader, PublicPrivacyNotice, consentText } from "./public-firm";

const FIRM = {
  name: "Kanzlei Muster",
  address: "Musterweg 1, 1010 Wien",
  email: "office@muster.at",
  phone: "+43 1 234",
  privacyUrl: "https://muster.at/datenschutz",
};

describe("PublicFirmGate", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not offer the form when no firm is assigned", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "not_available" }), { status: 404 }))
    );
    render(<PublicFirmGate form="intake">{() => <form data-testid="the-form" />}</PublicFirmGate>);
    expect(await screen.findByTestId("public-form-unavailable")).toBeTruthy();
    expect(screen.queryByTestId("the-form")).toBeNull();
  });

  it("renders the form with the firm when assigned", async () => {
    const fetchSpy = vi.fn(async () => Response.json({ data: { firm: FIRM } }));
    vi.stubGlobal("fetch", fetchSpy);
    render(
      <PublicFirmGate form="booking">
        {(firm) => <p data-testid="the-form">{firm.name}</p>}
      </PublicFirmGate>
    );
    expect((await screen.findByTestId("the-form")).textContent).toBe("Kanzlei Muster");
    expect(fetchSpy).toHaveBeenCalledWith("/api/intake/public?form=booking");
  });
});

describe("firm header, consent and Art. 13 notice", () => {
  it("name the firm as controller with contact, rights and privacy link", () => {
    render(
      <>
        <PublicFirmHeader firm={FIRM} />
        <PublicPrivacyNotice firm={FIRM} purpose="intake" />
      </>
    );
    expect(screen.getByTestId("public-firm-header").textContent).toContain("Kanzlei Muster");
    const notice = screen.getByTestId("public-privacy-notice");
    const text = notice.textContent ?? "";
    expect(text).toContain("Verantwortlich:");
    expect(text).toContain("Musterweg 1, 1010 Wien");
    expect(text).toMatch(/Rechtsgrundlage/);
    expect(text).toMatch(/Speicherdauer/);
    expect(text).toMatch(/Auskunft, Berichtigung, Löschung/);
    expect(text).toMatch(/Datenschutzbehörde/);
    const links = [...notice.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(links).toContain("https://muster.at/datenschutz");
    expect(consentText(FIRM)).toContain("Kanzlei Muster");
  });
});
