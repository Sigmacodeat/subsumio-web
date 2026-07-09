import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

type Hsl = readonly [number, number, number];

function rgb([h, saturation, lightness]: Hsl): [number, number, number] {
  const s = saturation / 100;
  const l = lightness / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let channels: [number, number, number];

  if (h < 60) channels = [c, x, 0];
  else if (h < 120) channels = [x, c, 0];
  else if (h < 180) channels = [0, c, x];
  else if (h < 240) channels = [0, x, c];
  else if (h < 300) channels = [x, 0, c];
  else channels = [c, 0, x];

  return channels.map((value) => value + m) as [number, number, number];
}

function luminance(color: Hsl): number {
  const linear = rgb(color).map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  );
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(a: Hsl, b: Hsl): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

const landing = readFileSync(
  resolve(process.cwd(), "src/components/marketing/landing.tsx"),
  "utf8"
);

describe("marketing color roles", () => {
  test.each([
    ["light control", [230, 10, 54] as Hsl, [230, 10, 93] as Hsl],
    ["slate control", [230, 12, 58] as Hsl, [230, 25, 18] as Hsl],
    ["dark control", [230, 10, 55] as Hsl, [230, 12, 10] as Hsl],
    ["light focus", [230, 60, 36] as Hsl, [230, 10, 93] as Hsl],
    ["slate focus", [230, 60, 76] as Hsl, [230, 25, 18] as Hsl],
    ["dark focus", [230, 60, 76] as Hsl, [230, 12, 10] as Hsl],
  ])("%s reaches 3:1 non-text contrast", (_name, foreground, background) => {
    expect(contrast(foreground, background)).toBeGreaterThanOrEqual(3);
  });

  test.each([
    ["brand start", [230, 60, 76] as Hsl],
    ["violet end", [260, 60, 75] as Hsl],
  ])("hero claim %s reaches 4.5:1 on slate", (_name, foreground) => {
    expect(contrast(foreground, [230, 30, 12])).toBeGreaterThanOrEqual(4.5);
  });

  test("landing claim uses the tone-aware brand text token", () => {
    expect(landing).toContain("var(--brand-text)");
  });
});
