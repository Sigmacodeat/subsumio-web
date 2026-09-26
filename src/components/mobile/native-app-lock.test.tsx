import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const bridge = {
  detectCapabilities: vi.fn(),
  biometricAvailable: vi.fn(),
  biometricAuth: vi.fn(),
  appLifecycle: vi.fn(async () => ({
    addListener: vi.fn(async () => ({ remove: async () => {} })),
  })),
};
vi.mock("@/lib/mobile-bridge", () => ({
  detectCapabilities: () => bridge.detectCapabilities(),
  biometricAvailable: () => bridge.biometricAvailable(),
  biometricAuth: () => bridge.biometricAuth(),
  appLifecycle: () => bridge.appLifecycle(),
}));
vi.mock("@/lib/csrf", () => ({ csrfFetch: vi.fn() }));

import { NativeAppLock } from "./native-app-lock";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 200 }))
  );
});

describe("NativeAppLock", () => {
  it("renders nothing in the browser", async () => {
    bridge.detectCapabilities.mockResolvedValue({ isNative: false });
    const { container } = render(<NativeAppLock />);
    await new Promise((r) => setTimeout(r, 10));
    expect(container).toBeEmptyDOMElement();
  });

  it("locks the signed-in native app until biometrics confirm the user", async () => {
    bridge.detectCapabilities.mockResolvedValue({ isNative: true });
    bridge.biometricAvailable.mockResolvedValue(true);
    bridge.biometricAuth.mockResolvedValueOnce({ success: false, error: "Abgebrochen" });
    render(<NativeAppLock />);
    expect(await screen.findByRole("dialog", { name: "Subsumio ist gesperrt" })).toBeTruthy();
    expect(await screen.findByRole("alert")).toHaveTextContent("Abgebrochen");

    bridge.biometricAuth.mockResolvedValueOnce({ success: true });
    screen.getByRole("button", { name: "Entsperren" }).click();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
