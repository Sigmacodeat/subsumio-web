/**
 * Kontrast-Guard für die Design-Tokens in globals.css (WCAG 2.2 AA).
 *
 * Parst die HSL-Werte direkt aus der CSS-Datei und rechnet nach der
 * WCAG-Formel (relative Luminanz, sRGB) nach:
 * - 1.4.11 Non-text Contrast: --ds-border-control ≥ 3:1 auf --ds-surface UND
 *   --ds-surface-2 (Light + Dark Dashboard-Scope)
 * - 1.4.3 Contrast (Minimum): Weiß auf --ds-success-solid / --ds-warning-solid
 *   ≥ 4,5:1 (Light + Dark), inkl. Hover-Stufen
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

type Rgb = [number, number, number];

function hslToRgb(h: number, s: number, l: number): Rgb {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function luminance([r, g, b]: Rgb): number {
  const c = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Schneidet den Block eines Scopes (Selektor bis zur schließenden Klammer) heraus. */
function scopeBlock(selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0) throw new Error(`Scope nicht gefunden: ${selector}`);
  const open = css.indexOf("{", start);
  const end = css.indexOf("\n}", open);
  return css.slice(open, end);
}

/** Liest einen Token-Wert innerhalb eines Blocks; löst var(--x) innerhalb desselben Blocks
 *  bzw. im :root-Block (Signal-/Neutral-Rampen) rekursiv auf. */
function resolveToken(block: string, name: string, depth = 0): string {
  if (depth > 6) throw new Error(`Zu tiefe var()-Kette bei ${name}`);
  const re = new RegExp(`(?:^|\\n)\\s*${name.replace(/[-]/g, "\\-")}:\\s*([^;]+);`);
  const m = block.match(re) ?? css.match(re);
  if (!m) throw new Error(`Token nicht gefunden: ${name}`);
  const value = m[1].trim();
  const ref = value.match(/^var\((--[\w-]+)\)$/);
  return ref ? resolveToken(block, ref[1], depth + 1) : value;
}

function parseColor(value: string): Rgb {
  const hsl = value.match(/^hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/);
  if (hsl) return hslToRgb(Number(hsl[1]), Number(hsl[2]), Number(hsl[3]));
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) return hexToRgb(value);
  throw new Error(`Nur opake hsl()/hex-Werte werden geprüft, erhalten: ${value}`);
}

const WHITE: Rgb = [255, 255, 255];

const SCOPES = {
  light: '[data-app="dashboard"],\n[data-app="dashboard"][data-theme="light"]',
  dark: '[data-app="dashboard"][data-theme="dark"]',
} as const;

describe("Design-Tokens: Kontrast (globals.css)", () => {
  for (const [label, selector] of Object.entries(SCOPES)) {
    describe(`Dashboard ${label}`, () => {
      const block = scopeBlock(selector);
      const surface = parseColor(resolveToken(block, "--ds-surface"));
      const surface2 = parseColor(resolveToken(block, "--ds-surface-2"));

      it("--ds-border-control erreicht ≥ 3:1 auf --ds-surface und --ds-surface-2 (1.4.11)", () => {
        const border = parseColor(resolveToken(block, "--ds-border-control"));
        expect(contrastRatio(border, surface)).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(border, surface2)).toBeGreaterThanOrEqual(3);
      });

      it("--ds-control-border bleibt Alias von --ds-border-control", () => {
        expect(resolveToken(block, "--ds-control-border")).toBe(
          resolveToken(block, "--ds-border-control")
        );
      });

      it.each(["--ds-success-solid", "--ds-warning-solid"])(
        "Weiß auf %s erreicht ≥ 4,5:1 (1.4.3)",
        (token) => {
          const fill = parseColor(resolveToken(block, token));
          expect(contrastRatio(WHITE, fill)).toBeGreaterThanOrEqual(4.5);
          const hover = parseColor(resolveToken(block, `${token}-hover`));
          expect(contrastRatio(WHITE, hover)).toBeGreaterThanOrEqual(4.5);
        }
      );
    });
  }

  it("dekorative --ds-border bleibt bewusst unter 3:1 (kein Steuerelement-Rahmen)", () => {
    const block = scopeBlock(SCOPES.light);
    const border = parseColor(resolveToken(block, "--ds-border"));
    const surface = parseColor(resolveToken(block, "--ds-surface"));
    // Dokumentiert die Trennung: Trennlinien dürfen leise sein, Feldgrenzen nicht.
    expect(contrastRatio(border, surface)).toBeLessThan(3);
  });
});
