import * as Sentry from "@sentry/nextjs";
import { validateEnv } from "@/lib/env-validate";

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Fail fast: validate required environment variables at server startup.
    // In production a missing required var aborts boot so we never serve a
    // half-configured app; in dev we only warn.
    const env = validateEnv();
    if (!env.ok && process.env.NODE_ENV === "production") {
      console.error(
        "[env] Missing required environment variables in production:\n  - " +
          env.missing.join("\n  - ")
      );
      console.error("[env] Server will continue but features requiring these vars will fail.");
    }
    if (env.warnings.length > 0 && process.env.NODE_ENV !== "production") {
      for (const w of env.warnings) console.warn(`[env] ${w}`);
    }

    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    });
  }

  if (process.env.NEXT_RUNTIME === "browser") {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
