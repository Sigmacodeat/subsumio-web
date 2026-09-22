// Contrast audit for the marketing site — every visible text node on every
// route is measured against its effective background (alpha layers composited
// up the ancestor chain, opacity included) and reported when it misses WCAG AA
// (4.5:1, or 3:1 for large text).
//
//   node scripts/qa/marketing-contrast-audit.mjs <outDir> "" /features /pricing …
//
// Needs the dev server on http://127.0.0.1:3217 (launch config
// "subsumio-web-isolated"). Routes are relative to /at; "" is the landing page.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const S = process.argv[2];
const routes = process.argv.slice(3);
const AUDIT = () => {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1]
      .split(/[ ,/]+/)
      .filter(Boolean)
      .map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  // modern engines may report color(srgb …)
  const parseAny = (c) => {
    if (!c) return null;
    if (c.startsWith("color(srgb")) {
      const p = c
        .match(/color\(srgb ([^)]+)\)/)[1]
        .split(/[ /]+/)
        .map(Number);
      return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 };
    }
    return parse(c);
  };
  const over = (top, bot) => ({
    r: top.r * top.a + bot.r * (1 - top.a),
    g: top.g * top.a + bot.g * (1 - top.a),
    b: top.b * top.a + bot.b * (1 - top.a),
    a: 1,
  });
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const l1 = lum(a),
      l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  const bgOf = (el) => {
    const layers = [];
    let unknown = false;
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const img = cs.backgroundImage;
      if (img && img !== "none") {
        const cols = [...img.matchAll(/rgba?\([^)]+\)|color\(srgb [^)]+\)/g)]
          .map((m) => parseAny(m[0]))
          .filter(Boolean);
        if (img.includes("url(")) unknown = true;
        if (cols.length) {
          const avg = cols.reduce(
            (s, c) => ({
              r: s.r + c.r / cols.length,
              g: s.g + c.g / cols.length,
              b: s.b + c.b / cols.length,
              a: s.a + c.a / cols.length,
            }),
            { r: 0, g: 0, b: 0, a: 0 }
          );
          layers.push(avg);
          if (avg.a > 0.95) break;
        }
      }
      const c = parseAny(cs.backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a > 0.95) break;
      }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (const l of layers.reverse()) base = over(l, base);
    return { bg: base, unknown };
  };
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const text = t.textContent.trim();
    if (text.length < 2) continue;
    const el = t.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    if (el.closest("script,style,noscript,[data-nextjs-toast],nextjs-portal,.sr-only")) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    if (cs.webkitBackgroundClip === "text" || cs.backgroundClip === "text") continue;
    let op = 1;
    for (let n = el; n; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity);
    if (op < 0.35) continue; // hidden / mid-transition
    // clipped to nothing (sr-only patterns)
    if (cs.clip === "rect(0px, 0px, 0px, 0px)" || (r.width <= 1 && r.height <= 1)) continue;
    const fg0 = parseAny(cs.color);
    if (!fg0) continue;
    const { bg, unknown } = bgOf(el);
    const fg = over({ ...fg0, a: fg0.a * op }, bg);
    const cr = ratio(fg, bg);
    const size = parseFloat(cs.fontSize);
    const bold = parseInt(cs.fontWeight) >= 700;
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
    if (cr < need) {
      const tone = el.closest("[data-tone]")?.dataset.tone ?? "-";
      const cls = (el.className?.toString() ?? "")
        .split(/\s+/)
        .filter((c) => /color|text-|brand|opacity/.test(c))
        .slice(0, 4)
        .join(" ");
      out.push({
        cr: +cr.toFixed(2),
        need,
        size: Math.round(size),
        text: text.slice(0, 46),
        tone,
        tag: el.tagName.toLowerCase(),
        cls,
        unknown,
        fg: `rgb(${Math.round(fg.r)},${Math.round(fg.g)},${Math.round(fg.b)})`,
        bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`,
      });
    }
  }
  return out;
};
const b = await chromium.launch();
const all = {};
for (const r of routes) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  try {
    await p.goto("http://127.0.0.1:3217/at" + r, { waitUntil: "networkidle", timeout: 120000 });
    const h = await p.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < h; y += 500) {
      await p.evaluate((yy) => window.scrollTo(0, yy), y);
      await p.waitForTimeout(90);
    }
    await p.evaluate(() => window.scrollTo(0, 1200));
    await p.waitForTimeout(700); // sticky elements visible
    all[r || "/"] = await p.evaluate(AUDIT);
  } catch (e) {
    all[r || "/"] = [{ error: e.message.slice(0, 100) }];
  }
  await p.close();
}
await b.close();
writeFileSync(`${S}/contrast.json`, JSON.stringify(all, null, 1));
for (const [r, items] of Object.entries(all)) {
  console.log(`\n== ${r}: ${items.length} below threshold`);
  const uniq = new Map();
  for (const i of items) {
    const k = `${i.fg}|${i.bg}|${i.cls}`;
    if (!uniq.has(k)) uniq.set(k, { ...i, n: 0 });
    uniq.get(k).n++;
  }
  for (const i of [...uniq.values()].sort((a, b) => a.cr - b.cr).slice(0, 14))
    console.log(
      `  ${String(i.cr).padEnd(5)}/${i.need} ×${i.n} ${i.size}px [${i.tone}] ${i.fg} on ${i.bg}${i.unknown ? " (img)" : ""} «${i.text}» ${i.cls}`
    );
}
