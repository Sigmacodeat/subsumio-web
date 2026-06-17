"use client";

// Global route transition. template.tsx re-mounts on every navigation.
// Premium slide-up + fade — the translateY keeps within the viewport so
// position:fixed children (parallax background, sticky nav) are unaffected.
// Spring easing gives a natural, non-mechanical feel.
// Respects prefers-reduced-motion via MotionConfig.

import { motion, MotionConfig } from "framer-motion";

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.45,
          ease: [0.22, 1, 0.36, 1], // custom cubic — smooth deceleration
          opacity: { duration: 0.3 },
        }}
        style={{ willChange: "opacity, transform" }}
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
