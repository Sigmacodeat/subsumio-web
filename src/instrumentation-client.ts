// Browser-side Sentry. Next.js (15.3+) loads this file in the client bundle
// before the app becomes interactive; `register()` in src/instrumentation.ts
// runs only on the server (nodejs/edge), so without this file client-side
// errors never reached Sentry. No-op when NEXT_PUBLIC_SENTRY_DSN is unset
// (baked in at build time — see Dockerfile.web).
import * as Sentry from "@sentry/nextjs";
import { sentryPrivacyOptions } from "@/lib/sentry-scrub";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    // Legal data on screen: no session replays.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    // No PII, scrubbed messages/URLs/breadcrumbs (src/lib/sentry-scrub.ts).
    ...sentryPrivacyOptions,
  });
}

// App Router navigation spans (no-op while Sentry is not initialised).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
