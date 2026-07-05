/**
 * Feature Flags — Web-side flag management.
 * Stores flags in the data directory (JSON file) or PostgreSQL.
 * Supports per-flag overrides with rollout percentages and plan/role targeting.
 */

import { promises as fs } from "fs";
import path from "path";
import { getSharedPgPool } from "./auth/store";
import { createSchemaInit } from "./schema-init";
import { logger } from "./logger";

const log = logger("feature-flags");

export interface FeatureFlag {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;
  allowedPlans: string[];
  allowedRoles: string[];
  updatedAt: string;
  updatedBy: string;
}

export interface FeatureFlagCheckContext {
  userId?: string;
  plan?: string;
  role?: string;
}

const ensureSchema = createSchemaInit(`
  CREATE TABLE IF NOT EXISTS subsumio_feature_flags (
    key text NOT NULL PRIMARY KEY,
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    enabled boolean NOT NULL DEFAULT false,
    rollout_percentage integer NOT NULL DEFAULT 100,
    allowed_plans text[] NOT NULL DEFAULT '{}',
    allowed_roles text[] NOT NULL DEFAULT '{}',
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by text NOT NULL DEFAULT 'system'
  );
`);

const DATA_DIR = process.env.SUBSUMIO_DATA_DIR || path.join(process.cwd(), ".data");
const FLAGS_FILE = path.join(DATA_DIR, "feature-flags.json");

const DEFAULT_FLAGS: FeatureFlag[] = [
  {
    key: "autonomous_engine",
    name: "Autonomous Engine",
    description: "Background task processing (deadline follow-up, inbox triage, document analysis)",
    enabled: true,
    rolloutPercentage: 100,
    allowedPlans: [],
    allowedRoles: [],
    updatedAt: new Date().toISOString(),
    updatedBy: "system",
  },
  {
    key: "webhook_outgoing",
    name: "Outgoing Webhooks",
    description: "Dispatch outgoing webhook events to registered endpoints",
    enabled: true,
    rolloutPercentage: 100,
    allowedPlans: [],
    allowedRoles: [],
    updatedAt: new Date().toISOString(),
    updatedBy: "system",
  },
  {
    key: "posthog_tracking",
    name: "PostHog Event Tracking",
    description: "Track key user journey events in PostHog",
    enabled: true,
    rolloutPercentage: 100,
    allowedPlans: [],
    allowedRoles: [],
    updatedAt: new Date().toISOString(),
    updatedBy: "system",
  },
  {
    key: "voice_input",
    name: "Voice-to-Prompt",
    description: "Voice input for chat and mobile prompts",
    enabled: true,
    rolloutPercentage: 100,
    allowedPlans: [],
    allowedRoles: [],
    updatedAt: new Date().toISOString(),
    updatedBy: "system",
  },
  {
    key: "deep_analysis",
    name: "Deep Analysis Tool",
    description: "Deep narrative analysis across Vault documents (Copilot)",
    enabled: false,
    rolloutPercentage: 100,
    allowedPlans: ["pro", "enterprise"],
    allowedRoles: ["admin", "lawyer"],
    updatedAt: new Date().toISOString(),
    updatedBy: "system",
  },
  {
    key: "precedent_search",
    name: "Precedent Search",
    description: "Search for legal precedents (Copilot tool)",
    enabled: false,
    rolloutPercentage: 100,
    allowedPlans: ["pro", "enterprise"],
    allowedRoles: ["admin", "lawyer"],
    updatedAt: new Date().toISOString(),
    updatedBy: "system",
  },
  {
    key: "litigation_analytics",
    name: "Litigation Analytics",
    description: "Case outcome analytics and court statistics",
    enabled: true,
    rolloutPercentage: 100,
    allowedPlans: [],
    allowedRoles: [],
    updatedAt: new Date().toISOString(),
    updatedBy: "system",
  },
  {
    key: "elster_integration",
    name: "ELSTER Integration",
    description: "Tax filing via ELSTER XML submission",
    enabled: true,
    rolloutPercentage: 100,
    allowedPlans: [],
    allowedRoles: [],
    updatedAt: new Date().toISOString(),
    updatedBy: "system",
  },
];

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function hashUserId(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export async function listFeatureFlags(): Promise<FeatureFlag[]> {
  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureSchema();
      const result = await pool.query(
        "SELECT key, name, description, enabled, rollout_percentage, allowed_plans, allowed_roles, updated_at, updated_by FROM subsumio_feature_flags ORDER BY key"
      );
      if (result.rows.length > 0) {
        return result.rows.map((row) => ({
          key: row.key as string,
          name: row.name as string,
          description: row.description as string,
          enabled: row.enabled as boolean,
          rolloutPercentage: row.rollout_percentage as number,
          allowedPlans: (row.allowed_plans as string[]) ?? [],
          allowedRoles: (row.allowed_roles as string[]) ?? [],
          updatedAt:
            row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
          updatedBy: row.updated_by as string,
        }));
      }
    } catch (err) {
      log.error("Failed to list flags from DB, falling back to file", { error: String(err) });
    }
  }

  // File fallback
  await ensureDataDir();
  try {
    const raw = await fs.readFile(FLAGS_FILE, "utf-8");
    const flags = JSON.parse(raw) as FeatureFlag[];
    if (flags.length > 0) return flags;
  } catch {}
  // Initialize with defaults
  await fs.writeFile(FLAGS_FILE, JSON.stringify(DEFAULT_FLAGS, null, 2), "utf-8");
  return DEFAULT_FLAGS;
}

export async function getFeatureFlag(key: string): Promise<FeatureFlag | null> {
  const flags = await listFeatureFlags();
  return flags.find((f) => f.key === key) ?? null;
}

export async function upsertFeatureFlag(
  key: string,
  updates: Partial<Omit<FeatureFlag, "key" | "updatedAt" | "updatedBy">>,
  updatedBy: string
): Promise<FeatureFlag | null> {
  const existing = await getFeatureFlag(key);
  if (!existing) return null;

  const updated: FeatureFlag = {
    ...existing,
    ...updates,
    key,
    updatedAt: new Date().toISOString(),
    updatedBy,
  };

  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureSchema();
      await pool.query(
        `INSERT INTO subsumio_feature_flags (key, name, description, enabled, rollout_percentage, allowed_plans, allowed_roles, updated_at, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8)
         ON CONFLICT (key) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           enabled = EXCLUDED.enabled,
           rollout_percentage = EXCLUDED.rollout_percentage,
           allowed_plans = EXCLUDED.allowed_plans,
           allowed_roles = EXCLUDED.allowed_roles,
           updated_at = now(),
           updated_by = EXCLUDED.updated_by`,
        [
          updated.key,
          updated.name,
          updated.description,
          updated.enabled,
          updated.rolloutPercentage,
          updated.allowedPlans,
          updated.allowedRoles,
          updatedBy,
        ]
      );
      return updated;
    } catch (err) {
      log.error("Failed to upsert flag in DB, falling back to file", { error: String(err) });
    }
  }

  // File fallback
  await ensureDataDir();
  try {
    const raw = await fs.readFile(FLAGS_FILE, "utf-8");
    const all = JSON.parse(raw) as FeatureFlag[];
    const idx = all.findIndex((f) => f.key === key);
    if (idx !== -1) {
      all[idx] = updated;
      const tmp = `${FLAGS_FILE}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(all, null, 2));
      await fs.rename(tmp, FLAGS_FILE);
    }
    return updated;
  } catch (err) {
    log.error("Failed to upsert flag in file", { error: String(err) });
    return null;
  }
}

export async function createFeatureFlag(
  flag: Omit<FeatureFlag, "updatedAt" | "updatedBy">,
  createdBy: string
): Promise<FeatureFlag> {
  const newFlag: FeatureFlag = {
    ...flag,
    updatedAt: new Date().toISOString(),
    updatedBy: createdBy,
  };

  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureSchema();
      await pool.query(
        `INSERT INTO subsumio_feature_flags (key, name, description, enabled, rollout_percentage, allowed_plans, allowed_roles, updated_at, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8)
         ON CONFLICT (key) DO NOTHING`,
        [
          newFlag.key,
          newFlag.name,
          newFlag.description,
          newFlag.enabled,
          newFlag.rolloutPercentage,
          newFlag.allowedPlans,
          newFlag.allowedRoles,
          createdBy,
        ]
      );
      return newFlag;
    } catch (err) {
      log.error("Failed to create flag in DB, falling back to file", { error: String(err) });
    }
  }

  // File fallback
  await ensureDataDir();
  try {
    let all: FeatureFlag[] = [];
    try {
      const raw = await fs.readFile(FLAGS_FILE, "utf-8");
      all = JSON.parse(raw) as FeatureFlag[];
    } catch {}
    if (!all.find((f) => f.key === newFlag.key)) {
      all.push(newFlag);
      const tmp = `${FLAGS_FILE}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(all, null, 2));
      await fs.rename(tmp, FLAGS_FILE);
    }
    return newFlag;
  } catch (err) {
    log.error("Failed to create flag in file", { error: String(err) });
    return newFlag;
  }
}

export async function deleteFeatureFlag(key: string): Promise<boolean> {
  const pool = getSharedPgPool();
  if (pool) {
    try {
      await ensureSchema();
      const result = await pool.query("DELETE FROM subsumio_feature_flags WHERE key = $1", [key]);
      return (result.rowCount ?? 0) > 0;
    } catch (err) {
      log.error("Failed to delete flag from DB", { error: String(err) });
    }
  }

  // File fallback
  try {
    const raw = await fs.readFile(FLAGS_FILE, "utf-8");
    const all = JSON.parse(raw) as FeatureFlag[];
    const filtered = all.filter((f) => f.key !== key);
    if (filtered.length === all.length) return false;
    const tmp = `${FLAGS_FILE}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(filtered, null, 2));
    await fs.rename(tmp, FLAGS_FILE);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a feature flag is enabled for a given context.
 * Considers: flag enabled state, rollout percentage, plan/role restrictions.
 */
export async function isFeatureEnabled(
  key: string,
  ctx?: FeatureFlagCheckContext
): Promise<boolean> {
  const flag = await getFeatureFlag(key);
  if (!flag) return false;
  if (!flag.enabled) return false;

  // Plan restriction
  if (flag.allowedPlans.length > 0 && ctx?.plan) {
    if (!flag.allowedPlans.includes(ctx.plan)) return false;
  }

  // Role restriction
  if (flag.allowedRoles.length > 0 && ctx?.role) {
    if (!flag.allowedRoles.includes(ctx.role)) return false;
  }

  // Rollout percentage
  if (flag.rolloutPercentage < 100) {
    if (!ctx?.userId) return false;
    const hash = hashUserId(ctx.userId);
    const bucket = hash % 100;
    if (bucket >= flag.rolloutPercentage) return false;
  }

  return true;
}
