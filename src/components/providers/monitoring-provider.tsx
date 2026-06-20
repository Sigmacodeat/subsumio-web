"use client";

import * as React from "react";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { Analytics } from "@vercel/analytics/react";
import { useAnalyticsConsent } from "@/components/marketing/analytics-consent";

const POSTHOG_KEY = typeof window !== "undefined" ? process.env.NEXT_PUBLIC_POSTHOG_KEY : "";
const POSTHOG_HOST = typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com") : "";

function usePostHogInit() {
  const { consent } = useAnalyticsConsent();

  React.useEffect(() => {
    if (POSTHOG_KEY && consent === "accepted" && !posthog.__loaded) {
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        capture_pageview: true,
        persistence: "localStorage+cookie",
      });
    } else if (POSTHOG_KEY && consent === "declined" && posthog.__loaded) {
      posthog.opt_out_capturing();
    }
  }, [consent]);
}

export function MonitoringProvider({ children }: { children: React.ReactNode }) {
  const { consent } = useAnalyticsConsent();
  usePostHogInit();

  const analyticsEnabled = consent === "accepted";

  if (!POSTHOG_KEY) {
    return (
      <>
        {children}
        {analyticsEnabled && <Analytics />}
      </>
    );
  }

  if (!analyticsEnabled) {
    return <>{children}</>;
  }

  return (
    <PostHogProvider client={posthog}>
      {children}
      <Analytics />
    </PostHogProvider>
  );
}
