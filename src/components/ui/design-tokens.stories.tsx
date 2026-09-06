import type { Meta, StoryObj } from "@storybook/nextjs";

/**
 * Design-Token Kontrast-Story — rendert alle --ds-text-* Tokens auf
 * --ds-surface und --ds-surface-2, mit CSS-basierter Kontrast-Messung.
 *
 * WCAG 2.1 AA: Text ≥ 4.5:1, Large Text (≥18pt / 14pt bold) ≥ 3:1.
 * Die Story markiert Tokens die den Schwellwert nicht erreichen.
 *
 * Storybook-Decorator setzt [data-app="dashboard"][data-theme="light"]
 * bzw. [data-theme="dark"] auf den Story-Container, damit die Tokens
 * korrekt aufgelöst werden.
 */

const meta: Meta = {
  title: "Design/Tokens/Text Contrast",
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Alle `--ds-text-*` Tokens auf `--ds-surface` und `--ds-surface-2`. " +
          "Kontrast wird via `<canvas>` 2D-Kontext gemessen und als Badge angezeigt. " +
          "AA-Schwellwert: 4.5:1 für normalen Text, 3:1 für Large Text.",
      },
    },
  },
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof meta>;

const TEXT_TOKENS = [
  { name: "--ds-text", label: "Primary Text", large: false },
  { name: "--ds-text-muted", label: "Muted Text", large: false },
  { name: "--ds-text-subtle", label: "Subtle Text", large: false },
  { name: "--ds-text-secondary", label: "Secondary (Alias)", large: false },
] as const;

const SURFACES = [
  { name: "--ds-surface", label: "Surface" },
  { name: "--ds-surface-2", label: "Surface-2" },
  { name: "--ds-bg", label: "Background" },
] as const;

/** Misst den relativen Luminanz-Kontrast zwischen zwei CSS-Farben. */
function contrastRatio(fg: string, bg: string): number {
  if (typeof window === "undefined") return 0;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return 0;

  const parse = (color: string): [number, number, number] => {
    ctx.fillStyle = "#000";
    ctx.fillStyle = color;
    const computed = ctx.fillStyle;
    // Canvas normalizes to #rrggbb or rgba()
    const m = computed.match(/#([0-9a-f]{6})/i);
    if (m) {
      const hex = m[1];
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
      ];
    }
    const rgba = computed.match(/rgba?\(([^)]+)\)/);
    if (rgba) {
      const parts = rgba[1].split(",").map((p) => parseFloat(p.trim()));
      return [parts[0], parts[1], parts[2]];
    }
    return [0, 0, 0];
  };

  const [r1, g1, b1] = parse(fg);
  const [r2, g2, b2] = parse(bg);

  const luminance = (r: number, g: number, b: number): number => {
    const toLinear = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  };

  const l1 = luminance(r1, g1, b1);
  const l2 = luminance(r2, g2, b2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function resolveToken(token: string): string {
  if (typeof window === "undefined") return "#000";
  const el = document.createElement("div");
  el.style.color = `var(${token})`;
  el.style.display = "none";
  document.body.appendChild(el);
  const computed = window.getComputedStyle(el).color;
  document.body.removeChild(el);
  return computed;
}

function resolveBg(token: string): string {
  if (typeof window === "undefined") return "#fff";
  const el = document.createElement("div");
  el.style.backgroundColor = `var(${token})`;
  el.style.display = "none";
  document.body.appendChild(el);
  const computed = window.getComputedStyle(el).backgroundColor;
  document.body.removeChild(el);
  return computed;
}

function ContrastRow({
  token,
  surface,
}: {
  token: (typeof TEXT_TOKENS)[number];
  surface: (typeof SURFACES)[number];
}) {
  let ratio = 0;
  let fgColor = "#000";
  let bgColor = "#fff";
  let passesAA = false;
  let passesAAA = false;

  if (typeof window !== "undefined") {
    fgColor = resolveToken(token.name);
    bgColor = resolveBg(surface.name);
    ratio = contrastRatio(fgColor, bgColor);
    const threshold = token.large ? 3 : 4.5;
    passesAA = ratio >= threshold;
    passesAAA = ratio >= 7;
  }

  const ratioStr = ratio > 0 ? `${ratio.toFixed(2)}:1` : "—";

  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-[color:var(--ds-border)] p-3"
      style={{ backgroundColor: `var(${surface.name})` }}
    >
      <div className="flex-1">
        <span
          className="font-medium"
          style={{ color: `var(${token.name})`, fontSize: token.large ? "18px" : "14px" }}
        >
          {token.label}
        </span>
        <span className="ml-2 font-mono text-xs" style={{ color: `var(${token.name})` }}>
          {token.name}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 text-xs font-semibold ${
            passesAAA
              ? "bg-[color:var(--ds-success-bg)] text-[color:var(--ds-success-text)]"
              : passesAA
                ? "bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)]"
                : "bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)]"
          }`}
        >
          {passesAAA ? "AAA" : passesAA ? "AA" : "FAIL"}
        </span>
        <span className="font-mono text-xs text-[color:var(--ds-text-muted)]">{ratioStr}</span>
      </div>
    </div>
  );
}

function ContrastMatrix() {
  return (
    <div className="space-y-6">
      {SURFACES.map((surface) => (
        <div key={surface.name}>
          <h3 className="mb-2 text-sm font-semibold text-[color:var(--ds-text)]">
            Auf {surface.label}{" "}
            <code className="font-mono text-xs text-[color:var(--ds-text-muted)]">
              {surface.name}
            </code>
          </h3>
          <div className="space-y-2">
            {TEXT_TOKENS.map((token) => (
              <ContrastRow key={`${token.name}-${surface.name}`} token={token} surface={surface} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export const LightTheme: Story = {
  render: () => (
    <div data-app="dashboard" data-theme="light" className="rounded-xl bg-[color:var(--ds-bg)] p-6">
      <ContrastMatrix />
    </div>
  ),
};

export const DarkTheme: Story = {
  render: () => (
    <div data-app="dashboard" data-theme="dark" className="rounded-xl bg-[color:var(--ds-bg)] p-6">
      <ContrastMatrix />
    </div>
  ),
};

export const SideBySide: Story = {
  render: () => (
    <div className="grid gap-6 lg:grid-cols-2">
      <div
        data-app="dashboard"
        data-theme="light"
        className="rounded-xl bg-[color:var(--ds-bg)] p-4"
      >
        <h2 className="mb-3 text-base font-bold text-[color:var(--ds-text)]">Light Theme</h2>
        <ContrastMatrix />
      </div>
      <div
        data-app="dashboard"
        data-theme="dark"
        className="rounded-xl bg-[color:var(--ds-bg)] p-4"
      >
        <h2 className="mb-3 text-base font-bold text-[color:var(--ds-text)]">Dark Theme</h2>
        <ContrastMatrix />
      </div>
    </div>
  ),
};
