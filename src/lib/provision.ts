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
import { packForIndustry } from "@/lib/industry-pack";
import {
  WORKFLOW_TEMPLATES,
  buildWorkflowSteps,
  buildWorkflowFrontmatter,
  buildWorkflowSlug,
  buildWorkflowTitle,
} from "@/lib/workflow";

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
 * then optionally mounts the industry skill pack.
 * Retries up to 3 times with exponential backoff on transient failures.
 */
export async function provisionBrain(
  brainId: string,
  opts?: { industry?: string | null }
): Promise<ProvisionResult> {
  const headers = engineHeadersForBrain(brainId);
  const pack = packForIndustry(opts?.industry);

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

      // 2. If industry pack is specified, mount it via the engine API
      if (pack) {
        try {
          await fetch(`${ENGINE_URL}/api/skillpack/apply`, {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({ pack }),
            signal: AbortSignal.timeout(10_000),
          });
        } catch {
          // Skill pack mounting is optional — brain still works without it
        }
      }

      // 3. Seed default workflow instances so the workflows page isn't empty
      try {
        await seedWorkflows(headers, opts?.industry);
      } catch {
        // Seeding is optional — brain still works without it
      }

      // 4. Seed Kanzlei defaults (AT Rechtsraum + RATG) so invoices/deadlines
      //    start with correct Austrian settings and the settings page doesn't
      //    hit a 404 on first load
      try {
        await seedKanzleiDefaults(headers);
      } catch {
        // Optional — settings fall back to client-side defaults
      }

      // 5. Seed a fictional demo matter so a new tenant sees a working
      //    Akte + Frist + Dokument + Posteingang instead of an empty app
      try {
        await seedDemoMatter(headers);
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
export function provisionBrainAsync(brainId: string, opts?: { industry?: string | null }): void {
  void provisionBrain(brainId, opts).catch((err) => {
    console.error(
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

const DEMO_CASE_SLUG = "legal/cases/demo-2026-001-berger-vs-muster";

/**
 * Seed the canonical Kanzlei-Settings page with Austrian defaults.
 * loadKanzleiSettings() merges with client-side defaults, so we only set the
 * jurisdiction-relevant keys — the rest resolves via normalizeKanzleiSettings.
 */
async function seedKanzleiDefaults(headers: Record<string, string>): Promise<void> {
  await createSeedPage(headers, {
    slug: "legal/settings/kanzlei",
    title: "Kanzlei-Einstellungen",
    type: "kanzlei_settings",
    content: "Zentrale Kanzlei-Stammdaten für Rechnungen und Verfahrensdokumentation.",
    frontmatter: {
      type: "kanzlei_settings",
      rechtsraumCountry: "AT",
      tarifModell: "ratg",
      provisioned_defaults: true,
    },
  });
}

/** Slugs of the fictional demo matter seeded at signup — used by the
 *  demo-data cleanup endpoint to remove them again. */
export const DEMO_SEED_SLUGS = [
  DEMO_CASE_SLUG,
  "legal/deadlines/demo-anfechtungsfrist-berger",
  "legal/documents/demo-kuendigungsschreiben",
  "legal/intake/demo-eingang-berger",
] as const;

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

async function seedDemoMatter(headers: Record<string, string>): Promise<void> {
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

  const now = new Date();
  const due = new Date(now.getTime() + 21 * 86_400_000);
  const dueDate = due.toISOString().slice(0, 10);
  const createdAt = now.toISOString();

  const seeds = [
    {
      slug: DEMO_CASE_SLUG,
      title: "Demo-Akte: Berger ./. Muster Werk GmbH",
      type: "legal_case",
      content: [
        "**DEMO-AKTE — fiktives Mandat zum Testen, keine echten Mandantendaten.**",
        "",
        "Mag. Anna Berger wurde von der Muster Werk GmbH (Wien) am 01.09.2026",
        "die Kündigung ausgesprochen. Sie wünscht Anfechtung wegen sozialer",
        "Unrechtfertigung und Überprüfung offener Ansprüche (Überstunden,",
        "Urlaubsersatzleistung).",
        "",
        "Nächster Schritt: Klagsbeantwortung / Anfechtungsklage beim",
        "Arbeits- und Sozialgericht Wien einbringen.",
      ].join("\n"),
      frontmatter: {
        case_number: "DEMO-2026-001",
        legal_area: "Arbeitsrecht",
        jurisdiction: "AT",
        status: "open",
        priority: "normal",
        client_name: "Mag. Anna Berger",
        opponent_name: "Muster Werk GmbH",
        court_name: "Arbeits- und Sozialgericht Wien",
        tags: ["demo"],
        demo: true,
        portal_enabled: false,
        version: 0,
      },
    },
    {
      slug: "legal/deadlines/demo-anfechtungsfrist-berger",
      title: "Anfechtungsfrist — Demo-Mandat Berger",
      type: "legal_deadline",
      content:
        "Demo-Frist: Kündigungsanfechtung für das fiktive Mandat Berger ./. Muster Werk GmbH.",
      frontmatter: {
        type: "legal_deadline",
        event_type: "deadline",
        due_date: dueDate,
        description: "Anfechtung der Kündigung beim zuständigen Gericht einbringen (Demo).",
        status: "pending",
        review_status: "unreviewed",
        source: "demo_seed",
        case_slug: DEMO_CASE_SLUG,
        demo: true,
        created_at: createdAt,
      },
    },
    {
      slug: "legal/documents/demo-kuendigungsschreiben",
      title: "Kündigungsschreiben Muster Werk GmbH (Demo)",
      type: "document",
      content: [
        "**DEMO-DOKUMENT — fiktives Schreiben zum Testen.**",
        "",
        "Muster Werk GmbH, Musterstraße 12, 1010 Wien",
        "Wien, am 01.09.2026",
        "",
        "Sehr geehrte Frau Mag. Berger,",
        "",
        "hiermit kündigen wir das mit Ihnen bestehende Dienstverhältnis",
        "ordentlich und zum nächstzulässigen Termin.",
        "",
        "Mit freundlichen Grüßen",
        "Muster Werk GmbH",
      ].join("\n"),
      frontmatter: {
        type: "document",
        case_slug: DEMO_CASE_SLUG,
        extraction_status: "done",
        tags: ["demo"],
        demo: true,
      },
    },
    {
      slug: "legal/intake/demo-eingang-berger",
      title: "Posteingang: Kündigungsschreiben Berger (Demo)",
      type: "intake_request",
      content: "Demo-Eingang: fiktive Mandatsanfrage zum Testen des Posteingangs.",
      frontmatter: {
        type: "intake_request",
        source: "email",
        status: "new",
        client_name: "Mag. Anna Berger",
        email: "demo@beispiel.invalid",
        legal_area: "Arbeitsrecht",
        summary:
          "Mandatsanfrage: Kündigung erhalten, Prüfung der Anfechtungsmöglichkeit gewünscht (Demo).",
        conflict_check_status: "clear",
        demo: true,
        created_at: createdAt,
        updated_at: createdAt,
      },
    },
  ];

  for (const seed of seeds) {
    try {
      await createSeedPage(headers, seed);
    } catch {
      // Individual seed failure is non-fatal
    }
  }
}
