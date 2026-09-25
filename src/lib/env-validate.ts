/**
 * Centralized environment variable validation.
 * Called at startup to fail fast when required variables are missing.
 */

type EnvVarSpec = {
  name: string;
  required: boolean;
  description: string;
  validate?: (value: string) => boolean;
  /** Other names that satisfy this requirement (any one of them is enough). */
  alternatives?: string[];
};

const ENV_SPECS: EnvVarSpec[] = [
  { name: "AUTH_SECRET", required: true, description: "HMAC secret for session tokens" },
  {
    name: "SUBSUMIO_ENCRYPTION_KEY",
    required: true,
    description: "AES-256 key for at-rest encryption",
  },
  { name: "SUBSUMIO_API_URL", required: true, description: "Engine API URL" },
  {
    name: "SUBSUMIO_WEB_API_KEY",
    required: true,
    description: "Engine API key for server-to-server auth",
  },
  {
    name: "SUBSUMIO_INTERNAL_SECRET",
    required: true,
    description: "Internal secret for service-to-service calls",
  },
  {
    // Without it every cron answers 503 — deadline reminders included —
    // while the app itself looks healthy.
    name: "CRON_SECRET",
    required: true,
    description: "Bearer secret for scheduled jobs (deadline reminders, dunning, backups)",
  },
  {
    // Checked lazily on the first portal link otherwise.
    name: "PORTAL_TOKEN_SECRET",
    required: true,
    description: "HMAC secret for client-portal links",
  },
  {
    name: "SUBSUMIO_AUTH_DATABASE_URL",
    alternatives: ["DATABASE_URL"],
    required: true,
    description: "Postgres URL for accounts, sessions and revocations (or DATABASE_URL)",
  },
  {
    name: "UPSTASH_REDIS_REST_URL",
    required: false,
    description:
      "Upstash Redis REST URL for rate limiting (optional — in-memory fallback available)",
  },
  {
    name: "UPSTASH_REDIS_REST_TOKEN",
    required: false,
    description: "Upstash Redis REST token (optional — in-memory fallback available)",
  },
  {
    name: "RESEND_API_KEY",
    required: false,
    description: "Resend API key for transactional email",
  },
  {
    // The name the code reads: browser (src/instrumentation-client.ts, baked
    // in at build time) and, unless SENTRY_DSN overrides it, the server.
    name: "NEXT_PUBLIC_SENTRY_DSN",
    required: false,
    description: "Sentry DSN for error tracking (browser + server fallback)",
  },
  {
    name: "SENTRY_DSN",
    required: false,
    description: "Optional server-only Sentry DSN (overrides NEXT_PUBLIC_SENTRY_DSN on the server)",
  },
];

export interface EnvValidationResult {
  ok: boolean;
  missing: string[];
  warnings: string[];
}

export function validateEnv(): EnvValidationResult {
  const isProd = process.env.NODE_ENV === "production";
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const spec of ENV_SPECS) {
    const value = [spec.name, ...(spec.alternatives ?? [])]
      .map((name) => process.env[name])
      .find((v) => !!v);
    if (spec.required && isProd && !value) {
      missing.push(`${spec.name}: ${spec.description}`);
    } else if (!value && !isProd) {
      warnings.push(`${spec.name} not set (ok for dev)`);
    }
  }

  if (missing.length > 0) {
    console.error("[env] Missing required environment variables in production:");
    for (const m of missing) console.error(`  - ${m}`);
  }

  return { ok: missing.length === 0, missing, warnings };
}

/**
 * Required variables that are missing in this environment (production only).
 * Used by the readiness probe so a misconfigured deployment reports "down"
 * instead of "ok".
 */
export function missingRequiredEnv(): string[] {
  if (process.env.NODE_ENV !== "production") return [];
  return ENV_SPECS.filter(
    (spec) =>
      spec.required && ![spec.name, ...(spec.alternatives ?? [])].some((n) => !!process.env[n])
  ).map((spec) => spec.name);
}
