/**
 * Centralized environment variable validation.
 * Called at startup to fail fast when required variables are missing.
 */

type EnvVarSpec = {
  name: string;
  required: boolean;
  description: string;
  validate?: (value: string) => boolean;
};

const ENV_SPECS: EnvVarSpec[] = [
  { name: "AUTH_SECRET", required: true, description: "HMAC secret for session tokens" },
  { name: "SIGMABRAIN_ENCRYPTION_KEY", required: true, description: "AES-256 key for at-rest encryption" },
  { name: "SIGMABRAIN_API_URL", required: true, description: "Engine API URL" },
  { name: "SIGMABRAIN_WEB_API_KEY", required: true, description: "Engine API key for server-to-server auth" },
  { name: "SIGMABRAIN_INTERNAL_SECRET", required: true, description: "Internal secret for service-to-service calls" },
  { name: "UPSTASH_REDIS_REST_URL", required: true, description: "Upstash Redis REST URL for rate limiting" },
  { name: "UPSTASH_REDIS_REST_TOKEN", required: true, description: "Upstash Redis REST token" },
  { name: "RESEND_API_KEY", required: false, description: "Resend API key for transactional email" },
  { name: "SENTRY_DSN", required: false, description: "Sentry DSN for error tracking" },
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
    const value = process.env[spec.name];
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
