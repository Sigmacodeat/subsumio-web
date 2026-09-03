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
      console.error("[env] Aborting server startup — fix the above environment variables.");
      process.exit(1);
    }
    if (env.warnings.length > 0 && process.env.NODE_ENV !== "production") {
      for (const w of env.warnings) console.warn(`[env] ${w}`);
    }

    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV,
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    });

    // Global error handlers — catch unhandled promise rejections and uncaught
    // exceptions so they're reported to Sentry instead of crashing silently
    // or producing "UnhandledPromiseRejection" warnings that are easy to miss.
    // These are LAST-RESORT handlers; code should still try/catch where it
    // can recover. The handlers do NOT swallow errors — they log + report
    // and let the process continue (Next.js handles request-level errors
    // via error boundaries + onRequestError).
    process.on("unhandledRejection", (reason) => {
      const err = reason instanceof Error ? reason : new Error(String(reason));
      console.error("[unhandledRejection]", err.message, err.stack);
      Sentry.captureException(err, { tags: { source: "unhandledRejection" } });
    });

    process.on("uncaughtException", (err) => {
      console.error("[uncaughtException]", err.message, err.stack);
      Sentry.captureException(err, { tags: { source: "uncaughtException" } });
      // In production, an uncaughtException means the process state may be
      // corrupted. Flush Sentry events before exiting so they're not lost.
      // Next.js runs as a managed process (PM2/Docker) and will restart.
      if (process.env.NODE_ENV === "production") {
        Sentry.flush(2000).finally(() => process.exit(1));
      }
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
