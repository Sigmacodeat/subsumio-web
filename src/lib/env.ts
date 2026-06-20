/**
 * Backward-compatible environment variable resolution.
 *
 * SUBSUMIO_* is the primary prefix; SIGMABRAIN_* is the legacy fallback.
 * This allows gradual migration without breaking existing deployments.
 *
 * Usage:
 *   import { env } from "@/lib/env";
 *   const apiKey = env("SIGMABRAIN_WEB_API_KEY");
 *   // Resolves SUBSUMIO_WEB_API_KEY first, falls back to SIGMABRAIN_WEB_API_KEY
 */

export function env(key: string): string | undefined {
  if (key.startsWith("SIGMABRAIN_")) {
    const subsumioKey = key.replace("SIGMABRAIN_", "SUBSUMIO_");
    return process.env[subsumioKey] ?? process.env[key];
  }
  if (key.startsWith("NEXT_PUBLIC_SIGMABRAIN_")) {
    const subsumioKey = key.replace("SIGMABRAIN_", "SUBSUMIO_");
    return process.env[subsumioKey] ?? process.env[key];
  }
  return process.env[key];
}

export function envString(key: string, fallback: string): string {
  return env(key) ?? fallback;
}

export function envBool(key: string, fallback = false): boolean {
  const val = env(key);
  if (val === undefined) return fallback;
  return val === "true" || val === "1" || val === "yes";
}
