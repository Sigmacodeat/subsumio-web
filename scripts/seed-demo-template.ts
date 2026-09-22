/**
 * Seed the public live-demo template sources on the Subsumio engine.
 *
 * Writes the fictional "Berger ./. Muster Werk GmbH" matter (plus the
 * secondary Novak matter) into the per-jurisdiction template sources:
 *   demo-template    (AT — ASG Wien, § 105 ArbVG, ERV)
 *   demo-template-de (DE — ArbG München, KSchG, beA)
 * Every public /demo session clones one of these per visitor via
 * POST /api/sources/clone — the templates themselves are never touched
 * by visitors.
 *
 * Required env:
 *   SUBSUMIO_API_URL       - Engine URL (e.g. https://api.subsum.io)
 *   SUBSUMIO_WEB_API_KEY   - Engine API key
 *
 * Optional env:
 *   SUBSUMIO_DEMO_TEMPLATE - Override the AT template source id
 *   DEMO_TEMPLATE_RESEED   - "1" purges the template sources before seeding
 *
 * Usage:
 *   bun run scripts/seed-demo-template.ts
 *
 * Idempotent by default: existing pages are skipped (the engine's put_page
 * is an upsert anyway; reseeding refreshes the relative dates).
 */

import {
  demoMatterPages,
  demoTemplateSource,
  type DemoJurisdiction,
} from "../src/content/demo-matter";

const ENGINE_URL = process.env.SUBSUMIO_API_URL;
const API_KEY = process.env.SUBSUMIO_WEB_API_KEY;
const RESEED = process.env.DEMO_TEMPLATE_RESEED === "1";
const JURISDICTIONS: DemoJurisdiction[] = ["at", "de"];

if (!ENGINE_URL) {
  console.error("SUBSUMIO_API_URL is required (e.g. http://localhost:3001)");
  process.exit(1);
}

function headersFor(source: string): Record<string, string> {
  const headers: Record<string, string> = {
    "x-subsumio-source": source,
    "Content-Type": "application/json",
  };
  if (API_KEY) headers["x-subsumio-api-key"] = API_KEY;
  return headers;
}

function templateFor(jur: DemoJurisdiction): string {
  return jur === "at" && process.env.SUBSUMIO_DEMO_TEMPLATE
    ? process.env.SUBSUMIO_DEMO_TEMPLATE
    : demoTemplateSource(jur);
}

async function seedTemplate(jur: DemoJurisdiction): Promise<boolean> {
  const template = templateFor(jur);
  const headers = headersFor(template);
  console.log(`Seeding demo template "${template}" (${jur.toUpperCase()}) on ${ENGINE_URL}`);

  if (RESEED) {
    const res = await fetch(`${ENGINE_URL}/api/source-data`, {
      method: "DELETE",
      headers,
    });
    console.log(`  purged template: ${res.status}`);
  }

  const pages = demoMatterPages(new Date(), jur);
  let ok = 0;
  let failed = 0;
  for (const page of pages) {
    try {
      const res = await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          slug: page.slug,
          title: page.title,
          type: page.type,
          content: page.content,
          frontmatter: page.frontmatter,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        ok++;
        console.log(`  ✓ ${page.slug} [${page.frontmatter.demo_stage}]`);
      } else {
        failed++;
        console.error(`  ✗ ${page.slug}: HTTP ${res.status} ${await res.text()}`);
      }
    } catch (e) {
      failed++;
      console.error(`  ✗ ${page.slug}: ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`  ${jur.toUpperCase()}: ${ok} pages seeded, ${failed} failed.`);
  if (failed > 0) return false;

  // Smoke-check: the clone endpoint must be able to copy the template.
  const probe = `demo-probe-${jur}-${Date.now().toString(36)}`;
  const clone = await fetch(`${ENGINE_URL}/api/sources/clone`, {
    method: "POST",
    headers: headersFor(probe),
    body: JSON.stringify({ from: template, to: probe, slugs: [pages[0].slug] }),
  });
  if (!clone.ok) {
    console.error(`Clone probe failed: HTTP ${clone.status} ${await clone.text()}`);
    return false;
  }
  const cloneResult = (await clone.json()) as { cloned?: { pages?: number } };
  console.log(`  Clone probe: ${cloneResult.cloned?.pages ?? 0} page(s) → ${probe}`);
  await fetch(`${ENGINE_URL}/api/source-data`, {
    method: "DELETE",
    headers: headersFor(probe),
  });
  return true;
}

async function main(): Promise<void> {
  let allOk = true;
  for (const jur of JURISDICTIONS) {
    if (!(await seedTemplate(jur))) allOk = false;
  }
  if (!allOk) process.exit(1);
  console.log("Templates verified. Public /demo sessions can clone them now.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
