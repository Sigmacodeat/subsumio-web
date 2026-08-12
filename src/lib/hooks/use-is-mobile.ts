"use client";

import { useMediaQuery } from "./use-media-query";

/**
 * Mobile-Breakpoint — konsistent mit dem shadcn-Dialog-Breakpoint
 * (`sm:` = 640px in Tailwind v4). Wir treaten <640px als Mobile,
 * >=640px als Desktop. Bottom-Sheets rendern unter 640px, zentrierte
 * Dialoge ab 640px.
 */
export const MOBILE_BREAKPOINT = 640;

/**
 * SSR-safe `useIsMobile`. True wenn Viewport < MOBILE_BREAKPOINT.
 *
 * Server rendert `false` (Desktop-First), Client reconciled nach Hydration.
 * Kein Hydration-Mismatch dank `useSyncExternalStore`.
 *
 * @example
 * const isMobile = useIsMobile();
 * return isMobile ? <BottomSheet /> : <CenteredDialog />;
 */
export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`, false);
}
