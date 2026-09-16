import { z } from "zod";
import { createHandler, apiSuccess } from "@/lib/api-handler";
import { ENGINE_URL } from "@/lib/engine";
import { DEMO_SEED_SLUGS } from "@/lib/provision";

function pageUrl(slug: string): string {
  const path = slug.split("/").map(encodeURIComponent).join("/");
  return `${ENGINE_URL}/api/pages/${path}`;
}

/** GET — check whether the seeded demo matter is still present. */
export const GET = createHandler({ action: "brain.read", rateTier: "standard" }, async (ctx) => {
  try {
    const res = await fetch(pageUrl(DEMO_SEED_SLUGS[0]), {
      headers: ctx.headers,
      signal: AbortSignal.timeout(5_000),
    });
    return apiSuccess({ present: res.ok });
  } catch {
    return apiSuccess({ present: false });
  }
});

const deleteSchema = z.object({ confirm: z.literal(true) });

/** DELETE — remove all seeded demo pages (Akte, Frist, Dokument, Eingang).
 *  Requires an explicit confirm flag so a stray call can't wipe data. */
export const DELETE = createHandler(
  {
    action: "brain.delete",
    rateTier: "standard",
    body: deleteSchema,
    audit: (ctx) => ({
      action: "case.delete" as const,
      entityType: "demo_data",
      details: { user: ctx.user.email, method: "demo_cleanup" },
    }),
  },
  async (ctx) => {
    const results = await Promise.all(
      DEMO_SEED_SLUGS.map(async (slug) => {
        try {
          const res = await fetch(pageUrl(slug), {
            method: "DELETE",
            headers: ctx.headers,
            signal: AbortSignal.timeout(5_000),
          });
          return { slug, removed: res.ok || res.status === 404 };
        } catch {
          return { slug, removed: false };
        }
      })
    );
    return apiSuccess({
      removed: results.filter((r) => r.removed).map((r) => r.slug),
      failed: results.filter((r) => !r.removed).map((r) => r.slug),
    });
  }
);
