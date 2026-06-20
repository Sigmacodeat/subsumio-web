import type { SCIMGroup } from "@/lib/scim";

// In-memory group store (groups are synced from WorkOS but not persisted to the user store)
// In production with Postgres, this would use a dedicated table.
export const groups: Map<string, SCIMGroup> = new Map();
