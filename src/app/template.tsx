// Global route transition. template.tsx re-mounts on every navigation.
// Premium slide-up + fade — the translateY keeps within the viewport so
// position:fixed children (parallax background, sticky nav) are unaffected.
// Respects prefers-reduced-motion via @media.
//
// CSS-only implementation (audit 2026-08-23): replaced framer-motion (~50KB
// gzipped) with @keyframes — zero JS cost, works without JS, same visual.

export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="route-transition">{children}</div>;
}
