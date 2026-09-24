/**
 * Firm model profile — shared web types. Mirrors the engine contract in
 * server/src/core/model-profile.ts (GET/PUT /api/settings/model-profile).
 * The engine is the authority on floors and locked areas; the web app only
 * validates the shape.
 */

export const MODEL_AREAS = [
  "chat",
  "erfassung",
  "analyse",
  "fristen",
  "entwuerfe",
  "qualitaet",
] as const;
export type ModelArea = (typeof MODEL_AREAS)[number];

export const AREA_CHOICES = ["auto", "utility", "reasoning", "deep"] as const;
export type AreaChoice = (typeof AREA_CHOICES)[number];

export interface ModelProfileAreaView {
  id: ModelArea;
  floor: Exclude<AreaChoice, "auto">;
  locked: boolean;
  choice: AreaChoice;
  options: Array<{ choice: AreaChoice; models: string[] }>;
}

export interface ModelProfileChatLimit {
  /** Tier a chat answer runs on at minimum (the firm's chat setting). */
  chatMinimumTier: Exclude<AreaChoice, "auto">;
  /** Catalogue ids a user may still pick per question; others are below the minimum. */
  allowedChatPicks: string[];
}

export interface ModelProfileResponse extends ModelProfileChatLimit {
  profile: {
    areas: Record<ModelArea, AreaChoice>;
    updated_at: string | null;
    updated_by: string | null;
  };
  areas: ModelProfileAreaView[];
  /** USD per 1M tokens (canonical API price) per model id; null when unpriced. */
  pricing: Record<string, { input: number; output: number } | null>;
  /** Display name of the user who last changed the profile (web-resolved). */
  updatedByName: string | null;
  /** Whether the caller may change the profile (admins only). */
  canEdit: boolean;
}
