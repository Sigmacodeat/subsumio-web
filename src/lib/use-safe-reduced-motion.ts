"use client";

import { useEffect, useState } from "react";
import { useReducedMotion as useFramerReducedMotion } from "framer-motion";

/**
 * Hydration-safe `prefers-reduced-motion`.
 *
 * Framer's hook returns `null` on the server and the real preference on the
 * client's first render. Components that branch on it at render time then
 * hydrate with different markup than the server sent — React keeps the
 * server's inline styles, so a headline revealed from `blur(8px)` or
 * `opacity: 0` stayed blurred or invisible for every reduced-motion user.
 * This hook reports `false` until the component has mounted, so the first
 * client render matches the server; the static branch takes over right after.
 */
export function useReducedMotion(): boolean {
  const prefers = useFramerReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? Boolean(prefers) : false;
}
