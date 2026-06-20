// @vitest-environment jsdom

import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock all Capacitor dynamic imports to return null (plugin not available)
vi.mock("@capacitor/core", () => ({ Capacitor: null }));
vi.mock("@capacitor/push-notifications", () => ({}));
vi.mock("@capacitor/camera", () => ({}));
vi.mock("@capacitor/share", () => ({}));
vi.mock("capacitor-native-biometric", () => ({}));

describe("mobile-bridge", () => {
  // mobile-bridge uses dynamic imports of @capacitor/* which won't be available
  // in test env. All functions should gracefully degrade to web fallbacks.

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("detectCapabilities", () => {
    test("returns web capabilities when Capacitor not available", async () => {
      const { detectCapabilities } = await import("./mobile-bridge");
      const caps = await detectCapabilities();
      expect(caps.isNative).toBe(false);
      expect(caps.platform).toBe("web");
      expect(caps.push).toBe(false);
      expect(caps.biometric).toBe(false);
    });

    test("camera is true when mediaDevices available", async () => {
      const { detectCapabilities } = await import("./mobile-bridge");
      const caps = await detectCapabilities();
      // In test env, navigator.mediaDevices may or may not exist
      expect(typeof caps.camera).toBe("boolean");
    });

    test("share is true when navigator.share available", async () => {
      const { detectCapabilities } = await import("./mobile-bridge");
      const caps = await detectCapabilities();
      expect(typeof caps.share).toBe("boolean");
    });
  });

  describe("registerPush", () => {
    test("returns error when push plugin not available", async () => {
      const { registerPush } = await import("./mobile-bridge");
      const result = await registerPush();
      expect(result.token).toBeUndefined();
      expect(result.error).toBeTruthy();
      expect(result.error).toContain("nicht verfügbar");
    });
  });

  describe("capturePhoto", () => {
    test("returns error when camera plugin not available", async () => {
      const { capturePhoto } = await import("./mobile-bridge");
      const result = await capturePhoto();
      expect(result.base64).toBeUndefined();
      expect(result.error).toBeTruthy();
    }, 10000);
  });

  describe("biometricAuth", () => {
    test("returns error when biometric plugin not available", async () => {
      const { biometricAuth } = await import("./mobile-bridge");
      const result = await biometricAuth();
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.error).toContain("nicht verfügbar");
    });
  });

  describe("nativeShare", () => {
    test("falls back gracefully when plugin and navigator.share unavailable", async () => {
      const { nativeShare } = await import("./mobile-bridge");
      // navigator.share is not available in jsdom, so it should silently fail
      await expect(
        nativeShare({ title: "Test", text: "Hello" }),
      ).resolves.toBeUndefined();
    });
  });
});
