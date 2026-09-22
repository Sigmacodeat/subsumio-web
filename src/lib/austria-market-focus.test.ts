import { describe, expect, test } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import sitemap from "@/app/sitemap";
import { getAllCitySlugs } from "@/content/city-pages";
import { allAltPaths, DEFAULT_LANG, p, SUPPORTED_LANGS } from "@/content/site";

describe("public market focus (AT + DE live, CH/EN retired)", () => {
  test("exposes Austria and Germany as the active public locales", () => {
    expect(DEFAULT_LANG).toBe("at");
    expect(SUPPORTED_LANGS).toEqual(["at", "de"]);
    expect(p("/pricing")).toBe("/at/pricing");
    expect(allAltPaths("at", "/at/pricing")).toEqual([
      expect.objectContaining({ lang: "de", href: "/de/pricing" }),
    ]);
  });

  test("keeps retired locale route trees outside the active build", () => {
    for (const locale of ["ch", "en"]) {
      const localeDir = join(process.cwd(), "src/app", locale);
      const files = existsSync(localeDir)
        ? readdirSync(localeDir, { recursive: true }).filter((entry) =>
            String(entry).endsWith(".tsx")
          )
        : [];
      expect(files, locale).toEqual([]);
    }
    expect(existsSync(join(process.cwd(), "src/app/page.tsx"))).toBe(false);
  });

  test("publishes no retired locale URL in the sitemap", () => {
    const entries = sitemap();
    const paths = entries.map((entry) => new URL(entry.url).pathname);

    expect(paths.some((path) => /\/(ch|en)(\/|$)/.test(path))).toBe(false);
    expect(paths).toContain("/at");
    expect(paths).toContain("/de");
    // Canonical city URLs live under /at (bare /cities/* 308-redirects there).
    expect(paths).toContain("/at/cities/wien");
    expect(paths).not.toContain("/cities/wien");
  });

  test("publishes Vienna as the only active city market", () => {
    expect(getAllCitySlugs()).toEqual(
      expect.arrayContaining(["wien", "graz", "linz", "salzburg", "innsbruck"])
    );
    expect(getAllCitySlugs().every((s) => /^[a-z-]+$/.test(s))).toBe(true);
  });

  test("active Austrian pages do not advertise retired hreflang URLs", () => {
    const source = readFileSync(join(process.cwd(), "src/app/at/layout.tsx"), "utf8");
    // /de is a live alternate; only the retired locales must stay absent.
    expect(source).not.toMatch(/de-CH|\/ch|\/en|en-[A-Z]{2}/);
    expect(source).toContain('"de-AT": "/at"');
    expect(source).toContain('"de-DE": "/de"');
  });

  test("new matters and the AI copilot default to Austria", () => {
    const newCase = readFileSync(
      join(process.cwd(), "src/app/dashboard/cases/new/page.tsx"),
      "utf8"
    );
    const quickCreate = readFileSync(
      join(process.cwd(), "src/components/legal/CaseQuickCreateDialog.tsx"),
      "utf8"
    );
    const chat = readFileSync(join(process.cwd(), "src/components/chat/chat-panel.tsx"), "utf8");
    const jurisdictionApi = readFileSync(
      join(process.cwd(), "src/app/api/settings/jurisdiction/route.ts"),
      "utf8"
    );

    expect(newCase).toContain('jurisdiction: "at"');
    expect(newCase).not.toContain('{ value: "de", label: t("casesnew.juris.de") }');
    expect(quickCreate).toContain('useState<"at" | "eu">("at")');
    expect(chat).toContain('useState<Jurisdiction>("at")');
    expect(jurisdictionApi).toContain('z.literal("AT")');
    expect(jurisdictionApi).not.toContain('z.enum(["DE", "AT", "CH"])');
  });

  test("active product surfaces do not expose beA, DATEV or RVG", () => {
    const sidebar = readFileSync(
      join(process.cwd(), "src/components/dashboard/sidebar.tsx"),
      "utf8"
    );
    const copilotTools = readFileSync(
      join(process.cwd(), "src/app/api/copilot/tools/route.ts"),
      "utf8"
    );
    expect(sidebar).toContain("!DE_ONLY_HREFS.has(item.href)");
    expect(copilotTools).not.toContain('"rvg_calculate",');

    for (const path of [
      "src/app/dashboard/bea",
      "src/app/dashboard/datev-export",
      "src/app/dashboard/datev-direct",
      "src/app/api/bea",
      "src/app/api/datev",
      "src/app/api/datev-direct",
      "src/app/dashboard/cost-calculator",
    ]) {
      expect(existsSync(join(process.cwd(), path)), path).toBe(false);
    }
    expect(existsSync(join(process.cwd(), "src/app/_archive/de/api/bea"))).toBe(true);
    expect(existsSync(join(process.cwd(), "src/app/_archive/risk/dashboard/cost-calculator"))).toBe(
      true
    );
  });

  test("uses the Austrian confidentiality provision instead of § 9a RAO", () => {
    const activeFiles = [
      "src/content/site.ts",
      "src/content/security.ts",
      "src/content/blog.ts",
      "src/app/layout.tsx",
    ];
    for (const file of activeFiles) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source, file).not.toContain("§ 9a RAO");
      expect(source, file).toContain("§ 9 Abs. 2 RAO");
    }
  });
});
