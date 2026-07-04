import { describe, it, expect } from "vitest";
import { getRechtsraumParams } from "@/lib/legal/rechtsraum";
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
