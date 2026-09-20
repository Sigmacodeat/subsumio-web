"use client";

// Brand illustration system — bespoke vector scenes drawn in one visual
// language: 1.5px strokes, round caps/joins, brand-token colours, subtle
// gradient fills. Not stock iconography — each scene tells a product story
// (Akte → Brain → belegte Antwort, citation graph, secure vault).
//
// Every stroke can draw itself in: either whileInView (`DrawPath`) or bound
// to scroll progress (`ScrollDrawScene` — the signature agency gesture: the
// illustration draws itself as the visitor scrolls). All decorative,
// aria-hidden, and reduced-motion safe (renders fully drawn).

import { useRef } from "react";
import { motion, useMotionValue, useScroll, useTransform, type MotionValue } from "framer-motion";
import { useReducedMotion } from "@/lib/use-safe-reduced-motion";

const EASE_DRAW: [number, number, number, number] = [0.25, 0.1, 0.25, 1];

// Shared gradient defs — one id namespace per scene to avoid collisions
// when several illustrations render on the same page.
function Defs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-brand`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="var(--brand-primary)" />
        <stop offset="100%" stopColor="var(--brand-secondary, var(--brand-primary))" />
      </linearGradient>
      <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity="0.16" />
        <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity="0.04" />
      </linearGradient>
    </defs>
  );
}

type DrawnProps = {
  d: string;
  /** 0..1 progress when the stroke should be fully drawn (scroll-bound mode). */
  at?: number;
  progress?: MotionValue<number>;
  delay?: number;
  stroke?: string;
  width?: number;
  dash?: string;
};

/** A stroke that draws itself in — scroll-bound if `progress` is given,
 *  otherwise whileInView. */
function DrawPath({ d, at = 0.5, progress, delay = 0, stroke, width = 1.5, dash }: DrawnProps) {
  const reduce = useReducedMotion();
  // Hooks stay unconditional: fallback MotionValue(1) keeps the path fully
  // drawn in whileInView mode; the style prop only applies in scroll mode.
  const fallback = useMotionValue(1);
  // Map global scroll progress [at-0.35 .. at] → local pathLength [0..1]
  const local = useTransform(progress ?? fallback, [Math.max(0, at - 0.35), at], [0, 1]);

  if (reduce) {
    return (
      <path
        d={d}
        fill="none"
        stroke={stroke ?? "var(--mk-border-strong)"}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={dash}
      />
    );
  }
  return (
    <motion.path
      d={d}
      fill="none"
      stroke={stroke ?? "var(--mk-border-strong)"}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={dash}
      initial={progress ? false : { pathLength: 0 }}
      whileInView={progress ? undefined : { pathLength: 1 }}
      viewport={progress ? undefined : { once: true, amount: 0.6 }}
      transition={progress ? undefined : { duration: 1.1, delay, ease: EASE_DRAW }}
      style={local ? { pathLength: local } : undefined}
    />
  );
}

function FillShape({
  d,
  at = 0.7,
  progress,
  delay = 0,
  fill = "brand",
  scene,
}: {
  d: string;
  at?: number;
  progress?: MotionValue<number>;
  delay?: number;
  fill?: "brand" | "none";
  scene: string;
}) {
  const reduce = useReducedMotion();
  const fallback = useMotionValue(1);
  const local = useTransform(progress ?? fallback, [Math.max(0, at - 0.2), at], [0, 1]);
  return (
    <motion.path
      d={d}
      fill={fill === "brand" ? `url(#${scene}-fill)` : "none"}
      stroke="none"
      initial={progress || reduce ? false : { opacity: 0 }}
      whileInView={progress ? undefined : { opacity: 1 }}
      viewport={progress ? undefined : { once: true, amount: 0.6 }}
      transition={progress ? undefined : { duration: 0.8, delay, ease: "easeOut" }}
      style={local ? { opacity: local } : undefined}
    />
  );
}

function Dot({
  cx,
  cy,
  r = 3.5,
  at = 0.8,
  progress,
  delay = 0,
  brand = true,
}: {
  cx: number;
  cy: number;
  r?: number;
  at?: number;
  progress?: MotionValue<number>;
  delay?: number;
  brand?: boolean;
}) {
  const reduce = useReducedMotion();
  const fallback = useMotionValue(1);
  const local = useTransform(progress ?? fallback, [Math.max(0, at - 0.15), at], [0, 1]);
  return (
    <motion.circle
      cx={cx}
      cy={cy}
      r={r}
      fill={brand ? "var(--brand-primary)" : "var(--mk-text-subtle)"}
      initial={progress || reduce ? false : { scale: 0, opacity: 0 }}
      whileInView={progress ? undefined : { scale: 1, opacity: 1 }}
      viewport={progress ? undefined : { once: true, amount: 0.6 }}
      transition={progress ? undefined : { duration: 0.4, delay, ease: EASE_DRAW }}
      style={
        local
          ? { scale: local, opacity: local, transformOrigin: `${cx}px ${cy}px` }
          : { transformOrigin: `${cx}px ${cy}px` }
      }
    />
  );
}

/** Stage caption under a pipeline element — fades in with its stage. */
function StageLabel({
  x,
  y,
  text,
  at,
  progress,
}: {
  x: number;
  y: number;
  text: string;
  at: number;
  progress?: MotionValue<number>;
}) {
  const reduce = useReducedMotion();
  const fallback = useMotionValue(1);
  const local = useTransform(progress ?? fallback, [Math.max(0, at - 0.12), at], [0, 1]);
  return (
    <motion.text
      x={x}
      y={y}
      textAnchor="middle"
      fontSize={11}
      letterSpacing={2}
      fontWeight={600}
      fill="var(--mk-text-subtle)"
      style={{
        fontFamily: "var(--font-mono, monospace)",
        ...(progress ? { opacity: local } : undefined),
      }}
      initial={progress || reduce ? false : { opacity: 0 }}
      whileInView={progress ? undefined : { opacity: 1 }}
      viewport={progress ? undefined : { once: true }}
      transition={progress ? undefined : { duration: 0.5, delay: at * 0.9 }}
    >
      {text}
    </motion.text>
  );
}

/* ------------------------------------------------------------------ */
/* Scene 1 — Pipeline: Akte → Brain → belegte Antwort                   */
/* ------------------------------------------------------------------ */

export function IllusPipeline({ progress }: { progress?: MotionValue<number> }) {
  const id = "pl";
  return (
    <svg viewBox="0 0 480 360" fill="none" role="img" aria-hidden className="h-auto w-full">
      <Defs id={id} />

      {/* Dossier / Akte — left */}
      <FillShape scene={id} progress={progress} at={0.18} d="M52 96 h72 l14 14 h44 v118 h-130 z" />
      <DrawPath progress={progress} at={0.18} d="M52 96 h72 l14 14 h44 v118 h-130 z" />
      <DrawPath progress={progress} at={0.24} d="M52 110 h86" width={1.2} />
      <DrawPath progress={progress} at={0.3} d="M66 132 h80 M66 148 h60 M66 164 h70" width={1.2} />
      <Dot cx={110} cy={96} r={4} at={0.2} progress={progress} />

      {/* Connector: Akte → Brain */}
      <DrawPath
        progress={progress}
        at={0.45}
        stroke="url(#pl-brand)"
        width={2}
        dash="4 5"
        d="M182 158 C 214 150, 224 170, 240 180"
      />

      {/* Brain node — center: rounded hexagon + neural mesh */}
      <FillShape
        scene={id}
        progress={progress}
        at={0.55}
        d="M240 120 l34 20 v40 l-34 20 -34 -20 v-40 z"
      />
      <DrawPath
        progress={progress}
        at={0.55}
        stroke="url(#pl-brand)"
        width={2}
        d="M240 120 l34 20 v40 l-34 20 -34 -20 v-40 z"
      />
      <DrawPath
        progress={progress}
        at={0.62}
        stroke="var(--brand-primary)"
        width={1.2}
        d="M226 158 l14 8 14 -8 M226 172 l14 8 14 -8 M240 166 v10"
      />
      <Dot cx={240} cy={156} r={4.5} at={0.6} progress={progress} />
      <Dot cx={226} cy={172} r={3} at={0.66} progress={progress} />
      <Dot cx={254} cy={172} r={3} at={0.7} progress={progress} />

      {/* Connector: Brain → Antwort */}
      <DrawPath
        progress={progress}
        at={0.78}
        stroke="url(#pl-brand)"
        width={2}
        dash="4 5"
        d="M274 180 C 300 172, 306 158, 318 152"
      />

      {/* Answer card with citations — right */}
      <FillShape
        scene={id}
        progress={progress}
        at={0.86}
        d="M318 118 h110 a8 8 0 0 1 8 8 v96 a8 8 0 0 1 -8 8 h-110 a8 8 0 0 1 -8 -8 v-96 a8 8 0 0 1 8 -8 z"
      />
      <DrawPath
        progress={progress}
        at={0.86}
        d="M318 118 h110 a8 8 0 0 1 8 8 v96 a8 8 0 0 1 -8 8 h-110 a8 8 0 0 1 -8 -8 v-96 a8 8 0 0 1 8 -8 z"
      />
      <DrawPath
        progress={progress}
        at={0.92}
        d="M330 140 h66 M330 156 h84 M330 172 h54"
        width={1.2}
      />
      {/* Citation chips */}
      <DrawPath
        progress={progress}
        at={0.97}
        stroke="var(--brand-primary)"
        width={1.4}
        d="M330 192 h22 a5 5 0 0 1 5 5 v8 a5 5 0 0 1 -5 5 h-22 a5 5 0 0 1 -5 -5 v-8 a5 5 0 0 1 5 -5 z M366 192 h22 a5 5 0 0 1 5 5 v8 a5 5 0 0 1 -5 5 h-22 a5 5 0 0 1 -5 -5 v-8 a5 5 0 0 1 5 -5 z"
      />
      {/* Checkmark in citation chip */}
      <DrawPath
        progress={progress}
        at={1}
        stroke="var(--brand-primary)"
        width={1.6}
        d="M332 201 l4 4 8 -9"
      />

      {/* Ground shadow */}
      <DrawPath
        progress={progress}
        at={0.9}
        width={1}
        d="M52 258 h120 M200 268 h80 M310 258 h128"
        stroke="var(--mk-border)"
      />

      {/* Stage labels — fade in last, monospace uppercase (technical brand voice) */}
      {[
        { x: 117, y: 288, label: "AKTE", at: 0.32 },
        { x: 240, y: 288, label: "KANZLEIWISSEN", at: 0.72 },
        { x: 373, y: 288, label: "ANTWORT", at: 0.95 },
      ].map((l) => (
        <StageLabel key={l.label} x={l.x} y={l.y} text={l.label} at={l.at} progress={progress} />
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Scene 2 — Citation web: vernetzte Dokumente                          */
/* ------------------------------------------------------------------ */

export function IllusCitationWeb() {
  const id = "cw";
  const docs: [number, number][] = [
    [96, 88],
    [240, 66],
    [384, 96],
    [120, 240],
    [352, 248],
    [240, 160],
  ];
  const edges: [number, number][] = [
    [0, 5],
    [1, 5],
    [2, 5],
    [3, 5],
    [4, 5],
    [0, 3],
    [2, 4],
  ];
  return (
    <svg viewBox="0 0 480 320" fill="none" aria-hidden className="h-auto w-full">
      <Defs id={id} />
      {edges.map(([a, b], i) => (
        <DrawPath
          key={i}
          d={`M${docs[a][0]} ${docs[a][1]} L${docs[b][0]} ${docs[b][1]}`}
          delay={0.15 + i * 0.09}
          width={1.2}
          dash={i < 5 ? undefined : "3 5"}
        />
      ))}
      {docs.map(([x, y], i) =>
        i === 5 ? (
          <g key={i}>
            <FillShape
              scene={id}
              delay={0.7}
              d={`M${x - 22} ${y - 22} a22 22 0 1 0 44 0 a22 22 0 1 0 -44 0`}
            />
            <DrawPath
              d={`M${x - 22} ${y - 22} a22 22 0 1 0 44 0 a22 22 0 1 0 -44 0`}
              stroke="url(#cw-brand)"
              width={2}
              delay={0.55}
            />
            <DrawPath
              d={`M${x - 8} ${y} l5 6 11 -12`}
              stroke="var(--brand-primary)"
              width={2}
              delay={0.8}
            />
          </g>
        ) : (
          <g key={i}>
            <DrawPath
              d={`M${x - 16} ${y - 12} h24 l8 8 v16 a4 4 0 0 1 -4 4 h-28 a4 4 0 0 1 -4 -4 v-20 a4 4 0 0 1 4 -4 z`}
              delay={0.05 + i * 0.08}
            />
            <DrawPath
              d={`M${x - 8} ${y - 2} h14 M${x - 8} ${y + 6} h10`}
              width={1.1}
              delay={0.12 + i * 0.08}
            />
          </g>
        )
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Scene 3 — Vault shield: Verschwiegenheit / Security                  */
/* ------------------------------------------------------------------ */

export function IllusVaultShield() {
  const id = "vs";
  return (
    <svg viewBox="0 0 480 340" fill="none" aria-hidden className="h-auto w-full">
      <Defs id={id} />
      {/* Shield outline */}
      <FillShape
        scene={id}
        delay={0.35}
        d="M240 48 c30 16 62 24 96 26 v92 c0 60 -38 102 -96 124 -58 -22 -96 -64 -96 -124 v-92 c34 -2 66 -10 96 -26 z"
      />
      <DrawPath
        d="M240 48 c30 16 62 24 96 26 v92 c0 60 -38 102 -96 124 -58 -22 -96 -64 -96 -124 v-92 c34 -2 66 -10 96 -26 z"
        stroke="url(#vs-brand)"
        width={2}
      />
      {/* Paragraph mark — the legal signature inside the shield */}
      <DrawPath
        d="M262 118 c0 -10 -8 -16 -19 -16 h-6 c-19 0 -33 12 -33 28 c0 13 9 24 23 27 c-13 4 -22 15 -22 30 c0 18 15 32 34 32 h5 c11 0 19 -7 19 -16 M243 102 v117 M219 219 v-118"
        stroke="var(--brand-primary)"
        width={2.2}
        delay={0.45}
      />
      {/* Orbiting lock nodes */}
      <Dot cx={128} cy={140} r={4} delay={0.7} />
      <Dot cx={352} cy={140} r={4} delay={0.8} />
      <Dot cx={240} cy={312} r={4} delay={0.9} />
      <DrawPath d="M128 140 C 160 96, 200 72, 240 48" width={1} dash="3 5" delay={0.75} />
      <DrawPath d="M352 140 C 320 96, 280 72, 240 48" width={1} dash="3 5" delay={0.85} />
      <DrawPath d="M240 312 C 200 296, 160 240, 148 190" width={1} dash="3 5" delay={0.95} />
      {/* Keyhole */}
      <DrawPath
        d="M240 156 a10 10 0 1 1 -0.01 0 M240 166 v22"
        stroke="var(--mk-text-subtle)"
        width={1.6}
        delay={1.0}
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Scene 4 — Handshake: two nodes meeting (partner program)             */
/* ------------------------------------------------------------------ */

export function IllusHandshake() {
  const id = "hs";
  return (
    <svg viewBox="0 0 480 340" fill="none" aria-hidden className="h-auto w-full">
      <Defs id={id} />
      {/* Two hands — abstract strokes meeting in the middle */}
      <DrawPath d="M96 150 l70 40 30 -18" width={2} stroke="var(--mk-border-strong)" />
      <DrawPath d="M384 150 l-70 40 -30 -18" width={2} stroke="var(--mk-border-strong)" />
      {/* Clasp */}
      <DrawPath
        d="M196 172 l18 14 10 -8 M216 186 l16 12 10 -8 M232 198 l14 10 10 -8 M214 160 l10 -12 14 6 M252 172 l12 -10 -12 -8"
        stroke="url(#hs-brand)"
        width={2}
        delay={0.3}
      />
      {/* Wrist cuffs */}
      <DrawPath d="M96 150 l-14 -18 M96 150 l-20 -8" width={1.6} delay={0.5} />
      <DrawPath d="M384 150 l14 -18 M384 150 l20 -8" width={1.6} delay={0.55} />
      {/* Value orbit above the clasp */}
      <DrawPath
        d="M240 84 a26 26 0 1 1 -0.01 0"
        stroke="var(--brand-primary)"
        width={1.8}
        delay={0.7}
      />
      <DrawPath d="M233 84 l5 6 10 -11" stroke="var(--brand-primary)" width={2} delay={0.85} />
      <Dot cx={96} cy={150} r={4} delay={0.4} />
      <Dot cx={384} cy={150} r={4} delay={0.45} />
      {/* Commission ribbon under clasp */}
      <DrawPath
        d="M186 246 h108 a6 6 0 0 1 6 6 v14 a6 6 0 0 1 -6 6 h-108 a6 6 0 0 1 -6 -6 v-14 a6 6 0 0 1 6 -6 z"
        delay={0.9}
      />
      <DrawPath
        d="M200 259 h60 M268 254 v10"
        width={1.4}
        stroke="var(--brand-primary)"
        delay={1.0}
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Scene 5 — Origin: Feder/Pen drawing a spark (about/craft)            */
/* ------------------------------------------------------------------ */

export function IllusOrigin() {
  const id = "or";
  return (
    <svg viewBox="0 0 480 340" fill="none" aria-hidden className="h-auto w-full">
      <Defs id={id} />
      {/* Sheet of paper */}
      <FillShape
        scene={id}
        delay={0.2}
        d="M140 60 h140 l30 30 v200 a6 6 0 0 1 -6 6 h-164 a6 6 0 0 1 -6 -6 v-224 a6 6 0 0 1 6 -6 z"
      />
      <DrawPath
        d="M140 60 h140 l30 30 v200 a6 6 0 0 1 -6 6 h-164 a6 6 0 0 1 -6 -6 v-224 a6 6 0 0 1 6 -6 z"
        width={1.8}
      />
      <DrawPath d="M280 60 v30 h30" width={1.4} delay={0.15} />
      {/* Written lines — some text, one "signed" stroke */}
      <DrawPath d="M160 120 h110 M160 140 h90 M160 160 h100" width={1.2} delay={0.3} />
      <DrawPath
        d="M160 200 c20 -18 40 10 60 -6 s38 -4 50 8"
        stroke="url(#or-brand)"
        width={2}
        delay={0.5}
      />
      {/* Quill pen */}
      <DrawPath
        d="M330 236 c24 -60 40 -110 52 -150 -8 34 -20 76 -38 112 -6 12 -10 24 -14 38 z"
        stroke="var(--brand-primary)"
        width={1.8}
        delay={0.65}
      />
      <DrawPath d="M382 86 c-4 40 -14 84 -30 124" width={1} delay={0.75} />
      {/* Spark at pen tip */}
      <Dot cx={330} cy={236} r={4} delay={0.85} />
      <DrawPath
        d="M330 216 v-10 M316 226 l-8 -8 M344 226 l8 -8 M312 236 h-10 M348 236 h10"
        stroke="var(--brand-primary)"
        width={1.4}
        delay={0.95}
      />
      {/* Paragraph watermark */}
      <DrawPath
        d="M196 252 c0 -7 -6 -11 -13 -11 -13 0 -22 9 -22 20 0 9 7 17 16 19 -9 3 -16 10 -16 21 0 13 11 23 24 23 8 0 14 -5 14 -12 M183 241 v83"
        width={1.3}
        delay={0.9}
        stroke="var(--mk-text-subtle)"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Scroll-drawn wrapper — binds a scene's strokes to scroll progress.   */
/* The illustration draws itself as the visitor scrolls through the     */
/* section (signature agency gesture). Reduced-motion → static.         */
/* ------------------------------------------------------------------ */

export function ScrollDrawScene({
  children,
  className = "",
}: {
  children: (progress: MotionValue<number>) => React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 85%", "end 55%"],
  });
  const progress = useTransform(scrollYProgress, (v) => (reduce ? 1 : v));
  return (
    <div ref={ref} className={className}>
      {children(progress)}
    </div>
  );
}
