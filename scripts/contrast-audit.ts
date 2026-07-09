import Color from "colorjs.io";
import * as fs from "fs";
import * as path from "path";

const cssPath = path.join(process.cwd(), "src/app/globals.css");
const css = fs.readFileSync(cssPath, "utf-8").replace(/\r\n/g, "\n");

type Scope = {
  name: string;
  vars: Record<string, string>;
};

function normalizeColor(value: string): string | null {
  const v = value.trim();
  if (!v || v === "transparent" || v === "inherit" || v === "currentColor") return null;
  try {
    const c = new Color(v);
    return c.toString({ format: "hex" });
  } catch {
    return null;
  }
}

function resolveExpression(
  value: string,
  scope: Scope,
  cache = new Map<string, string | null>()
): string | null {
  const v = value.trim();
  if (cache.has(v)) return cache.get(v)!;
  const result = resolveExpressionImpl(v, scope, cache);
  cache.set(v, result);
  return result;
}

function resolveExpressionImpl(
  value: string,
  scope: Scope,
  cache: Map<string, string | null>
): string | null {
  const v = value.trim();
  if (v.startsWith("var(")) {
    const inner = v.slice(4, -1).trim();
    const fallback = inner.includes(",") ? inner.split(",").slice(1).join(",").trim() : "";
    const name = inner.split(",")[0]!.trim();
    if (scope.vars[name]) return resolveExpression(scope.vars[name]!, scope, cache);
    if (fallback) return resolveExpression(fallback, scope, cache);
    return null;
  }
  if (v.startsWith("color-mix(")) {
    const inner = v.slice(10, -1).trim();
    const inMatch = inner.match(/in\s+([a-zA-Z0-9-]+),\s*([\s\S]+)/);
    if (!inMatch) return null;
    const space = inMatch[1]!;
    const args = inMatch[2]!.trim();
    const parts = splitColorMixArgs(args);
    if (parts.length < 2) return null;
    const c1 = resolveExpression(parts[0]!.value, scope, cache);
    const c2 = resolveExpression(parts[1]!.value, scope, cache);
    if (!c1 || !c2) return null;
    try {
      const color1 = new Color(c1);
      const color2 = new Color(c2);
      const ratio = parts[0]!.percentage / 100;
      return color1
        .to(space as never)
        .mix(color2.to(space as never), 1 - ratio)
        .toString({ format: "hex" });
    } catch {
      return null;
    }
  }
  if (v.startsWith("hsla(")) {
    const inner = v.slice(5, -1).trim();
    const parts = inner.split(",").map((s) => s.trim());
    if (parts.length >= 4) {
      const alpha = parseFloat(parts[3]!);
      if (!isNaN(alpha)) return `hsla(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
    }
  }
  if (v.startsWith("hsl(")) {
    return normalizeColor(v);
  }
  if (v.startsWith("#")) {
    return normalizeColor(v);
  }
  if (v.startsWith("rgb(")) {
    return normalizeColor(v);
  }
  if (v.startsWith("rgba(")) {
    return normalizeColor(v);
  }
  if (v.startsWith("oklch(")) {
    return normalizeColor(v);
  }
  return normalizeColor(v);
}

function splitColorMixArgs(args: string): { value: string; percentage: number }[] {
  const parts: { value: string; percentage: number }[] = [];
  const tokens = tokenizeColorMix(args);
  for (let i = 0; i < tokens.length; i += 2) {
    const color = tokens[i]!;
    const pct = tokens[i + 1] ?? "100%";
    const value = color.startsWith("var(") ? color : color.replace(/\s+%$/, "");
    parts.push({ value, percentage: parseFloat(pct) || 100 });
  }
  return parts;
}

function tokenizeColorMix(input: string): string[] {
  const result: string[] = [];
  let current = "";
  let depth = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === " " && depth === 0 && current) {
      const pct = current.match(/\d+\.?\d*%$/);
      if (pct) {
        const idx = current.lastIndexOf(pct[0]!);
        result.push(current.slice(0, idx).trim());
        result.push(pct[0]!);
      } else {
        result.push(current.trim());
      }
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) {
    const pct = current.match(/\d+\.?\d*%$/);
    if (pct) {
      const idx = current.lastIndexOf(pct[0]!);
      result.push(current.slice(0, idx).trim());
      result.push(pct[0]!);
    } else {
      result.push(current.trim());
    }
  }
  return result.filter((s) => s);
}

function parseScope(
  cssSource: string,
  selector: string,
  startName: string,
  endName?: string
): Scope | null {
  const start = cssSource.indexOf(startName);
  if (start === -1) return null;
  const open = cssSource.indexOf("{", start);
  let brace = 1;
  let i = open + 1;
  while (brace > 0 && i < cssSource.length) {
    if (cssSource[i] === "{") brace++;
    if (cssSource[i] === "}") brace--;
    i++;
  }
  const block = cssSource.slice(open + 1, i - 1);
  const vars: Record<string, string> = {};
  const decls = block.match(/--[a-zA-Z0-9-]+:\s*[^;]+/g) || [];
  for (const decl of decls) {
    const [name, value] = decl.split(/:\s*/, 2);
    vars[name!] = value!;
  }
  return { name: selector, vars };
}

function mergeScopes(root: Scope, overrides: Scope): Scope {
  return { name: overrides.name, vars: { ...root.vars, ...overrides.vars } };
}

function extractRoot(cssSource: string): Scope {
  const vars: Record<string, string> = {};
  const rootMatch = cssSource.match(/:root\s*\{([\s\S]*?)\}/);
  if (rootMatch) {
    const decls = rootMatch[1].match(/--[a-zA-Z0-9-]+:\s*[^;]+/g) || [];
    for (const decl of decls) {
      const [name, value] = decl.split(/:\s*/, 2);
      vars[name!] = value!;
    }
  }
  return { name: "root", vars };
}

function parseTheme(cssSource: string, name: string, marker: string): Scope | null {
  const scope = parseScope(cssSource, name, marker);
  if (!scope) return null;
  return scope;
}

const root = extractRoot(css);
const lightTheme = parseTheme(
  css,
  "dashboard-light",
  '[data-app="dashboard"],\n[data-app="dashboard"][data-theme="light"]'
);
const darkTheme = parseTheme(css, "dashboard-dark", '[data-app="dashboard"][data-theme="dark"]');

if (!lightTheme || !darkTheme) {
  console.error("Could not parse dashboard light or dark theme blocks");
  process.exit(1);
}

const light = mergeScopes(root, lightTheme);
const dark = mergeScopes(root, darkTheme);

const textTokens = [
  "--ds-text",
  "--ds-text-muted",
  "--ds-text-subtle",
  "--brand-primary",
  "--brand-text",
];
const signalTextTokens = [
  "--ds-success-text",
  "--ds-warning-text",
  "--ds-danger-text",
  "--ds-info-text",
  "--ds-attention-text",
];
const surfaceTokens = ["--ds-bg", "--ds-surface", "--ds-surface-2", "--ds-hover", "--ds-surface-elevated"];

const signalBgSolidTokens = [
  "--ds-success-solid",
  "--ds-warning-solid",
  "--ds-danger-solid",
  "--ds-info-solid",
  "--ds-attention-solid",
];

const signalBgTintTokens = [
  "--ds-success-bg",
  "--ds-warning-bg",
  "--ds-danger-bg",
  "--ds-info-bg",
  "--ds-attention-bg",
];

const whiteText = "#ffffff";

function contrast(color1: string, color2: string): number {
  try {
    const c1 = new Color(color1);
    const c2 = new Color(color2);
    return c1.contrast(c2, "WCAG21");
  } catch {
    return 0;
  }
}

function auditScope(scope: Scope): { label: string; ratio: number }[] {
  const failures: { label: string; ratio: number }[] = [];

  // 1. Text tokens on surface tokens (AA ≥ 4.5:1)
  for (const text of [...textTokens, ...signalTextTokens]) {
    const textValue = resolveExpression(text, scope);
    if (!textValue) continue;
    for (const bg of surfaceTokens) {
      const bgValue = resolveExpression(bg, scope);
      if (!bgValue) continue;
      const ratio = contrast(textValue, bgValue);
      if (ratio < 4.5) {
        failures.push({ label: `${text} on ${bg}`, ratio });
      }
    }
  }

  // 2. Signal text on signal-tinted backgrounds (AA ≥ 4.5:1)
  for (const text of signalTextTokens) {
    const textValue = resolveExpression(text, scope);
    if (!textValue) continue;
    const bgKey = text.replace("-text", "-bg");
    const bgValue = resolveExpression(bgKey, scope);
    if (!bgValue) continue;
    const ratio = contrast(textValue, bgValue);
    if (ratio < 4.5) {
      failures.push({ label: `${text} on ${bgKey}`, ratio });
    }
  }

  // 3. White text on solid signal backgrounds (AA ≥ 4.5:1 for normal text, ≥ 3:1 for large)
  for (const solid of signalBgSolidTokens) {
    const solidValue = resolveExpression(solid, scope);
    if (!solidValue) continue;
    const ratio = contrast(whiteText, solidValue);
    if (ratio < 4.5) {
      failures.push({ label: `white on ${solid}`, ratio });
    }
  }

  return failures.sort((a, b) => a.ratio - b.ratio);
}

function report(scope: Scope, title: string) {
  console.log(`\n=== ${title} ===`);
  const failures = auditScope(scope);
  if (failures.length === 0) {
    console.log("All text/surface combinations meet WCAG AA (4.5:1).");
  } else {
    console.log(`AA failures (<4.5:1): ${failures.length}`);
    for (const f of failures.slice(0, 30)) {
      console.log(`  ${f.label}: ${f.ratio.toFixed(2)}:1`);
    }
    if (failures.length > 30) console.log(`  ... and ${failures.length - 30} more`);
  }

  const bodyText = resolveExpression("--ds-text", scope);
  const bodyBg = resolveExpression("--ds-bg", scope);
  if (bodyText && bodyBg) {
    console.log(`Body contrast: ${contrast(bodyText, bodyBg).toFixed(2)}:1`);
  }
}

report(light, "Dashboard Light Theme");
report(dark, "Dashboard Dark Theme");
