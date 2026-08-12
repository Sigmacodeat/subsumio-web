import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

/**
 * Route-Coverage-Test: Stellt sicher, dass jede Dashboard-Route mit einer
 * page.tsx in mindestens einer der drei Registries referenziert ist:
 *   (a) sidebar.tsx
 *   (b) settings-hub.tsx
 *   (c) command-palette.tsx
 *
 * Verhindert, dass Features wie früher bea/deep-analysis/translate
 * unerreichbar werden ("tote Routen").
 */

const DASHBOARD_DIR = join(process.cwd(), "src/app/dashboard");
const SIDEBAR_PATH = join(process.cwd(), "src/components/dashboard/sidebar.tsx");
const SETTINGS_HUB_PATH = join(process.cwd(), "src/components/dashboard/settings-hub.tsx");
const COMMAND_PALETTE_PATH = join(process.cwd(), "src/components/dashboard/command-palette.tsx");

// Routes that are intentionally embedded in hub pages (not directly in nav registries).
// These are reachable via a parent page that IS in the sidebar.
const EMBEDDED_ROUTES = new Set([
  "norms", // redirect → research hub tab "normen" (component: components/research/norms-tab)
  "judgements-db", // redirect → research hub tab (component: components/research/judgements-db-tab)
  "litigation-analytics", // linked from analytics hub page
  "precedent-search", // redirect → research hub tab (component: components/research/precedent-search-tab)
  "commentaries", // redirect → research hub tab (component: components/research/commentaries-tab)
  "rechtsprechung", // redirect → research hub tab (component: components/research/rechtsprechung-tab)
  "adoption-analytics", // linked from analytics hub page + settings hub
  "time-tracking", // redirect → /dashboard/time (merged into single time page)
]);

// Routes that are sub-pages of other routes (not standalone pages needing nav entry).
const SUB_PAGE_PARENTS = new Set([
  "analytics", // parent hub for litigation-analytics etc.
  "research", // parent hub for norms, judgements-db, etc.
]);

function findPageRoutes(dir: string, basePath = ""): string[] {
  const routes: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const routeName = basePath ? `${basePath}/${entry.name}` : entry.name;

    if (entry.isDirectory() && !entry.name.startsWith("_") && entry.name !== "api") {
      if (existsSync(join(fullPath, "page.tsx"))) {
        routes.push(routeName);
      }
      // Recurse into subdirectories
      routes.push(...findPageRoutes(fullPath, routeName));
    }
  }

  return routes;
}

function readFileSafe(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

function isRouteReferenced(route: string, sources: string[]): boolean {
  const patterns = [`/dashboard/${route}`, `"${route}"`, `'${route}'`];
  return sources.some((src) => patterns.some((p) => src.includes(p)));
}

describe("Dashboard route coverage", () => {
  it("every dashboard route with page.tsx is referenced in sidebar, settings-hub, or command-palette", () => {
    const routes = findPageRoutes(DASHBOARD_DIR);
    const sidebarSrc = readFileSafe(SIDEBAR_PATH);
    const hubSrc = readFileSafe(SETTINGS_HUB_PATH);
    const paletteSrc = readFileSafe(COMMAND_PALETTE_PATH);
    const sources = [sidebarSrc, hubSrc, paletteSrc];

    const orphans: string[] = [];

    for (const route of routes) {
      // Skip dynamic segments [...slug], [slug], etc.
      if (route.includes("[") || route.includes("]")) continue;

      // Skip sub-pages (e.g. "settings/security", "monitoring/engine")
      // — these are reached via their parent page which is in the nav.
      const parts = route.split("/");
      if (parts.length > 1) continue;

      // Skip known embedded routes
      if (EMBEDDED_ROUTES.has(route)) continue;
      if (SUB_PAGE_PARENTS.has(route)) continue;

      if (!isRouteReferenced(route, sources)) {
        orphans.push(route);
      }
    }

    if (orphans.length > 0) {
      expect.fail(
        `Orphan dashboard routes (not in sidebar, settings-hub, or command-palette):\n` +
          orphans.map((r) => `  /dashboard/${r}`).join("\n")
      );
    }
  });
});
