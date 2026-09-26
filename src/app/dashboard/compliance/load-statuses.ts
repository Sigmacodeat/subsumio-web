import { ApiRequestError } from "@/lib/api";

export type CheckStatus = "ok" | "warn" | "fail";

/**
 * Reads the stored self-assessment. Only a missing page (404) means "nothing
 * saved yet" and yields `{}`; every other failure is rethrown so the page shows
 * a load error instead of a blank checklist — the next click would otherwise
 * overwrite all stored statuses with a single entry.
 */
export async function loadComplianceStatuses(
  getPage: (slug: string) => Promise<{ frontmatter?: unknown }>,
  slug: string
): Promise<Record<string, CheckStatus>> {
  try {
    const page = await getPage(slug);
    const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
    const stored = fm.check_statuses;
    return stored && typeof stored === "object" ? (stored as Record<string, CheckStatus>) : {};
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 404) return {};
    throw err;
  }
}
