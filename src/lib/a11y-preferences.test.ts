// @vitest-environment jsdom
// Darstellungs-Einstellungen: Parsen, Anwenden auf <html>, Persistenz und
// der flackerfreie Init-Script müssen dieselben Attribute erzeugen.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  A11Y_CHANGE_EVENT,
  A11Y_STORAGE_KEY,
  DEFAULT_A11Y_PREFS,
  applyA11yPrefs,
  isDefaultA11yPrefs,
  parseA11yPrefs,
  readA11yPrefs,
  writeA11yPrefs,
} from "./a11y-preferences";
import { A11Y_INIT_SCRIPT, A11Y_STORAGE_KEY as SCRIPT_KEY } from "./theme-init-script";

const ATTRS = ["data-font-scale", "data-contrast", "data-motion"] as const;

function attrs(el: HTMLElement = document.documentElement) {
  return Object.fromEntries(ATTRS.map((a) => [a, el.getAttribute(a)]));
}

beforeEach(() => {
  localStorage.clear();
  for (const a of ATTRS) document.documentElement.removeAttribute(a);
});
afterEach(() => {
  localStorage.clear();
  for (const a of ATTRS) document.documentElement.removeAttribute(a);
});

describe("parseA11yPrefs", () => {
  it("liefert Standardwerte bei leerem, kaputtem oder fremdem Inhalt", () => {
    expect(parseA11yPrefs(null)).toEqual(DEFAULT_A11Y_PREFS);
    expect(parseA11yPrefs("")).toEqual(DEFAULT_A11Y_PREFS);
    expect(parseA11yPrefs("{not json")).toEqual(DEFAULT_A11Y_PREFS);
    expect(parseA11yPrefs('"string"')).toEqual(DEFAULT_A11Y_PREFS);
    expect(parseA11yPrefs('{"fontScale":"300","contrast":"neon","motion":42}')).toEqual(
      DEFAULT_A11Y_PREFS
    );
  });

  it("übernimmt gültige Werte und akzeptiert Zahlen für die Schriftgröße", () => {
    expect(parseA11yPrefs('{"fontScale":112,"contrast":"high","motion":"reduce"}')).toEqual({
      fontScale: "112",
      contrast: "high",
      motion: "reduce",
    });
    expect(parseA11yPrefs('{"fontScale":"125"}').fontScale).toBe("125");
  });
});

describe("applyA11yPrefs", () => {
  it("setzt nur abweichende Werte als Attribut, Standard entfernt sie", () => {
    applyA11yPrefs({ fontScale: "125", contrast: "high", motion: "reduce" });
    expect(attrs()).toEqual({
      "data-font-scale": "125",
      "data-contrast": "high",
      "data-motion": "reduce",
    });
    applyA11yPrefs(DEFAULT_A11Y_PREFS);
    expect(attrs()).toEqual({
      "data-font-scale": null,
      "data-contrast": null,
      "data-motion": null,
    });
  });

  it("kennt 'allow' als expliziten Gegenpol zu 'reduce'", () => {
    applyA11yPrefs({ ...DEFAULT_A11Y_PREFS, motion: "allow" });
    expect(document.documentElement.getAttribute("data-motion")).toBe("allow");
  });
});

describe("writeA11yPrefs / readA11yPrefs", () => {
  it("persistiert unter dem gemeinsamen Key, wendet an und feuert das Ereignis", () => {
    let fired = 0;
    window.addEventListener(A11Y_CHANGE_EVENT, () => fired++);
    writeA11yPrefs({ fontScale: "112", contrast: "standard", motion: "system" });
    expect(JSON.parse(localStorage.getItem(A11Y_STORAGE_KEY) ?? "{}")).toEqual({
      fontScale: "112",
      contrast: "standard",
      motion: "system",
    });
    expect(document.documentElement.getAttribute("data-font-scale")).toBe("112");
    expect(readA11yPrefs().fontScale).toBe("112");
    expect(fired).toBe(1);
  });

  it("räumt den Storage auf, wenn alles auf Standard steht", () => {
    writeA11yPrefs({ fontScale: "112", contrast: "high", motion: "reduce" });
    writeA11yPrefs(DEFAULT_A11Y_PREFS);
    expect(localStorage.getItem(A11Y_STORAGE_KEY)).toBeNull();
    expect(isDefaultA11yPrefs(readA11yPrefs())).toBe(true);
  });
});

describe("A11Y_INIT_SCRIPT (flackerfrei vor dem Rendern)", () => {
  it("nutzt denselben Storage-Key wie das Modul", () => {
    expect(SCRIPT_KEY).toBe(A11Y_STORAGE_KEY);
    expect(A11Y_INIT_SCRIPT).toContain(A11Y_STORAGE_KEY);
  });

  it("erzeugt exakt die Attribute von applyA11yPrefs", () => {
    const cases = [
      { fontScale: "125", contrast: "high", motion: "reduce" },
      { fontScale: "112", contrast: "standard", motion: "allow" },
      { fontScale: "100", contrast: "standard", motion: "system" },
    ] as const;
    for (const prefs of cases) {
      localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(prefs));
      new Function(A11Y_INIT_SCRIPT)();
      const fromScript = attrs();
      applyA11yPrefs(prefs);
      expect(fromScript).toEqual(attrs());
    }
  });

  it("wirft nie — auch bei kaputtem JSON oder blockiertem Storage", () => {
    localStorage.setItem(A11Y_STORAGE_KEY, "{broken");
    expect(() => new Function(A11Y_INIT_SCRIPT)()).not.toThrow();
    expect(attrs()).toEqual({
      "data-font-scale": null,
      "data-contrast": null,
      "data-motion": null,
    });
  });
});
