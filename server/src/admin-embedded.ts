// AUTO-GENERATED — do not edit by hand.
// Run `bun run scripts/build-admin-embedded.ts` to regenerate.
// Source: admin/dist/ MISSING at 2026-06-27.
//
// The legacy admin SPA is not present in this build. The engine binary
// compiles successfully, and serve-http.ts degrades /admin requests to 404.

export interface AdminAsset {
  path: string;
  mime: string;
}

export const ADMIN_ASSETS: Record<string, AdminAsset> = {};

/** Index entry point for SPA fallback. Undefined when admin SPA is absent. */
export const ADMIN_INDEX_HTML: AdminAsset | undefined = undefined;

export const ADMIN_ASSET_COUNT = 0;
