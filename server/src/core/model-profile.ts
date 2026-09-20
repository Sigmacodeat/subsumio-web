/**
 * Per-firm model profile — which model tier each work area runs on.
 *
 * A firm (tenant source) picks, per work area, either "auto" (the built-in
 * per-specialist tier from specialist-defs.ts) or one fixed tier. The choice
 * is a TIER, never a raw model id: which model a tier maps to stays under the
 * operator's control (`models.tier.*`, TIER_DEFAULTS), so a firm can only
 * pick among models the operator has approved.
 *
 * Every area carries a floor. Liability-relevant work (deadlines and
 * limitation, the chat answer, drafting) never runs below `reasoning`; the
 * quality-control specialists are locked on `deep`. The floor is applied at
 * RESOLUTION time as well as on write, so a hand-edited or stale profile row
 * can never push work below it.
 *
 * Storage: `sources.config.model_profile` of the tenant source. Workers read
 * it through a short per-process TTL cache (PROFILE_CACHE_TTL_MS); a write in
 * the same process invalidates immediately, other processes pick it up
 * within the TTL.
 */
import type { BrainEngine } from "./engine.ts";
import type { ModelTier } from "./model-config.ts";
import { EMBEDDED_SPECIALISTS } from "./minions/specialist-defs.ts";

export const MODEL_AREAS = [
  "chat",
  "erfassung",
  "analyse",
  "fristen",
  "entwuerfe",
  "qualitaet",
] as const;
export type ModelArea = (typeof MODEL_AREAS)[number];

/** Tiers a firm may pin an area to. `subagent` is an engine-internal tier. */
export const SELECTABLE_TIERS = ["utility", "reasoning", "deep"] as const;
export type SelectableTier = (typeof SELECTABLE_TIERS)[number];
export type AreaChoice = "auto" | SelectableTier;

export interface ModelAreaDef {
  id: ModelArea;
  /** Lowest tier this area may run on, whatever the profile says. */
  floor: SelectableTier;
  /** Locked areas ignore the profile and always run on `floor` or higher. */
  locked: boolean;
  /** Specialists (specialist-defs.ts names) that belong to this area. */
  specialists: readonly string[];
  /** `/api/llm/complete` purposes that belong to this area. */
  purposes: readonly string[];
}

export const MODEL_AREA_DEFS: Record<ModelArea, ModelAreaDef> = {
  // Chat answers (/api/think) and the interactive research specialists.
  chat: {
    id: "chat",
    floor: "reasoning",
    locked: false,
    specialists: ["legal-researcher", "legal-analyst"],
    purposes: [],
  },
  // Reading the file: index, parties, facts, norms, damages, precedents.
  erfassung: {
    id: "erfassung",
    floor: "utility",
    locked: false,
    specialists: [
      "on-scanner",
      "entity-extractor",
      "law-matcher",
      "forensic-analyst",
      "fact-gap-detector",
      "damage-extractor",
      "precedent-matcher",
      "admissibility-checker",
    ],
    purposes: [],
  },
  // Evaluation and strategy: evidence, risk, costs, settlement, procedure.
  analyse: {
    id: "analyse",
    floor: "reasoning",
    locked: false,
    specialists: [
      "legal-strategist",
      "burden-of-proof-analyzer",
      "evidence-quality-assessor",
      "witness-expert-analyzer",
      "cost-benefit-analyzer",
      "settlement-analyzer",
      "enforcement-analyzer",
      "appeal-risk-analyzer",
      "procedural-strategist",
      "insurance-coverage-analyzer",
      "tax-impact-analyzer",
      "counterclaim-analyzer",
      "mediation-adr-analyzer",
      "cost-award-predictor",
      "cross-case-matrix",
      "institution-checklist",
    ],
    purposes: [],
  },
  // Deadlines and limitation: a missed deadline is the classic liability case.
  fristen: {
    id: "fristen",
    floor: "reasoning",
    locked: false,
    specialists: ["legal-deadline-extractor", "deadline-validator", "limitation-scanner"],
    purposes: ["deadline_extract"],
  },
  // Pleadings drafted by the pipeline and e-mail reply drafts.
  entwuerfe: {
    id: "entwuerfe",
    floor: "reasoning",
    locked: false,
    specialists: ["legal-drafter"],
    purposes: ["email_reply_draft"],
  },
  // Subsumption check, opponent simulation, critic: the verification layer.
  qualitaet: {
    id: "qualitaet",
    floor: "deep",
    locked: true,
    specialists: ["subsumption-checker", "opponent-simulator", "legal-critic"],
    purposes: [],
  },
};

const TIER_RANK: Record<ModelTier, number> = { subagent: 0, utility: 0, reasoning: 1, deep: 2 };

function maxTier(a: ModelTier, b: SelectableTier): ModelTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

/** True when `tier` is at least as strong as `floor`. */
export function tierAtLeast(tier: ModelTier, floor: ModelTier): boolean {
  return TIER_RANK[tier] >= TIER_RANK[floor];
}

const SPECIALIST_AREA = new Map<string, ModelArea>();
const PURPOSE_AREA = new Map<string, ModelArea>();
for (const def of Object.values(MODEL_AREA_DEFS)) {
  for (const s of def.specialists) SPECIALIST_AREA.set(s, def.id);
  for (const p of def.purposes) PURPOSE_AREA.set(p, def.id);
}

export function areaForSpecialist(name: string): ModelArea | undefined {
  return SPECIALIST_AREA.get(name);
}

export function areaForPurpose(purpose: string): ModelArea | undefined {
  return PURPOSE_AREA.get(purpose);
}

/** Choices a firm may store for an area (auto + every tier at or above the floor). */
export function allowedChoices(area: ModelArea): AreaChoice[] {
  const def = MODEL_AREA_DEFS[area];
  if (def.locked) return ["auto"];
  return ["auto", ...SELECTABLE_TIERS.filter((t) => TIER_RANK[t] >= TIER_RANK[def.floor])];
}

export type ModelProfileAreas = Record<ModelArea, AreaChoice>;

export interface ModelProfile {
  areas: ModelProfileAreas;
  updated_at: string | null;
  updated_by: string | null;
}

export function defaultModelProfile(): ModelProfile {
  const areas = {} as ModelProfileAreas;
  for (const a of MODEL_AREAS) areas[a] = "auto";
  return { areas, updated_at: null, updated_by: null };
}

/**
 * Read a stored profile leniently: anything unknown or not allowed for its
 * area falls back to "auto". Used on the READ path so a malformed row never
 * breaks a pipeline run — floors still apply at resolution.
 */
export function parseStoredProfile(raw: unknown): ModelProfile {
  const profile = defaultModelProfile();
  if (!raw || typeof raw !== "object") return profile;
  const r = raw as Record<string, unknown>;
  const areas = r.areas && typeof r.areas === "object" ? (r.areas as Record<string, unknown>) : {};
  for (const a of MODEL_AREAS) {
    const v = areas[a];
    if (typeof v === "string" && (allowedChoices(a) as string[]).includes(v)) {
      profile.areas[a] = v as AreaChoice;
    }
  }
  profile.updated_at = typeof r.updated_at === "string" ? r.updated_at : null;
  profile.updated_by = typeof r.updated_by === "string" ? r.updated_by : null;
  return profile;
}

export class ModelProfileValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ModelProfileValidationError";
  }
}

/**
 * Validate a profile update strictly (WRITE path). Unknown areas, unknown
 * choices, choices below an area's floor and changes to locked areas are all
 * rejected — never silently corrected. Areas missing from the update keep
 * their current value.
 */
export function validateProfileUpdate(
  current: ModelProfileAreas,
  update: unknown
): ModelProfileAreas {
  if (!update || typeof update !== "object" || Array.isArray(update)) {
    throw new ModelProfileValidationError("invalid_areas", "areas must be an object");
  }
  const next: ModelProfileAreas = { ...current };
  for (const [key, value] of Object.entries(update as Record<string, unknown>)) {
    if (!(MODEL_AREAS as readonly string[]).includes(key)) {
      throw new ModelProfileValidationError("unknown_area", `Unknown area "${key}"`);
    }
    const area = key as ModelArea;
    if (typeof value !== "string" || !["auto", ...SELECTABLE_TIERS].includes(value)) {
      throw new ModelProfileValidationError(
        "invalid_choice",
        `Area "${area}": choice must be auto, utility, reasoning or deep`
      );
    }
    if (!(allowedChoices(area) as string[]).includes(value)) {
      const def = MODEL_AREA_DEFS[area];
      throw new ModelProfileValidationError(
        def.locked ? "area_locked" : "below_floor",
        def.locked
          ? `Area "${area}" is fixed and cannot be changed`
          : `Area "${area}" cannot run below the ${def.floor} tier`
      );
    }
    next[area] = value as AreaChoice;
  }
  return next;
}

/**
 * The tier a unit of work in `area` runs on. `baseTier` is what the work would
 * use without a profile (the specialist's own tier, or the chat complexity
 * router's pick). The floor always wins.
 */
export function effectiveTier(
  area: ModelArea,
  baseTier: ModelTier,
  profile: ModelProfile
): ModelTier {
  const def = MODEL_AREA_DEFS[area];
  const choice = def.locked ? "auto" : profile.areas[area];
  const chosen: ModelTier = choice === "auto" ? baseTier : choice;
  return maxTier(chosen, def.floor);
}

// ── Storage ────────────────────────────────────────────────────────────

export const PROFILE_CONFIG_KEY = "model_profile";
export const PROFILE_CACHE_TTL_MS = 30_000;

const cache = new Map<string, { profile: ModelProfile; expires: number }>();

/** Drop cached profiles (one source, or all). Tests and the write path use this. */
export function invalidateModelProfileCache(sourceId?: string): void {
  if (sourceId) cache.delete(sourceId);
  else cache.clear();
}

/**
 * Load the profile of a tenant source. No source (CLI, legacy jobs) → the
 * default profile. A read failure also yields the default profile: defaults
 * plus floors are the safe behaviour, and a profile lookup must never fail a
 * pipeline run.
 */
export async function loadModelProfile(
  engine: BrainEngine | null,
  sourceId: string | null | undefined
): Promise<ModelProfile> {
  if (!engine || !sourceId) return defaultModelProfile();
  const hit = cache.get(sourceId);
  if (hit && hit.expires > Date.now()) return hit.profile;
  let profile: ModelProfile;
  try {
    const rows = await engine.executeRaw<{ profile: unknown }>(
      `SELECT config -> '${PROFILE_CONFIG_KEY}' AS profile FROM sources WHERE id = $1`,
      [sourceId]
    );
    let raw = rows[0]?.profile ?? null;
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch {
        raw = null;
      }
    }
    profile = parseStoredProfile(raw);
  } catch (err) {
    console.warn(
      `[model-profile] could not read profile for source "${sourceId}", using defaults: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return defaultModelProfile();
  }
  cache.set(sourceId, { profile, expires: Date.now() + PROFILE_CACHE_TTL_MS });
  return profile;
}

/**
 * Validate and persist a profile update for a tenant source. Returns the
 * stored profile. The caller must make sure the source row exists.
 */
export async function saveModelProfile(
  engine: BrainEngine,
  sourceId: string,
  update: unknown,
  updatedBy: string | null
): Promise<ModelProfile> {
  invalidateModelProfileCache(sourceId);
  const current = await loadModelProfile(engine, sourceId);
  const areas = validateProfileUpdate(current.areas, update);
  const profile: ModelProfile = {
    areas,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  };
  const ok = await engine.updateSourceConfig(sourceId, { [PROFILE_CONFIG_KEY]: profile });
  if (!ok) {
    throw new ModelProfileValidationError("unknown_source", `Unknown source "${sourceId}"`);
  }
  invalidateModelProfileCache(sourceId);
  return profile;
}

/**
 * Tier for a specialist run on behalf of a tenant. Specialists that belong to
 * no area keep their own tier (the area map is pinned complete by tests).
 */
export async function resolveSpecialistTier(
  engine: BrainEngine | null,
  sourceId: string | null | undefined,
  specialistName: string,
  baseTier: ModelTier
): Promise<ModelTier> {
  const area = areaForSpecialist(specialistName);
  if (!area) return baseTier;
  return effectiveTier(area, baseTier, await loadModelProfile(engine, sourceId));
}

/** Base tiers used by an area's "auto" choice, for display. */
export function autoTiersForArea(area: ModelArea): ModelTier[] {
  if (area === "chat") return ["reasoning", "deep"];
  const tiers = new Set<ModelTier>();
  for (const name of MODEL_AREA_DEFS[area].specialists) {
    const s = EMBEDDED_SPECIALISTS.find((e) => e.name === name);
    if (s?.modelTier) tiers.add(maxTier(s.modelTier, MODEL_AREA_DEFS[area].floor));
  }
  return [...tiers].sort((a, b) => TIER_RANK[a] - TIER_RANK[b]);
}

// ── Dashboard view ─────────────────────────────────────────────────────

export interface ModelProfileAreaView {
  id: ModelArea;
  floor: SelectableTier;
  locked: boolean;
  choice: AreaChoice;
  /** Every allowed choice with the model(s) it resolves to right now. */
  options: Array<{ choice: AreaChoice; models: string[] }>;
}

export interface ModelProfileView {
  profile: ModelProfile;
  areas: ModelProfileAreaView[];
  /** USD per 1M tokens for every model named in `areas`; null when unpriced. */
  pricing: Record<string, { input: number; output: number } | null>;
  /** Tier a chat answer runs on at minimum — the floor a per-question pick must clear. */
  chatMinimumTier: SelectableTier;
  /** Web catalogue ids a user may still pick for a chat answer. */
  allowedChatPicks: string[];
}

/**
 * The profile plus, for every area and choice, the model it resolves to
 * through the same config chain the runtime uses — so the dashboard shows
 * what actually runs, including operator overrides (`models.tier.*`,
 * `models.think`, `models.default`).
 */
export async function buildModelProfileView(
  engine: BrainEngine | null,
  profile: ModelProfile
): Promise<ModelProfileView> {
  const { resolveModel, TIER_DEFAULTS, pickableModelTiers } = await import("./model-config.ts");
  const { canonicalLookup } = await import("./model-pricing.ts");

  const memo = new Map<string, Promise<string>>();
  const modelFor = (area: ModelArea, tier: ModelTier): Promise<string> => {
    // Chat resolves through models.think first (think/index.ts); specialists
    // and purposes through models.tier.<tier> (subagent.ts).
    const configKey = area === "chat" ? "models.think" : `models.tier.${tier}`;
    const key = `${configKey}|${tier}`;
    let p = memo.get(key);
    if (!p) {
      p = resolveModel(engine, { tier, configKey, fallback: TIER_DEFAULTS[tier] });
      memo.set(key, p);
    }
    return p;
  };

  const areas: ModelProfileAreaView[] = [];
  for (const id of MODEL_AREAS) {
    const def = MODEL_AREA_DEFS[id];
    const options: ModelProfileAreaView["options"] = [];
    for (const choice of allowedChoices(id)) {
      const tiers =
        choice === "auto" ? autoTiersForArea(id) : [maxTier(choice, def.floor) as ModelTier];
      const models = [...new Set(await Promise.all(tiers.map((t) => modelFor(id, t))))];
      options.push({ choice, models });
    }
    areas.push({
      id,
      floor: def.floor,
      locked: def.locked,
      choice: def.locked ? "auto" : profile.areas[id],
      options,
    });
  }

  const pricing: ModelProfileView["pricing"] = {};
  for (const a of areas) {
    for (const o of a.options) {
      for (const m of o.models) {
        const p = canonicalLookup(m);
        pricing[m] = p ? { input: p.input, output: p.output } : null;
      }
    }
  }
  // A per-question pick in the chat may go stronger than the firm's chat
  // setting, never weaker (enforced in think/index.ts) — the picker greys out
  // the rest instead of letting the engine silently raise them.
  const chatMinimumTier = effectiveTier("chat", "reasoning", profile) as SelectableTier;
  const allowedChatPicks = pickableModelTiers()
    .filter((m) => TIER_RANK[m.tier] >= TIER_RANK[chatMinimumTier])
    .map((m) => m.id);

  return { profile, areas, pricing, chatMinimumTier, allowedChatPicks };
}
