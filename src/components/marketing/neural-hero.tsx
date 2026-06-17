"use client";

// Signature hero visual: a living neural / knowledge graph on a canvas — the
// Sigma-synapse motif in motion. Nodes drift, near nodes link, the pointer
// gently bends the field. GPU-light (canvas 2D + rAF, capped node count), DPR-
// aware, resize-aware. Honest choice over Three.js: same "AI brain" wow at a
// fraction of the weight/maintenance. Respects prefers-reduced-motion (static
// frame, no loop). pointer-events:none so it never blocks the hero CTAs.

import { useEffect, useRef } from "react";

interface Node { x: number; y: number; vx: number; vy: number; r: number }

export default function NeuralHero({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const c = cv.getContext("2d");
    if (!c) return;
    const parent = cv.parentElement;
    if (!parent) return;

    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0;
    let nodes: Node[] = [];
    const pointer = { x: -9999, y: -9999 };

    const LINK_DIST = 140;     // px at which two nodes draw an edge
    const POINTER_DIST = 170;  // pointer influence radius

    function resize() {
      w = parent!.clientWidth;
      h = parent!.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv!.width = w * dpr;
      cv!.height = h * dpr;
      cv!.style.width = `${w}px`;
      cv!.style.height = `${h}px`;
      c!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(18, Math.min(56, Math.round((w * h) / 22000)));
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: 1.2 + Math.random() * 2.2,
      }));
    }

    function draw() {
      c!.clearRect(0, 0, w, h);
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < LINK_DIST * LINK_DIST) {
            const alpha = (1 - Math.sqrt(d2) / LINK_DIST) * 0.28;
            c!.strokeStyle = `rgba(124, 58, 237, ${alpha})`;
            c!.lineWidth = 1;
            c!.beginPath();
            c!.moveTo(a.x, a.y);
            c!.lineTo(b.x, b.y);
            c!.stroke();
          }
        }
      }
      for (const n of nodes) {
        const dx = n.x - pointer.x, dy = n.y - pointer.y;
        const near = dx * dx + dy * dy < POINTER_DIST * POINTER_DIST;
        c!.beginPath();
        c!.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        c!.fillStyle = near ? "rgba(167, 139, 250, 0.95)" : "rgba(167, 139, 250, 0.55)";
        c!.fill();
        if (near) {
          c!.beginPath();
          c!.arc(n.x, n.y, n.r + 4, 0, Math.PI * 2);
          c!.strokeStyle = "rgba(124, 58, 237, 0.25)";
          c!.lineWidth = 1;
          c!.stroke();
        }
      }
    }

    let raf = 0;
    function step() {
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        const dx = n.x - pointer.x, dy = n.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < POINTER_DIST * POINTER_DIST && d2 > 1) {
          const d = Math.sqrt(d2);
          const f = (1 - d / POINTER_DIST) * 0.6;
          n.x += (dx / d) * f;
          n.y += (dy / d) * f;
        }
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
        n.x = Math.max(0, Math.min(w, n.x));
        n.y = Math.max(0, Math.min(h, n.y));
      }
      draw();
      raf = requestAnimationFrame(step);
    }

    resize();
    if (reduce) draw();
    else raf = requestAnimationFrame(step);

    const onMove = (e: MouseEvent) => {
      const rect = cv!.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
    };
    const onLeave = () => { pointer.x = -9999; pointer.y = -9999; };
    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseout", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseout", onLeave);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={`pointer-events-none ${className}`} />;
}
