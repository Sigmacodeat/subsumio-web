/**
 * Environment variable resolution for Subsumio.
 *
 * Usage:
 *   import { env } from "@/lib/env";
 *   const apiKey = env("SUBSUMIO_WEB_API_KEY");
 */

export function env(key: string): string | undefined {
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
