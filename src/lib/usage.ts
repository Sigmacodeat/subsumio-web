// Usage metering — monthly query counters per brain.
//
// Now delegates to the quota system in plans.ts (subsumio_quota table),
// eliminating the redundant subsumio_usage table. The file-based fallback
// for dev/self-hosted is still handled by plans.ts (quota.json).

import { currentMonth } from "@/lib/datetime";
import { incQuota, getQuota } from "@/lib/plans";

/** Record one query (think or search) for a brain. Never throws. */
export async function recordQuery(brainId: string): Promise<void> {
  await incQuota(brainId, "queries", 1);
}

export interface MonthUsage {
  month: string;
  queries: number;
}

export async function usageFor(brainId: string): Promise<MonthUsage> {
  const month = currentMonth();
  try {
    const quota = await getQuota(brainId);
    return { month, queries: quota.queries };
  } catch (err) {
    console.error(`[usage] read failed: ${err instanceof Error ? err.message : String(err)}`);
    return { month, queries: 0 };
  }
}
