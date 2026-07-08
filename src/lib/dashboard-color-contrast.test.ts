import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

type Hsl = readonly [hue: number, saturation: number, lightness: number];

const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
const aiActBanner = readFileSync(
  resolve(process.cwd(), "src/components/legal/AIActConformityBanner.tsx"),
  "utf8"
);

function rgb([hue, saturation, lightness]: Hsl): [number, number, number] {
  const s = saturation / 100;
  const l = lightness / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let channels: [number, number, number];

  if (hue < 60) channels = [c, x, 0];
  else if (hue < 120) channels = [x, c, 0];
  else if (hue < 180) channels = [0, c, x];
  else if (hue < 240) channels = [0, x, c];
  else if (hue < 300) channels = [x, 0, c];
  else channels = [c, 0, x];

  return channels.map((channel) => channel + m) as [number, number, number];
}

function luminance(color: Hsl): number {
  const linear = rgb(color).map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(a: Hsl, b: Hsl): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

const white: Hsl = [0, 0, 100];
const darkSurface: Hsl = [225, 16, 12];

describe("dashboard color accessibility", () => {
  test.each([
    ["light control border", [220, 12, 54] as Hsl, white],
    ["light focus ring", [230, 65, 38] as Hsl, white],
    ["dark control border", [225, 12, 52] as Hsl, darkSurface],
    ["dark focus ring", [230, 75, 72] as Hsl, darkSurface],
  ])("%s reaches 3:1 non-text contrast", (_name, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(3);
  });

  test.each([
    ["person", [230, 55, 42] as Hsl],
    ["company", [150, 48, 31] as Hsl],
    ["idea", [270, 52, 42] as Hsl],
    ["document", [40, 72, 30] as Hsl],
    ["event", [25, 72, 36] as Hsl],
    ["place", [180, 58, 27] as Hsl],
  ])("light graph color %s reaches 3:1", (_name, foreground) => {
    expect(contrast(foreground, white)).toBeGreaterThanOrEqual(3);
  });

  test("explicit dashboard theme drives Tailwind dark variants", () => {
    expect(css).toContain(
      '@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));'
    );
  });

  test("AI Act banner contains no hard-coded colors", () => {
    expect(aiActBanner).not.toMatch(/#[\da-f]{3,8}\b|\b(?:rgb|hsl)a?\(/i);
  });
});
