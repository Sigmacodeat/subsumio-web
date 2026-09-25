/**
 * In-memory stand-in for the server brain client's page + atomic array ops,
 * with page_array_mutate's in-statement `unless` semantics (via the same JS
 * mirror the array-mutate proxy uses). For billing tests.
 */
import { unlessMatches } from "@/lib/billing-write-guards";
import type { InvoiceBillingClient } from "@/lib/invoice-billing-lock";
import type { PageArrayMutation } from "@/lib/server-brain";

type Fm = Record<string, unknown>;

export function createFakeArrayBrain(pages: Map<string, Fm>): InvoiceBillingClient {
  return {
    async getPage(slug) {
      const fm = pages.get(slug);
      if (!fm) throw new Error("HTTP 404");
      return { frontmatter: structuredClone(fm) };
    },
    async updatePage({ slug, frontmatter }) {
      pages.set(slug, structuredClone(frontmatter));
      return { slug };
    },
    async appendPageArray(slug, field, items) {
      const fm = pages.get(slug);
      if (!fm) throw new Error("HTTP 404");
      const next = [...((fm[field] as unknown[]) ?? []), ...items];
      fm[field] = next;
      return { slug, field, appended: items.length, length: next.length, items: next };
    },
    async mutatePageArray(slug: string, field: string, m: PageArrayMutation) {
      const fm = pages.get(slug);
      if (!fm) throw new Error("HTTP 404");
      const list = (fm[field] as Fm[]) ?? [];
      const wanted = m.match.map(String);
      const updated: string[] = [];
      const skipped: string[] = [];
      const next: Fm[] = [];
      for (const e of list) {
        if (!wanted.includes(String(e.id))) {
          next.push(e);
          continue;
        }
        if (unlessMatches(e, m.unless)) {
          skipped.push(String(e.id));
          next.push(e);
          continue;
        }
        updated.push(String(e.id));
        if (m.remove) continue;
        const out: Fm = { ...e, ...(m.set ?? {}) };
        for (const k of m.unset ?? []) delete out[k];
        next.push(out);
      }
      fm[field] = next;
      const seen = new Set([...updated, ...skipped]);
      return {
        slug,
        field,
        matched_ids: [...seen],
        updated_ids: updated,
        skipped_ids: skipped,
        not_found_ids: wanted.filter((id) => !seen.has(id)),
        items: structuredClone(next),
        length: next.length,
      };
    },
  };
}
