/**
 * Environment variable resolution for Subsumio.
 *
 * Usage:
 *   import { env, envRequired, envString, envBool, envInt } from "@/lib/env";
 *   const apiKey = envRequired("SUBSUMIO_WEB_API_KEY");
 *   const port = envInt("PORT", 3000);
 */

export function env(key: string): string | undefined {
  return process.env[key];
}

/**
 * Get a required environment variable. Throws in production if missing.
 * In development, returns undefined and logs a warning.
 */
export function envRequired(key: string): string {
  const value = env(key);
  if (!value) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`Required environment variable ${key} is not set`);
    }
    console.warn(`[env] ${key} is not set (ok for dev)`);
  }
  return value ?? "";
}

export function envString(key: string, fallback: string): string {
  return env(key) ?? fallback;
}

export function envBool(key: string, fallback = false): boolean {
  const val = env(key);
  if (val === undefined) return fallback;
  return val === "true" || val === "1" || val === "yes";
}

export function envInt(key: string, fallback: number): number {
  const val = env(key);
  if (!val) return fallback;
  const parsed = parseInt(val, 10);
  if (isNaN(parsed)) {
    console.warn(`[env] ${key} is not a valid integer, using fallback ${fallback}`);
    return fallback;
  }
  return parsed;
}
