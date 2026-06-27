import { createHandler } from "@/lib/api-handler";
import { ENGINE_URL, engineHeadersForBrain } from "@/lib/engine";
import { checkCoverage } from "@/lib/matter-context";
import { caseFrontmatter, type CaseFrontmatter } from "@/lib/legal-types";

export const maxDuration = 30;

export const GET = createHandler(
  {
    action: "brain.read",
    rateTier: "standard",
    cacheMaxAge: 30,
  },
  async (ctx, _body, _query, req) => {
    const { caseSlug } = await ((req as unknown as { params: Promise<{ caseSlug: string }> }).params);
    if (!caseSlug) {
      return Response.json(
        { error: "missing_slug", message: "Case slug is required." },
        { status: 400 },
      );
    }

    // Try to fetch case frontmatter for context-aware coverage
    let fm: CaseFrontmatter | undefined;
    try {
      const encodedSlug = caseSlug.split("/").map(encodeURIComponent).join("/");
      const res = await fetch(`${ENGINE_URL}/api/pages/${encodedSlug}`, {
        headers: engineHeadersForBrain(ctx.brainId),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const page = (await res.json()) as { frontmatter?: Record<string, unknown> };
        fm = caseFrontmatter(page);
      }
    } catch {
      // Engine unreachable — coverage without case context
    }

    const coverage = await checkCoverage(
      ENGINE_URL,
      engineHeadersForBrain(ctx.brainId),
      fm,
    );

    return Response.json(coverage);
  },
);
