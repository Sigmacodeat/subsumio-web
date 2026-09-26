// @vitest-environment jsdom
// In the native app the plugins are reached through the Capacitor bridge by
// their native names — not through bare-specifier imports that the hosted
// web app cannot resolve.
import { describe, expect, it, vi } from "vitest";
import { shouldLockOnResume, APP_LOCK_GRACE_MS } from "./app-lock";

const plugins: Record<string, unknown> = {
  NativeBiometric: {
    isAvailable: vi.fn(async () => ({ isAvailable: false, biometryType: 0 })),
    verifyIdentity: vi.fn(async () => undefined),
  },
  PushNotifications: {
    requestPermissions: vi.fn(async () => ({ receive: "granted" })),
    addListener: vi.fn(async (event: string, cb: (e: { value: string }) => void) => {
      if (event === "registration") setTimeout(() => cb({ value: "device-token" }), 0);
      return { remove: async () => {} };
    }),
    register: vi.fn(async () => undefined),
    removeAllListeners: vi.fn(async () => undefined),
  },
};
const registerPlugin = vi.fn((name: string) => plugins[name]);
vi.mock("@capacitor/core", () => ({
  Capacitor: {
    getPlatform: () => "ios",
    isNativePlatform: () => true,
    isPluginAvailable: (name: string) => name in plugins,
  },
  registerPlugin: (name: string) => registerPlugin(name),
}));

describe("mobile bridge in the native app", () => {
  it("registers push through the bridge and returns the device token", async () => {
    const { registerPush } = await import("./mobile-bridge");
    expect(await registerPush()).toEqual({ token: "device-token" });
    expect(registerPlugin).toHaveBeenCalledWith("PushNotifications");
  });

  it("biometrics that report isAvailable: false are not treated as available", async () => {
    const { biometricAuth, biometricAvailable } = await import("./mobile-bridge");
    expect(await biometricAvailable()).toBe(false);
    const r = await biometricAuth();
    expect(r.success).toBe(false);
    const bio = plugins.NativeBiometric as { verifyIdentity: ReturnType<typeof vi.fn> };
    expect(bio.verifyIdentity).not.toHaveBeenCalled();
  });

  it("a plugin missing from the native build is reported unavailable", async () => {
    const { capturePhoto } = await import("./mobile-bridge");
    const r = await capturePhoto();
    expect(r.error).toBeTruthy();
  });
});

describe("app lock", () => {
  it("locks after more than five minutes in the background, not after a short switch", () => {
    const t0 = 1_000_000;
    expect(shouldLockOnResume(t0, t0 + 30_000)).toBe(false);
    expect(shouldLockOnResume(t0, t0 + APP_LOCK_GRACE_MS)).toBe(true);
    expect(shouldLockOnResume(null, t0)).toBe(false);
  });
});
