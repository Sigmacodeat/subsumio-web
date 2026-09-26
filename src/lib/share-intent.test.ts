// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const consume = vi.fn();
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => true },
  registerPlugin: () => ({ consume: () => consume() }),
}));

import { consumePendingShare, shareFileName } from "./share-intent";

describe("share intent", () => {
  it("takes the shared text from the native plugin", async () => {
    consume.mockResolvedValue({ text: "Mandantenmail", subject: "Re: Frist" });
    expect(await consumePendingShare()).toEqual({ text: "Mandantenmail", subject: "Re: Frist" });
    consume.mockResolvedValue({});
    expect(await consumePendingShare()).toBeNull();
  });

  it("adds the extension from the MIME type when the content URI has none", () => {
    expect(shareFileName("1234", "image/jpeg")).toBe("1234.jpg");
    expect(shareFileName("Vertrag.pdf", "application/pdf")).toBe("Vertrag.pdf");
    expect(shareFileName(undefined, "application/pdf")).toBe("geteilte-datei.pdf");
    expect(shareFileName("x", undefined)).toBe("x");
  });

  it("the native app no longer puts the shared text into the page URL", () => {
    const java = readFileSync(
      join(process.cwd(), "android/app/src/main/java/io/subsum/app/MainActivity.java"),
      "utf-8"
    );
    expect(java).not.toMatch(/text=/);
    expect(java).not.toMatch(/URLEncoder/);
    expect(java).toContain("ShareIntentPlugin.setPending");
    expect(java).toContain("registerPlugin(ShareIntentPlugin.class)");
    expect(java).toContain("OpenableColumns.DISPLAY_NAME");
  });
});
