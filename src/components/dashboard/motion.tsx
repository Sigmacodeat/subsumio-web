"use client";

import { motion, useReducedMotion, type Transition } from "framer-motion";

export const dashboardSpring: Transition = {
  type: "spring",
  stiffness: 520,
  damping: 44,
  mass: 0.76,
};

export const dashboardPanelSpring: Transition = {
  type: "spring",
  stiffness: 430,
  damping: 42,
  mass: 0.82,
};

export const dashboardTapSpring: Transition = {
  type: "spring",
  stiffness: 560,
  damping: 42,
  mass: 0.64,
};

export const dashboardReducedMotion: Transition = { duration: 0 };

export function useDashboardMotion() {
  const reduceMotion = useReducedMotion();
  return {
    reduceMotion,
    popoverTransition: reduceMotion ? dashboardReducedMotion : dashboardSpring,
    panelTransition: reduceMotion ? dashboardReducedMotion : dashboardPanelSpring,
    tapTransition: reduceMotion ? dashboardReducedMotion : dashboardTapSpring,
    popoverInitial: reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 },
    popoverAnimate: { opacity: 1, y: 0, scale: 1 },
    popoverExit: reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 },
    modalInitial: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.96 },
    modalAnimate: { opacity: 1, y: 0, scale: 1 },
    modalExit: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 },
  };
}

export { motion };
