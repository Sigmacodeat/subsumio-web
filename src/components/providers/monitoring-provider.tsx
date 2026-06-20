"use client";

import * as React from "react";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { Analytics } from "@vercel/analytics/react";

const POSTHOG_KEY = typeof window !== "undefined" ? process.env.NEXT_PUBLIC_POSTHOG_KEY : "";
const POSTHOG_HOST = typeof window !== "undefined" ? (process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com") : "";

function usePostHogInit() {
  React.useEffect(() => {
    if (POSTHOG_KEY && !posthog.__loaded) {
      posthog.init(POSTHOG_KEY, { api_host: POSTHOG_HOST, capture_pageview: false });
    }
  }, []);
}

export function MonitoringProvider({ children }: { children: React.ReactNode }) {
  usePostHogInit();

  if (!POSTHOG_KEY) {
    return (
      <>
        {children}
        <Analytics />
      </>
    );
  }

  return (
    <PostHogProvider client={posthog}>
      {children}
      <Analytics />
    </PostHogProvider>
  );
}
