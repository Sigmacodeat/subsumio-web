/**
 * Brain provisioning — explicitly initializes a tenant's brain on the Engine
 * after signup, instead of waiting for lazy creation on first API call.
 *
 * The Engine's web-api.ts has `ensureSource()` which lazily creates the source
 * row on first write. This function pre-warms the brain so:
 *   1. The first user experience is instant (no cold-start penalty)
 *   2. Industry-specific skill packs are mounted
 *   3. We can detect Engine connectivity issues at signup time
 *
 * Fire-and-forget: signup never fails if the Engine is unreachable.
 */

import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import {
  WORKFLOW_TEMPLATES,
  buildWorkflowSteps,
  buildWorkflowFrontmatter,
  buildWorkflowSlug,
  buildWorkflowTitle,
} from "@/lib/workflow";

import { logger } from "@/lib/logger";
const log = logger("lib/provision");

export interface ProvisionResult {
  ok: boolean;
  brainId: string;
  error?: string;
}

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Provision a tenant brain on the Engine.
 * Called after user creation in signup/register flows.
 *
 * Sends a lightweight stats request to trigger source creation,
 * then seeds workflows, Kanzlei defaults and the demo matter.
 * Retries up to 3 times with exponential backoff on transient failures.
 */
export async function provisionBrain(
  brainId: string,
  opts?: { industry?: string | null; jurisdiction?: "at" | "de" | "AT" | "DE" | null }
): Promise<ProvisionResult> {
  const headers = engineHeadersForBrain(brainId);

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      // 1. Trigger source creation by hitting stats endpoint
      const res = await fetch(`${ENGINE_URL}/api/stats`, {
        headers,
        signal: AbortSignal.timeout(5_000),
      });

      if (!res.ok && res.status !== 404) {
        // 404 is ok — means source doesn't exist yet, will be created on first write
        if (attempt < RETRY_DELAYS_MS.length) {
          await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        return { ok: false, brainId, error: `engine returned ${res.status}` };
      }

      // (No skill-pack mount: the engine has no /api/skillpack/apply — the
      // call 404'd silently on every signup. Subsumio is legal-only; the
      // legal defaults are seeded below.)

      // 3. Seed default workflow instances so the workflows page isn't empty
      try {
        await seedWorkflows(headers, opts?.industry);
      } catch {
        // Seeding is optional — brain still works without it
      }

      // 4. Seed Kanzlei defaults (Rechtsraum + Tarifmodell) so invoices/deadlines
      //    start with correct settings and the settings page doesn't
      //    hit a 404 on first load
      const demoJur = opts?.jurisdiction?.toLowerCase() === "de" ? "de" : "at";
      try {
        await seedKanzleiDefaults(headers, demoJur);
      } catch {
        // Optional — settings fall back to client-side defaults
      }

      // 5. Seed a fictional demo matter so a new tenant sees a working
      //    Akte + Frist + Dokument + Posteingang instead of an empty app.
      //    Matches the jurisdiction of the public demo the visitor came from.
      try {
        await seedDemoMatter(headers, demoJur);
      } catch {
        // Demo data is optional — signup must never fail on it
      }

      return { ok: true, brainId };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      // Engine unreachable — brain will be lazily provisioned on first API call
      return { ok: false, brainId, error };
    }
  }

  return { ok: false, brainId, error: "exhausted retries" };
}

/**
 * Fire-and-forget brain provisioning.
 * Use this in signup/register flows where you don't want to block the response.
 */
export function provisionBrainAsync(
  brainId: string,
  opts?: { industry?: string | null; jurisdiction?: "at" | "de" | "AT" | "DE" | null }
): void {
  void provisionBrain(brainId, opts).catch((err) => {
    log.error(
      `[provision] failed for ${brainId}:`,
      err instanceof Error ? err.message : String(err)
    );
  });
}

const SEED_TEMPLATE_IDS_LEGAL = ["due_diligence", "contract_review", "fristen_management"];

async function seedWorkflows(
  headers: Record<string, string>,
  _industry?: string | null
): Promise<void> {
  const templateIds = SEED_TEMPLATE_IDS_LEGAL;

  for (const templateId of templateIds) {
    const template = WORKFLOW_TEMPLATES.find((t) => t.id === templateId);
    if (!template) continue;

    const slug = buildWorkflowSlug(templateId);
    const steps = buildWorkflowSteps(template);
    const fm = buildWorkflowFrontmatter({
      template_id: templateId,
      prompt: template.prompt,
      started_by: "system",
      case_slug: undefined,
    });
    fm.steps = steps;
    fm.status = "draft";

    try {
      await fetch(`${ENGINE_URL}/api/pages`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          title: buildWorkflowTitle(template),
          type: "workflow",
          frontmatter: fm,
        }),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      // Individual workflow creation failure is non-fatal
    }
  }
}

import { DEMO_CASE_SLUG, demoMatterPages, type DemoJurisdiction } from "@/content/demo-matter";

/**
 * Seed the canonical Kanzlei-Settings page with jurisdiction defaults.
 * loadKanzleiSettings() merges with client-side defaults, so we only set the
 * jurisdiction-relevant keys — the rest resolves via normalizeKanzleiSettings.
 */
async function seedKanzleiDefaults(
  headers: Record<string, string>,
  jur: DemoJurisdiction = "at"
): Promise<void> {
  await createSeedPage(headers, {
    slug: "legal/settings/kanzlei",
    title: "Kanzlei-Einstellungen",
    type: "kanzlei_settings",
    content: "Zentrale Kanzlei-Stammdaten für Rechnungen und Verfahrensdokumentation.",
    frontmatter: {
      type: "kanzlei_settings",
      rechtsraumCountry: jur === "de" ? "DE" : "AT",
      tarifModell: jur === "de" ? "rvg" : "ratg",
      provisioned_defaults: true,
    },
  });
}

/** Slugs of the fictional demo matter seeded at signup — used by the
 *  demo-data cleanup endpoint to remove them again. Mirrors the live
 *  stage of src/content/demo-matter.ts (the public /demo sandbox clones
 *  the same content into its isolated per-visitor source). */
export const DEMO_SEED_SLUGS: readonly string[] = demoMatterPages(new Date(), "at")
  .filter((p) => p.frontmatter.demo_stage === "live")
  .map((p) => p.slug);

async function createSeedPage(
  headers: Record<string, string>,
  payload: {
    slug: string;
    title: string;
    type: string;
    content?: string;
    frontmatter?: Record<string, unknown>;
  }
): Promise<void> {
  await fetch(`${ENGINE_URL}/api/pages`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5_000),
  });
}

async function seedDemoMatter(
  headers: Record<string, string>,
  jur: DemoJurisdiction = "at"
): Promise<void> {
  // Idempotent: if the demo case already exists (re-provision or retry), skip —
  // the lawyer may have edited the demo data and we must not overwrite it.
  try {
    const slugPath = DEMO_CASE_SLUG.split("/").map(encodeURIComponent).join("/");
    const existing = await fetch(`${ENGINE_URL}/api/pages/${slugPath}`, {
      headers,
      signal: AbortSignal.timeout(3_000),
    });
    if (existing.ok) return;
  } catch {
    // Lookup failed — proceed with seeding anyway; per-seed errors are tolerated
  }

  const seeds = demoMatterPages(new Date(), jur).filter((p) => p.frontmatter.demo_stage === "live");

  for (const seed of seeds) {
    try {
      await createSeedPage(headers, seed);
    } catch {
      // Individual seed failure is non-fatal
    }
  }
}
