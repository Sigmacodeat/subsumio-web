import { ENGINE_URL } from "@/lib/engine";
import type { BrainPage } from "@/lib/types";
import { buildWorkItems, type WorkItem } from "@/lib/work-items";

export interface OperationsData {
  items: WorkItem[];
  counts: Record<string, number>;
  generatedAt: string;
}

const TYPES = [
  "chat_inbox",
  "client_submission",
  "legal_document",
  "pipeline_state",
  "agent_action",
  "legal_deadline",
  "appointment",
];

/**
 * Fetch operations data from the engine and build work items.
 * Shared between the API route (/api/dashboard/operations) and the
 * Server Component (dashboard/operations/page.tsx) for initial data.
 */
export async function fetchOperationsData(
  headers: Record<string, string>,
  limit: number = 200
): Promise<OperationsData> {
  const pagesByType: Record<string, BrainPage[]> = {};
  await Promise.all(
    TYPES.map(async (type) => {
      const response = await fetch(
        `${ENGINE_URL}/api/pages?type=${encodeURIComponent(type)}&limit=${limit}`,
        { headers, signal: AbortSignal.timeout(15_000) }
      );
      if (!response.ok) throw new Error(`operations_${type}_${response.status}`);
      const data = (await response.json()) as BrainPage[] | { pages?: BrainPage[] };
      pagesByType[type] = Array.isArray(data) ? data : (data.pages ?? []);
    })
  );
  const items = buildWorkItems(pagesByType);
  const counts = items.reduce<Record<string, number>>((result, item) => {
    result[item.kind] = (result[item.kind] ?? 0) + 1;
    result[item.priority] = (result[item.priority] ?? 0) + 1;
    return result;
  }, {});
  return { items, counts, generatedAt: new Date().toISOString() };
}
