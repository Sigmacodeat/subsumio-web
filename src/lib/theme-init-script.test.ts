import { describe, expect, it, vi } from "vitest";
import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "./theme-init-script";

function run(stored: string | null, prefersDark: boolean) {
  const root = document.createElement("div");
  root.setAttribute("data-app", "dashboard");
  document.body.appendChild(root);
  vi.stubGlobal("localStorage", { getItem: () => stored });
  vi.stubGlobal("matchMedia", () => ({ matches: prefersDark }));
  new Function(THEME_INIT_SCRIPT)();
  const theme = root.getAttribute("data-theme");
  root.remove();
  vi.unstubAllGlobals();
  return theme;
}

describe("THEME_INIT_SCRIPT", () => {
  it("applies the stored theme before hydration", () => {
    expect(run("dark", false)).toBe("dark");
    expect(run("light", true)).toBe("light");
  });

  it("falls back to the OS preference", () => {
    expect(run(null, true)).toBe("dark");
    expect(run(null, false)).toBe("light");
  });

  it("uses the same storage key as the dashboard theme hook", () => {
    expect(THEME_INIT_SCRIPT).toContain(THEME_STORAGE_KEY);
  });

  it("never throws when the dashboard node is missing", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => new Function(THEME_INIT_SCRIPT)()).not.toThrow();
    vi.unstubAllGlobals();
  });
});
