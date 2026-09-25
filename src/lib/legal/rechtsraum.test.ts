import { describe, it, expect } from "vitest";
import { getRechtsraumParams, resolveMatterRechtsraum } from "@/lib/legal/rechtsraum";
import type { KanzleiSettings } from "@/lib/kanzlei-settings";

describe("getRechtsraumParams", () => {
  it("returns empty object for undefined settings", () => {
    expect(getRechtsraumParams(undefined)).toEqual({});
    expect(getRechtsraumParams(null)).toEqual({});
  });

  it("returns empty object when no country/state configured", () => {
    const settings = {} as KanzleiSettings;
    expect(getRechtsraumParams(settings)).toEqual({});
  });

  it("returns DE + state for valid German config", () => {
    const settings = { rechtsraumCountry: "DE", rechtsraumState: "BY" } as KanzleiSettings;
    const result = getRechtsraumParams(settings);
    expect(result.country).toBe("DE");
    expect(result.state).toBe("BY");
  });

  it("returns AT for valid Austrian config", () => {
    const settings = { rechtsraumCountry: "AT", rechtsraumState: "AT" } as KanzleiSettings;
    const result = getRechtsraumParams(settings);
    expect(result.country).toBe("AT");
    expect(result.state).toBe("AT");
  });

  it("returns CH + canton for valid Swiss config", () => {
    const settings = { rechtsraumCountry: "CH", rechtsraumState: "ZH" } as KanzleiSettings;
    const result = getRechtsraumParams(settings);
    expect(result.country).toBe("CH");
    expect(result.state).toBe("ZH");
  });

  it("returns empty for invalid DE state", () => {
    const settings = { rechtsraumCountry: "DE", rechtsraumState: "XX" } as KanzleiSettings;
    expect(getRechtsraumParams(settings)).toEqual({});
  });

  it("returns empty for invalid CH canton", () => {
    const settings = { rechtsraumCountry: "CH", rechtsraumState: "XX" } as KanzleiSettings;
    expect(getRechtsraumParams(settings)).toEqual({});
  });

  it("returns empty for AT with non-AT state", () => {
    const settings = { rechtsraumCountry: "AT", rechtsraumState: "BY" } as KanzleiSettings;
    expect(getRechtsraumParams(settings)).toEqual({});
  });
});

describe("resolveMatterRechtsraum (FRI-1)", () => {
  it("an Austrian matter uses the AT engine even in a German firm", () => {
    expect(resolveMatterRechtsraum("at", { country: "DE", state: "BY" })).toEqual({
      country: "AT",
      state: "AT",
      source: "matter",
    });
  });

  it("a German matter in an Austrian firm gets German rules without a guessed Land", () => {
    expect(resolveMatterRechtsraum("de", { country: "AT", state: "AT" })).toEqual({
      country: "DE",
      state: undefined,
      source: "matter",
    });
  });

  it("a German matter in a German firm keeps the firm's Land", () => {
    expect(resolveMatterRechtsraum("de", { country: "DE", state: "NW" }).state).toBe("NW");
  });

  it("an EU/unknown matter falls back to the firm", () => {
    expect(resolveMatterRechtsraum("eu", { country: "AT", state: "AT" })).toEqual({
      country: "AT",
      state: "AT",
      source: "firm",
    });
    expect(resolveMatterRechtsraum(undefined, {}).country).toBeUndefined();
  });
});
