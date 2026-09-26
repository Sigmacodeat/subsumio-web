/**
 * Mobile matter list: the real list of matters the user can see (type
 * `legal_case`, through the scoped page list), with the fields the dashboard
 * uses — not a full-text search that returned arbitrary page types.
 */
import type { BrainPage } from "@/lib/types";

export interface MobileMatter {
  slug: string;
  title: string;
  status: string;
  client?: string;
  legalArea?: string;
  caseNumber?: string;
  updatedAt?: string;
  urgent?: boolean;
}

export type MobileMatterFilter = "all" | "open" | "pending" | "closed" | "dormant";

export const MOBILE_MATTER_FILTERS: Array<{ key: MobileMatterFilter; label: string }> = [
  { key: "all", label: "Alle" },
  { key: "open", label: "Offen" },
  { key: "pending", label: "Wartend" },
  { key: "closed", label: "Abgeschlossen" },
  { key: "dormant", label: "Ruhend" },
];

/** Case statuses per filter (see `src/lib/case-status.ts`). */
const FILTER_STATUSES: Record<Exclude<MobileMatterFilter, "all">, ReadonlySet<string>> = {
  open: new Set(["open", "appealed"]),
  pending: new Set(["pending"]),
  closed: new Set(["settled", "won", "lost"]),
  dormant: new Set(["dormant"]),
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** A listed page as a mobile matter row; `null` for anything that is not an active matter. */
export function toMobileMatter(page: BrainPage): MobileMatter | null {
  const fm = (page.frontmatter ?? {}) as Record<string, unknown>;
  const type = page.type ?? fm.type;
  if (type !== "legal_case") return null;
  const status = str(fm.status) ?? "open";
  if (status === "archived" || status === "tombstoned") return null;
  const raw = page as unknown as Record<string, unknown>;
  return {
    slug: page.slug,
    title: page.title || page.slug,
    status,
    client: str(fm.client_name) ?? str(fm.client),
    legalArea: str(fm.legal_area),
    caseNumber: str(fm.case_number),
    updatedAt: str(raw.updated_at) ?? str(fm.updated_at) ?? str(raw.created_at),
    urgent: fm.urgent === true || fm.priority === "critical",
  };
}

export function filterMobileMatters(
  matters: MobileMatter[],
  filter: MobileMatterFilter,
  search: string
): MobileMatter[] {
  const q = search.trim().toLowerCase();
  return matters.filter((m) => {
    if (filter !== "all" && !FILTER_STATUSES[filter].has(m.status)) return false;
    if (!q) return true;
    return [m.title, m.client, m.caseNumber].some((v) => v?.toLowerCase().includes(q));
  });
}

export function statusGroup(status: string): Exclude<MobileMatterFilter, "all"> | "other" {
  for (const [key, set] of Object.entries(FILTER_STATUSES)) {
    if (set.has(status)) return key as Exclude<MobileMatterFilter, "all">;
  }
  return "other";
}
