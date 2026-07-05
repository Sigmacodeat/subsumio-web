import { describe, test, expect } from "vitest";
import {
  generateWhiteLabelManifest,
  whiteLabelFromKanzleiSettings,
  DEFAULT_WHITE_LABEL,
} from "./white-label";

describe("white-label", () => {
  describe("generateWhiteLabelManifest", () => {
    test("generates manifest with firm name", () => {
      const manifest = generateWhiteLabelManifest({
        ...DEFAULT_WHITE_LABEL,
        firm_name: "Kanzlei Müller",
      });
      expect(manifest.name).toBe("Kanzlei Müller");
      expect(manifest.display).toBe("standalone");
    });

    test("includes icons", () => {
      const manifest = generateWhiteLabelManifest(DEFAULT_WHITE_LABEL);
      const icons = manifest.icons as Array<{ src: string; sizes: string }>;
      expect(icons.length).toBeGreaterThanOrEqual(2);
      expect(icons.some((i) => i.sizes === "192x192")).toBe(true);
      expect(icons.some((i) => i.sizes === "512x512")).toBe(true);
    });

    test("uses custom theme color", () => {
      const manifest = generateWhiteLabelManifest({
        ...DEFAULT_WHITE_LABEL,
        theme_color: "#ff0000",
      });
      expect(manifest.theme_color).toBe("#ff0000");
    });
  });

  describe("whiteLabelFromKanzleiSettings", () => {
    test("uses defaults for missing fields", () => {
      const config = whiteLabelFromKanzleiSettings({});
      expect(config.firm_name).toBe(DEFAULT_WHITE_LABEL.firm_name);
      expect(config.theme_color).toBe(DEFAULT_WHITE_LABEL.theme_color);
    });

    test("overrides with provided values", () => {
      const config = whiteLabelFromKanzleiSettings({
        firm_name: "Kanzlei Schmidt",
        theme_color: "#123456",
      });
      expect(config.firm_name).toBe("Kanzlei Schmidt");
      expect(config.theme_color).toBe("#123456");
    });
  });
});
