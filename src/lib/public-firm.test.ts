// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { publicFirmFromSettings, resolvePublicFormBrainId } from "./public-firm";

describe("resolvePublicFormBrainId", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses only the explicit configuration — never the WhatsApp default", () => {
    vi.stubEnv("SUBSUMIO_PUBLIC_INTAKE_BRAIN_ID", "");
    vi.stubEnv("SUBSUMIO_PUBLIC_BOOKING_BRAIN_ID", "");
    vi.stubEnv("WHATSAPP_DEFAULT_BRAIN_ID", "brain-wa");
    expect(resolvePublicFormBrainId("intake")).toBeNull();
    expect(resolvePublicFormBrainId("booking")).toBeNull();
  });

  it("booking falls back to the intake firm, not the other way round", () => {
    vi.stubEnv("SUBSUMIO_PUBLIC_INTAKE_BRAIN_ID", "brain-a");
    vi.stubEnv("SUBSUMIO_PUBLIC_BOOKING_BRAIN_ID", "");
    expect(resolvePublicFormBrainId("booking")).toBe("brain-a");
    vi.stubEnv("SUBSUMIO_PUBLIC_INTAKE_BRAIN_ID", "");
    vi.stubEnv("SUBSUMIO_PUBLIC_BOOKING_BRAIN_ID", "brain-b");
    expect(resolvePublicFormBrainId("intake")).toBeNull();
  });
});

describe("publicFirmFromSettings", () => {
  it("needs name, address and e-mail", () => {
    expect(publicFirmFromSettings({ kanzleiName: "K", kanzleiEmail: "k@k.at" })).toBeNull();
    expect(publicFirmFromSettings({ kanzleiName: "K", kanzleiAdresse: "A" })).toBeNull();
    expect(publicFirmFromSettings(undefined)).toBeNull();
  });

  it("builds the address from street/zip/city and keeps only http(s) privacy links", () => {
    expect(
      publicFirmFromSettings({
        kanzleiName: "Kanzlei Muster",
        kanzleiEmail: "office@muster.at",
        street: "Musterweg 1",
        zip: "1010",
        city: "Wien",
        kanzleiTelefon: "+43 1 234",
        datenschutzUrl: "javascript:alert(1)",
      })
    ).toEqual({
      name: "Kanzlei Muster",
      address: "Musterweg 1, 1010 Wien",
      email: "office@muster.at",
      phone: "+43 1 234",
    });
    expect(
      publicFirmFromSettings({
        kanzleiName: "K",
        kanzleiEmail: "k@k.at",
        kanzleiAdresse: "Ring 1, 1010 Wien",
        datenschutzUrl: "https://k.at/datenschutz",
      })?.privacyUrl
    ).toBe("https://k.at/datenschutz");
  });
});
