"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * AP2: time/time-tracking merge.
 * /dashboard/time is the canonical time-entry list and creation page.
 * /dashboard/time-tracking redirects there while preserving query intent.
 */
export default function TimeTrackingRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    router.replace(`/dashboard/time${query ? `?${query}` : ""}`);
  }, [router, searchParams]);

  return null;
}
