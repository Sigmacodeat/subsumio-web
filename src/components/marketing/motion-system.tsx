"use client";

// Central motion system for all marketing pages.
// Eliminates copy-paste animation patterns across every page component.
// State-of-the-art: staggerChildren, spring physics, reduced-motion fallback,
// GPU-optimized transforms, clip-path reveals, glow cards, magnetic hover.

import {
  motion,
  useInView,
  useReducedMotion,
  useMotionValue,
  useSpring,
  useScroll,
  Variants,
} from "framer-motion";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// ---------------------------------------------------------------------------
// Viewport presets
// ---------------------------------------------------------------------------

export const VIEWPORT = {
  gentle: { once: true, margin: "0px 0px 80px 0px", amount: 0.12 },
  tight: { once: true, margin: "-60px" },
  hero: { once: true, margin: "0px" },
} as const;

// ---------------------------------------------------------------------------
// Easing curves (modern, non-linear)
// ---------------------------------------------------------------------------

export const EASE = {
  // Smooth deceleration — the default for scroll-reveals
  out: [0.22, 1, 0.36, 1] as const,
  // Snappy spring-like
  spring: [0.21, 0.5, 0.27, 1] as const,
  // Dramatic entrance
  dramatic: [0.16, 1, 0.3, 1] as const,
} as const;

// ---------------------------------------------------------------------------
// Base variants factory (reduced-motion aware)
// ---------------------------------------------------------------------------

function makeVariants(opts: {
  y?: number;
  x?: number;
  scale?: number;
  duration?: number;
  ease?: readonly [number, number, number, number];
  delay?: number;
}): Variants {
  const { y = 24, x = 0, scale = 1, duration = 0.5, ease = EASE.out, delay = 0 } = opts;
  return {
    hidden: { opacity: 0, y: y || 0, x: x || 0, scale },
    visible: {
      opacity: 1,
      y: 0,
      x: 0,
      scale: 1,
      transition: { duration, ease, delay },
    },
  };
}

// ---------------------------------------------------------------------------
// Pre-built reveal presets (use these instead of inline copy-paste)
// ---------------------------------------------------------------------------

export const REVEAL = {
  /** Default scroll-reveal: fade up 24px, 0.5s */
  up: (delay = 0) => makeVariants({ y: 24, duration: 0.5, delay }),
  /** Tighter fade up: 16px, 0.45s */
  upSm: (delay = 0) => makeVariants({ y: 16, duration: 0.45, delay }),
  /** Dramatic fade up: 32px, 0.6s */
  upLg: (delay = 0) => makeVariants({ y: 32, duration: 0.6, ease: EASE.dramatic, delay }),
  /** Fade from left: -20px x, 0.45s */
  left: (delay = 0) => makeVariants({ x: -20, duration: 0.45, delay }),
  /** Fade from right: +20px x, 0.45s */
  right: (delay = 0) => makeVariants({ x: 20, duration: 0.45, delay }),
  /** Scale-in: 0.96 -> 1, 0.5s */
  scale: (delay = 0) => makeVariants({ scale: 0.96, duration: 0.5, delay }),
  /** Subtle: 8px up, 0.4s — good for dense grids */
  subtle: (delay = 0) => makeVariants({ y: 8, duration: 0.4, delay }),
} as const;

// ---------------------------------------------------------------------------
// Stagger container (replaces manual delay math everywhere)
// ---------------------------------------------------------------------------

interface StaggerContainerProps {
  children: ReactNode;
  className?: string;
  stagger?: number; // delay between children (default 0.08)
  duration?: number; // base duration (default 0.45)
  viewport?: { once?: boolean; margin?: string; amount?: number };
  y?: number; // initial y offset
  as?: "div" | "section" | "ul" | "ol";
}

export function StaggerContainer({
  children,
  className = "",
  stagger = 0.08,
  duration = 0.45,
  viewport = VIEWPORT.gentle,
  y = 20,
  as: Tag = "div",
}: StaggerContainerProps) {
  const reduce = useReducedMotion();

  const container: Variants = useMemo(
    () => ({
      hidden: {},
      visible: {
        transition: { staggerChildren: reduce ? 0 : stagger },
      },
    }),
    [reduce, stagger]
  );

  const child: Variants = useMemo(
    () => ({
      hidden: { opacity: 0, y: reduce ? 0 : y },
      visible: {
        opacity: 1,
        y: 0,
        transition: { duration, ease: EASE.out },
      },
    }),
    [reduce, y, duration]
  );

  // The grid/flex className MUST sit on the element that DIRECTLY contains the
  // StaggerItems, otherwise the items aren't grid children and collapse into a
  // single column. A Context.Provider renders no DOM node, so children become
  // direct children of the motion element. We pick the motion component that
  // matches the requested semantic tag (div/section/ul/ol).
  const MotionTag =
    Tag === "section"
      ? motion.section
      : Tag === "ul"
        ? motion.ul
        : Tag === "ol"
          ? motion.ol
          : motion.div;

  return (
    <MotionTag
      initial="hidden"
      whileInView="visible"
      viewport={viewport}
      variants={container}
      className={className}
    >
      <StaggerContext.Provider value={child}>{children}</StaggerContext.Provider>
    </MotionTag>
  );
}

const StaggerContext = createContext<Variants | undefined>(undefined);

/** Wrap any element inside a StaggerContainer to auto-inherit stagger timing. */
export function StaggerItem({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const variants = useContext(StaggerContext);
  if (!variants) {
    // Fallback: no parent StaggerContainer → just render
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div variants={variants} className={className}>
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Reveal wrapper (single element scroll-reveal)
// ---------------------------------------------------------------------------

interface RevealProps {
  children: ReactNode;
  variant?: keyof typeof REVEAL;
  delay?: number;
  className?: string;
  viewport?: { once?: boolean; margin?: string; amount?: number };
  as?: "div" | "section" | "article";
}

export function Reveal({
  children,
  variant = "up",
  delay = 0,
  className = "",
  viewport = VIEWPORT.gentle,
  as: Tag = "div",
}: RevealProps) {
  const variants = REVEAL[variant](delay);
  const MotionTag = motion[Tag];
  return (
    <MotionTag
      initial="hidden"
      whileInView="visible"
      viewport={viewport}
      variants={variants}
      className={className}
    >
      {children}
    </MotionTag>
  );
}

// ---------------------------------------------------------------------------
// Hero entrance wrapper (animate on mount, not scroll)
// ---------------------------------------------------------------------------

interface HeroRevealProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

export function HeroReveal({ children, delay = 0, className = "" }: HeroRevealProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE.out, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Animated counter (GPU-optimized, reduced-motion aware)
// ---------------------------------------------------------------------------

export function AnimatedCounter({
  to,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 1200,
  className = "",
}: {
  to: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const [val, setVal] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setVal(to);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 4); // easeOutQuart — snappier than cubic
      setVal(to * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, reduce, duration]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {val >= 1000 ? Math.floor(val).toLocaleString("en-US") : val.toFixed(decimals)}
      {suffix}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ClipReveal — premium clip-path wipe from bottom (agency-standard 2025)
// ---------------------------------------------------------------------------

interface ClipRevealProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
  /** "up" (default) reveals upward; "right" reveals from left */
  direction?: "up" | "right";
}

export function ClipReveal({
  children,
  delay = 0,
  duration = 0.7,
  className = "",
  direction = "up",
}: ClipRevealProps) {
  const reduce = useReducedMotion();

  const initial =
    direction === "up"
      ? { clipPath: "inset(100% 0% 0% 0%)", y: 8, opacity: 0 }
      : { clipPath: "inset(0% 100% 0% 0%)", x: 8, opacity: 0 };

  const animate =
    direction === "up"
      ? { clipPath: "inset(0% 0% 0% 0%)", y: 0, opacity: 1 }
      : { clipPath: "inset(0% 0% 0% 0%)", x: 0, opacity: 1 };

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={initial}
      whileInView={animate}
      viewport={{ once: true, amount: 0 }}
      transition={{
        duration,
        delay,
        ease: EASE.dramatic,
        opacity: { duration: duration * 0.5 },
      }}
      style={{ willChange: "clip-path, transform, opacity" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// GlowCard — card with mouse-tracking gradient glow (premium interactivity)
// ---------------------------------------------------------------------------

interface GlowCardProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** CSS color for the glow. Defaults to brand primary. */
  glowColor?: string;
  /** Intensity 0-1, default 0.18 */
  intensity?: number;
}

export function GlowCard({
  children,
  className = "",
  style,
  glowColor = "var(--brand-primary)",
  intensity = 0.22,
}: GlowCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (reduce || !ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      ref.current.style.setProperty("--glow-x", `${x}%`);
      ref.current.style.setProperty("--glow-y", `${y}%`);
      ref.current.style.setProperty("--glow-opacity", `${intensity}`);
    },
    [reduce, intensity]
  );

  const handleMouseLeave = useCallback(() => {
    if (!ref.current) return;
    ref.current.style.setProperty("--glow-opacity", "0");
  }, []);

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`relative overflow-hidden ${className}`}
      style={
        {
          "--glow-x": "50%",
          "--glow-y": "50%",
          "--glow-opacity": "0",
          ...style,
        } as React.CSSProperties
      }
    >
      {/* Radial glow that follows the cursor */}
      <div
        className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-300"
        style={{
          background: `radial-gradient(400px circle at var(--glow-x) var(--glow-y), ${glowColor}, transparent 70%)`,
          opacity: "var(--glow-opacity)" as unknown as number,
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GuidedCursor — scripted product-demo cursor for marketing UI mockups
// ---------------------------------------------------------------------------

interface GuidedCursorProps {
  x: string | string[];
  y: string | string[];
  label?: string;
  className?: string;
  duration?: number;
}

export function GuidedCursor({ x, y, label, className = "", duration = 6.5 }: GuidedCursorProps) {
  const reduce = useReducedMotion();

  if (reduce) return null;

  const isPath = Array.isArray(x) || Array.isArray(y);

  return (
    <motion.div
      aria-hidden
      className={`pointer-events-none absolute z-30 flex items-start gap-2 ${className}`}
      style={{
        left: Array.isArray(x) ? x[0] : x,
        top: Array.isArray(y) ? y[0] : y,
        filter: "drop-shadow(0 12px 22px rgba(0,0,0,0.28))",
      }}
      animate={{
        left: x,
        top: y,
        scale: isPath ? [1, 0.98, 1.04, 1] : [1, 0.94, 1],
      }}
      transition={
        isPath
          ? { duration, repeat: Infinity, repeatDelay: 0.7, ease: "easeInOut" }
          : {
              left: { type: "spring", stiffness: 120, damping: 22 },
              top: { type: "spring", stiffness: 120, damping: 22 },
              scale: { duration: 1.2, repeat: Infinity, ease: "easeInOut" },
            }
      }
    >
      <span
        className="relative mt-0.5 block h-5 w-4"
        style={{
          background: "linear-gradient(145deg, #ffffff, #dbeafe)",
          clipPath: "polygon(0 0, 100% 48%, 58% 58%, 78% 100%, 55% 100%, 38% 64%, 0 84%)",
        }}
      >
        <span className="absolute inset-0 rounded-sm border border-white/70" />
      </span>
      {label && (
        <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-white backdrop-blur-md [background:rgba(15,23,42,0.78)]">
          {label}
        </span>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// MagneticCard — card with spring-based hover lift + tilt
// ---------------------------------------------------------------------------

interface MagneticCardProps {
  children: ReactNode;
  className?: string;
  lift?: number; // px to lift on hover (default 6)
  tilt?: number; // max deg tilt (default 3)
}

export function MagneticCard({ children, className = "", lift = 6, tilt = 3 }: MagneticCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useMotionValue(0), { stiffness: 300, damping: 30 });
  const rotateY = useSpring(useMotionValue(0), { stiffness: 300, damping: 30 });
  const translateY = useSpring(useMotionValue(0), { stiffness: 250, damping: 20 });

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (reduce || !ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / (rect.width / 2);
      const dy = (e.clientY - cy) / (rect.height / 2);
      rotateY.set(dx * tilt);
      rotateX.set(-dy * tilt);
      translateY.set(-lift);
      x.set(dx);
      y.set(dy);
    },
    [reduce, tilt, lift, rotateX, rotateY, translateY, x, y]
  );

  const handleMouseLeave = useCallback(() => {
    rotateX.set(0);
    rotateY.set(0);
    translateY.set(0);
    x.set(0);
    y.set(0);
  }, [rotateX, rotateY, translateY, x, y]);

  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ rotateX, rotateY, y: translateY, transformStyle: "preserve-3d", perspective: 800, willChange: "transform" }}
      transition={{ type: "spring", stiffness: 250, damping: 20 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// TextReveal — word-by-word stagger (cinematic headline entrance)
// ---------------------------------------------------------------------------

interface TextRevealProps {
  text: string;
  className?: string;
  wordClassName?: string;
  delay?: number;
  stagger?: number;
  as?: "h1" | "h2" | "h3" | "p" | "span";
}

export function TextReveal({
  text,
  className = "",
  wordClassName = "",
  delay = 0,
  stagger = 0.05,
  as: Tag = "span",
}: TextRevealProps) {
  const reduce = useReducedMotion();
  const words = text.split(" ");

  const container: Variants = {
    hidden: {},
    visible: {
      transition: { staggerChildren: reduce ? 0 : stagger, delayChildren: delay },
    },
  };

  const word: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.45, ease: EASE.out },
    },
  };

  const MotionTag = motion[Tag as keyof typeof motion] as typeof motion.span;

  return (
    <MotionTag
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT.hero}
      variants={container}
      className={className}
    >
      {words.map((w, i) => (
        <motion.span key={i} variants={word} className={`inline-block ${wordClassName}`}>
          {w}
          {i < words.length - 1 ? " " : ""}
        </motion.span>
      ))}
    </MotionTag>
  );
}

// ---------------------------------------------------------------------------
// ScrollProgress — thin branded bar at top of page (state-of-the-art UX)
// ---------------------------------------------------------------------------

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });

  return (
    <motion.div
      className="pointer-events-none fixed top-0 right-0 left-0 z-[9999] h-[2px] origin-left"
      style={{
        scaleX,
        background:
          "linear-gradient(90deg, var(--brand-gradient-from), var(--brand-gradient-via), var(--brand-gradient-to))",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// MagneticButton — magnetic CTA that follows cursor with spring physics
// ---------------------------------------------------------------------------

interface MagneticButtonProps {
  children: ReactNode;
  className?: string;
  strength?: number;
}

export function MagneticButton({ children, className = "", strength = 0.3 }: MagneticButtonProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const x = useSpring(useMotionValue(0), { stiffness: 300, damping: 20 });
  const y = useSpring(useMotionValue(0), { stiffness: 300, damping: 20 });

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (reduce || !ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      x.set((e.clientX - cx) * strength);
      y.set((e.clientY - cy) * strength);
    },
    [reduce, strength, x, y]
  );

  const handleMouseLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  if (reduce) return <div className={`inline-flex [&>a]:inline-flex ${className}`}>{children}</div>;

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ x, y, willChange: "transform" }}
      className={`inline-flex [&>a]:inline-flex ${className}`}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// GradientMesh — animated gradient mesh for dark section backgrounds
// ---------------------------------------------------------------------------

interface GradientMeshProps {
  className?: string;
  colors?: string[];
  duration?: number;
}

export function GradientMesh({
  className = "",
  colors = ["var(--brand-primary)", "var(--brand-secondary)", "var(--brand-tertiary)"],
  duration = 12,
}: GradientMeshProps) {
  const reduce = useReducedMotion();
  if (reduce) return null;

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      <motion.div
        className="absolute inset-[-20%]"
        style={{
          background: `radial-gradient(ellipse 50% 50% at 20% 30%, ${colors[0]}12, transparent 60%),
                       radial-gradient(ellipse 40% 40% at 80% 70%, ${colors[1]}10, transparent 60%),
                       radial-gradient(ellipse 35% 35% at 50% 50%, ${colors[2]}08, transparent 60%)`,
        }}
        animate={{
          x: [0, 30, -20, 0],
          y: [0, -20, 30, 0],
          scale: [1, 1.05, 0.98, 1],
        }}
        transition={{ duration, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}
