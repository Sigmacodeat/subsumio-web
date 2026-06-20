"use client";

// Shared marketing chrome: Nav (with language switcher + solutions dropdown),
// Footer, and small shared primitives used across all marketing pages.

import { useEffect, useState } from "react";
import { motion, AnimatePresence, useScroll, useTransform, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Brain,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  Globe,
  Database,
  GitBranch,
  Search,
  Zap,
  Shield,
  Layers,
  Network,
  Megaphone,
  Gift,
  Handshake,
  CalendarClock,
  Mail,
  ShieldAlert,
  Calculator,
  Landmark,
  FileText,
  FolderOpen,
  MessageSquare,
  Users,
  EyeOff,
  ShieldCheck,
  FileSignature,
  Lock,
  ScanSearch,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubsumioLogo, SubsumioMark } from "@/components/brand/subsumio-logo";
import { NAV, FOOTER, p, altPath, type Lang } from "@/content/site";
import { isExternalUrl, type SiteBrand } from "@/lib/brand";

export function useSiteBrand(): SiteBrand {
  return "subsumio";
}

function BrandLogo() {
  return <SubsumioLogo size={32} />;
}

// Content files store icon names as strings; resolve them here.
export const ICONS: Record<string, LucideIcon> = {
  Brain, Database, GitBranch, Search, Zap, Shield, Layers, Network,
  Megaphone, Gift, Handshake,
  CalendarClock, Mail, ShieldAlert, Calculator, Landmark, FileText, FolderOpen, MessageSquare, Users,
  EyeOff, ShieldCheck, FileSignature, Lock, ScanSearch,
};

// Tone-aware accent icon-tiles. On light surfaces the -700/-50/-200 shades
// keep AA contrast; on dark we use the -400 text + alpha fills. accentTile()
// is the single source — replaces the old COLOR_MAP / LIGHT_COLOR_MAP split.
const ACCENT_TILE = {
  light: {
    violet: "brand-text bg-violet-50 border-violet-200",
    blue: "text-blue-700 bg-blue-50 border-blue-200",
    emerald: "text-emerald-700 bg-emerald-50 border-emerald-200",
    amber: "text-amber-700 bg-amber-50 border-amber-200",
    rose: "text-rose-700 bg-rose-50 border-rose-200",
    purple: "text-purple-700 bg-purple-50 border-purple-200",
  },
  slate: {
    violet: "brand-text brand-soft brand-border",
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    rose: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    purple: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  },
  dark: {
    violet: "brand-text brand-soft brand-border",
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    rose: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    purple: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  },
} as const;

export type Tone = "light" | "slate" | "dark";

export function accentTile(color: string, tone: Tone = "light"): string {
  const map = ACCENT_TILE[tone];
  return map[color as keyof typeof map] ?? map.blue;
}

// Tone-scoped section wrapper. Sets data-tone so descendants resolve the
// --mk-* neutral tokens for that tone, and paints the section background.
// The public site stacks these light-dominant, with data-tone="dark" for
// the spotlight bands (live demo, copilot).
export function Section({
  tone = "light",
  id,
  className = "",
  children,
}: {
  tone?: Tone;
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      data-tone={tone}
      className={`relative z-10 ${className}`}
      style={{ background: "var(--mk-bg)" }}
    >
      {children}
    </section>
  );
}

/* Floating background icons for parallax depth. Large, subtle, at very
   low opacity so they never compete with content. Each row moves at a
   different scroll rate to create layered depth. */
interface ParallaxIconDef {
  Icon: typeof Brain;
  x: string;
  y: string;
  size: number;
  opacity: number;
  speed: number;
}
const BG_ICONS: ParallaxIconDef[] = [
  { Icon: Brain,     x: "8%",  y: "12%",  size: 180, opacity: 0.035, speed: 0.4 },
  { Icon: Database,  x: "85%", y: "18%",  size: 140, opacity: 0.03,  speed: -0.3 },
  { Icon: GitBranch, x: "72%", y: "55%",  size: 200, opacity: 0.025, speed: 0.5 },
  { Icon: Shield,    x: "15%", y: "62%",  size: 160, opacity: 0.03,  speed: -0.45 },
  { Icon: Network,   x: "92%", y: "78%",  size: 120, opacity: 0.035, speed: 0.35 },
  { Icon: Search,    x: "5%",  y: "85%",  size: 100, opacity: 0.025, speed: -0.25 },
  { Icon: Zap,       x: "45%", y: "8%",   size: 90,  opacity: 0.02,  speed: 0.55 },
  { Icon: Layers,    x: "55%", y: "92%",  size: 130, opacity: 0.03,  speed: -0.4 },
];

function ParallaxIcon({
  def,
  scrollY,
  span,
}: {
  def: ParallaxIconDef;
  scrollY: ReturnType<typeof useScroll>["scrollY"];
  span: number;
}) {
  const yIcon = useTransform(scrollY, [0, 2400], [0, 180 * def.speed * span]);
  const { Icon, x, y, size, opacity } = def;
  return (
    <motion.div
      style={{ y: yIcon, left: x, top: y }}
      className="absolute will-change-transform"
    >
      <Icon
        size={size}
        strokeWidth={1}
        className="[color:var(--brand-primary)]"
        style={{ opacity }}
      />
    </motion.div>
  );
}

export function MarketingBackground() {
  // Scroll-parallax depth: orbs, grid and icons drift at different rates.
  // Reduced-motion → no drift (static transform = 0).
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const span = reduce ? 0 : 1;
  const yViolet = useTransform(scrollY, [0, 2400], [0, 240 * span]);
  const yBlue   = useTransform(scrollY, [0, 2400], [0, -190 * span]);
  const yGrid   = useTransform(scrollY, [0, 2400], [0, 110 * span]);

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden">
      {/* Gradient orbs (existing) */}
      <motion.div style={{ y: yViolet }} className="absolute top-[-20%] left-[-10%] will-change-transform">
        <div className="orb w-[600px] h-[600px] rounded-full brand-glow-bg" />
      </motion.div>
      <motion.div style={{ y: yBlue }} className="absolute bottom-[-20%] right-[-10%] will-change-transform">
        <div className="orb-slow w-[500px] h-[500px] rounded-full brand-secondary-soft" />
      </motion.div>

      {/* Subtle grid (existing, lowered opacity for calmer look) */}
      <motion.div style={{ y: yGrid }} className="grid-bg absolute inset-0 opacity-[0.22] will-change-transform" />

      {/* Parallax icon silhouettes */}
      {BG_ICONS.map((def, i) => (
        <ParallaxIcon key={i} def={def} scrollY={scrollY} span={span} />
      ))}
    </div>
  );
}

export function MarketingNav({ lang, theme = "light" }: { lang: Lang; theme?: "light" | "slate" | "dark" }) {
  const nav = NAV[lang];
  const isStandalone = false;
  const pathname = usePathname() || "/";
  const [solutionsOpen, setSolutionsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  // Tone-driven: text resolves from --mk-* against the header's data-tone.
  const isActive = (href: string) => pathname === p(lang, href) || pathname === href;
  const linkBase = "text-sm px-3 py-1.5 rounded-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mk-surface)]";
  const linkCls = `${linkBase} [color:var(--mk-text-muted)] hover:[color:var(--brand-primary)] hover:[background:var(--mk-hover)]`;
  const linkActive = `${linkBase} [color:var(--brand-text)] [background:color-mix(in_srgb,var(--brand-primary)_10%,var(--mk-hover))] font-medium [border:1px_solid_color-mix(in_srgb,var(--brand-primary)_20%,var(--mk-border))]`;
  const linkInactive = linkCls;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
    <header
      data-tone={theme}
      className={`sticky top-0 z-50 transition-all duration-500 ${
        scrolled
          ? "backdrop-blur-2xl shadow-[0_1px_0_rgba(0,0,0,0.06),0_4px_24px_rgba(0,0,0,0.06)] border-b [border-color:var(--mk-border)]"
          : "border-b border-transparent"
      }`}
      style={
        scrolled
          ? { background: "color-mix(in srgb, var(--mk-bg) 88%, transparent)" }
          : undefined
      }
    >
    <nav className="max-w-7xl mx-auto px-6 py-4">
      <div className="flex items-center justify-between">
        <Link href={p(lang, "")} aria-label="Subsumio home">
          <BrandLogo />
        </Link>

        <div className="hidden md:flex items-center gap-7">
          {nav.subsumioItems.map((item) => (
            <Link key={item.href} href={p(lang, item.href)} className={isActive(item.href) ? linkActive : linkInactive}>{item.label}</Link>
          ))}
          {!isStandalone && (
          <div
            className="relative"
            onMouseEnter={() => setSolutionsOpen(true)}
            onMouseLeave={() => setSolutionsOpen(false)}
          >
            <button
              className={`flex items-center gap-1 text-sm ${linkCls} py-2 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mk-surface)] rounded-lg`}
              aria-expanded={solutionsOpen}
              aria-haspopup="true"
              aria-label={nav.solutions}
              onClick={() => setSolutionsOpen((o) => !o)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSolutionsOpen(false);
                  (e.target as HTMLElement).focus();
                }
                if (e.key === "ArrowDown" && !solutionsOpen) {
                  e.preventDefault();
                  setSolutionsOpen(true);
                }
              }}
            >
              {nav.solutions} <ChevronDown size={13} className={solutionsOpen ? "rotate-180" : ""} aria-hidden />
            </button>
            {solutionsOpen && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 w-80" role="menu" aria-label={nav.solutions}>
                <div className="rounded-2xl p-1.5 backdrop-blur-xl shadow-2xl shadow-black/15 [background:var(--mk-surface)]" onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSolutionsOpen(false);
                  }
                }}>
                  {nav.solutionItems.map((item) => {
                    const comingSoon = "comingSoon" in item && item.comingSoon;
                    if (comingSoon) {
                      return (
                        <div
                          key={item.href}
                          className="block px-3 py-2.5 rounded-lg cursor-default opacity-55"
                          aria-disabled="true"
                          role="menuitem"
                        >
                          <p className="text-sm font-medium [color:var(--mk-text)] flex items-center gap-2">
                            {item.label}
                            <span className="text-[10px] font-semibold uppercase tracking-wide brand-text brand-soft px-1.5 py-0.5 rounded">
                              {nav.comingSoonLabel}
                            </span>
                          </p>
                          <p className="text-xs [color:var(--mk-text-muted)] mt-0.5">{item.desc}</p>
                        </div>
                      );
                    }
                    const resolvedHref = item.href;
                    const external = isExternalUrl(resolvedHref);
                    const inner = (
                      <>
                        <p className="text-sm font-medium [color:var(--mk-text)] group-hover:brand-text">{item.label}</p>
                        <p className="text-xs [color:var(--mk-text-muted)] mt-0.5">{item.desc}</p>
                      </>
                    );
                    const cls = "block px-3 py-2.5 rounded-lg hover:[background:var(--mk-hover)] group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] rounded-lg";
                    return external ? (
                      <a key={item.href} href={resolvedHref} className={cls} onClick={() => setSolutionsOpen(false)} role="menuitem">
                        {inner}
                      </a>
                    ) : (
                      <Link key={item.href} href={p(lang, resolvedHref)} className={cls} onClick={() => setSolutionsOpen(false)} role="menuitem">
                        {inner}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          )}
          {!isStandalone && <Link href={p(lang, "/pricing")} className={isActive("/pricing") ? linkActive : linkInactive}>{nav.pricing}</Link>}
          {!isStandalone && <Link href={p(lang, "/compare")} className={isActive("/compare") ? linkActive : linkInactive}>{nav.compare}</Link>}
          <Link href={p(lang, "/docs")} className={isActive("/docs") ? linkActive : linkInactive}>{nav.docs}</Link>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={altPath(lang, pathname)}
            className="hidden sm:flex items-center gap-1.5 text-xs rounded-full px-3 py-1.5 transition-colors duration-200 [color:var(--mk-text-muted)] hover:[color:var(--mk-text)] hover:[background:var(--mk-hover)] [background:var(--mk-surface)]"
            aria-label={lang === "en" ? "Auf Deutsch lesen" : "Read in English"}
          >
            <Globe size={12} /> {lang.toUpperCase()}
          </Link>
          <Link href={p(lang, "/login")} className="hidden sm:block">
            <Button variant="ghost" size="sm" className="[color:var(--mk-text)]">{nav.signIn}</Button>
          </Link>
          <Link href={p(lang, "/signup")}>
            <Button size="sm" variant="glow" className="group">
              {nav.cta}
              <ChevronRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </Button>
          </Link>
          <button
            className={`md:hidden p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mk-surface)] ${linkCls}`}
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={lang === "de" ? "Menü" : "Menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="md:hidden overflow-hidden"
          >
        <div className="mt-3 rounded-2xl p-4 space-y-1 backdrop-blur-xl [background:var(--mk-bg)] shadow-2xl shadow-black/10">
          {nav.subsumioItems.map((item) => (
            <Link key={item.href} href={p(lang, item.href)} className={`block px-3 py-2 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${isActive(item.href) ? "[color:var(--brand-primary)] [background:color-mix(in_srgb,var(--brand-primary)_10%,var(--mk-hover))] font-medium [border:1px_solid_color-mix(in_srgb,var(--brand-primary)_20%,var(--mk-border))]" : "[color:var(--mk-text-muted)] hover:[color:var(--brand-primary)] hover:[background:var(--mk-hover)]"}`} onClick={() => setMobileOpen(false)}>{item.label}</Link>
          ))}
          {!isStandalone && <Link href={p(lang, "/features")} className={`block px-3 py-2 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${isActive("/features") ? "[color:var(--brand-primary)] [background:color-mix(in_srgb,var(--brand-primary)_10%,var(--mk-hover))] font-medium [border:1px_solid_color-mix(in_srgb,var(--brand-primary)_20%,var(--mk-border))]" : "[color:var(--mk-text-muted)] hover:[color:var(--brand-primary)] hover:[background:var(--mk-hover)]"}`} onClick={() => setMobileOpen(false)}>{nav.features}</Link>}
          {!isStandalone && nav.solutionItems.map((item) => {
            const comingSoon = "comingSoon" in item && item.comingSoon;
            if (comingSoon) {
              return (
                <div key={item.href} className="flex items-center justify-between px-3 py-2 rounded-lg text-sm [color:var(--mk-text-muted)] opacity-60" aria-disabled="true">
                  {item.label}
                  <span className="text-[10px] font-semibold uppercase tracking-wide brand-text">{nav.comingSoonLabel}</span>
                </div>
              );
            }
            const resolvedHref = item.href;
            const cls = "block px-3 py-2 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] [color:var(--mk-text)] hover:[background:var(--mk-hover)]";
            return isExternalUrl(resolvedHref) ? (
              <a key={item.href} href={resolvedHref} className={cls} onClick={() => setMobileOpen(false)}>
                {item.label}
              </a>
            ) : (
              <Link key={item.href} href={p(lang, resolvedHref)} className={cls} onClick={() => setMobileOpen(false)}>
                {item.label}
              </Link>
            );
          })}
          {!isStandalone && <Link href={p(lang, "/pricing")} className={`block px-3 py-2 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${isActive("/pricing") ? "[color:var(--brand-primary)] [background:color-mix(in_srgb,var(--brand-primary)_10%,var(--mk-hover))] font-medium [border:1px_solid_color-mix(in_srgb,var(--brand-primary)_20%,var(--mk-border))]" : "[color:var(--mk-text-muted)] hover:[color:var(--brand-primary)] hover:[background:var(--mk-hover)]"}`} onClick={() => setMobileOpen(false)}>{nav.pricing}</Link>}
          {!isStandalone && <Link href={p(lang, "/compare")} className={`block px-3 py-2 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${isActive("/compare") ? "[color:var(--brand-primary)] [background:color-mix(in_srgb,var(--brand-primary)_10%,var(--mk-hover))] font-medium [border:1px_solid_color-mix(in_srgb,var(--brand-primary)_20%,var(--mk-border))]" : "[color:var(--mk-text-muted)] hover:[color:var(--brand-primary)] hover:[background:var(--mk-hover)]"}`} onClick={() => setMobileOpen(false)}>{nav.compare}</Link>}
          <Link href={p(lang, "/docs")} className={`block px-3 py-2 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] ${isActive("/docs") ? "[color:var(--brand-primary)] [background:color-mix(in_srgb,var(--brand-primary)_10%,var(--mk-hover))] font-medium [border:1px_solid_color-mix(in_srgb,var(--brand-primary)_20%,var(--mk-border))]" : "[color:var(--mk-text-muted)] hover:[color:var(--brand-primary)] hover:[background:var(--mk-hover)]"}`} onClick={() => setMobileOpen(false)}>{nav.docs}</Link>
          <Link href={altPath(lang, pathname)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] [color:var(--mk-text-muted)] hover:[color:var(--mk-text)] hover:[background:var(--mk-hover)]" onClick={() => setMobileOpen(false)}>
            <Globe size={13} /> {lang === "en" ? "Auf Deutsch lesen" : "Read in English"}
          </Link>
        </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
    </header>
    </>
  );
}

function SocialLinkedIn({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.72V1.72C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

function SocialGitHub({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.09 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.34-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.49 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5z" />
    </svg>
  );
}

function SocialX({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.63 7.58H.48l8.6-9.83L0 1.15h7.59l5.24 6.93 6.07-6.93zm-1.29 19.5h2.04L6.49 3.24H4.3L17.61 20.65z" />
    </svg>
  );
}

export function MarketingFooter({ lang }: { lang: Lang }) {
  const footer = FOOTER[lang];
  return (
    <footer className="relative z-10 border-t [border-color:var(--mk-border)] py-14 px-6" style={{ background: "var(--mk-surface)" }}>
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 mb-10">
          <div className="col-span-2">
            <div className="mb-3">
              <SubsumioLogo size={28} />
            </div>
            <p className="text-sm [color:var(--mk-text-muted)] mb-4">
              {lang === "de" ? "Das Gedächtnis Ihrer Kanzlei — für AT, DE und CH." : "The memory layer for your law firm — built for AT, DE and CH."}
            </p>
            <p className="text-xs [color:var(--mk-text-subtle)] leading-relaxed max-w-xs">{footer.note}</p>
            <div className="flex items-center gap-3 mt-4">
              <a href="https://www.linkedin.com/company/subsumio" target="_blank" rel="noreferrer" aria-label="LinkedIn" className="[color:var(--mk-text-subtle)] hover:brand-text transition-colors">
                <SocialLinkedIn size={16} />
              </a>
              <a href="https://github.com/subsumio" target="_blank" rel="noreferrer" aria-label="GitHub" className="[color:var(--mk-text-subtle)] hover:brand-text transition-colors">
                <SocialGitHub size={16} />
              </a>
              <a href="https://x.com/subsumio" target="_blank" rel="noreferrer" aria-label="X (Twitter)" className="[color:var(--mk-text-subtle)] hover:brand-text transition-colors">
                <SocialX size={16} />
              </a>
            </div>
          </div>
          {footer.columns.map((col) => (
            <div key={col.title}>
              <p className="text-xs font-semibold [color:var(--mk-text-muted)] uppercase tracking-wider mb-3">{col.title}</p>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {"external" in link && link.external ? (
                      <a href={link.href} target="_blank" rel="noreferrer" className="text-xs [color:var(--mk-text-subtle)] hover:[color:var(--mk-text-muted)]">{link.label}</a>
                    ) : (
                      // App-Routen (/dashboard…) sind nicht lokalisiert —
                      // niemals den Sprachpräfix anhängen (/de/dashboard = 404).
                      <Link href={link.href.startsWith("/dashboard") ? link.href : p(lang, link.href)} className="text-xs [color:var(--mk-text-subtle)] hover:[color:var(--mk-text-muted)]">{link.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="pt-6 border-t [border-color:var(--mk-border)] flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs [color:var(--mk-text-subtle)]">© 2026 Subsumio · {lang === "de" ? "Legal Intelligence für Kanzleien" : "Legal intelligence for law firms"}</p>
          <p className="text-xs [color:var(--mk-text-subtle)]">
            {lang === "en" ? "EU-hosted or self-hosted · GDPR-ready · confidentiality-first" : "EU-gehostet oder self-hosted · DSGVO-konform · vertraulichkeitskritisch"}
          </p>
        </div>
      </div>
    </footer>
  );
}

// --- Shared section primitives -------------------------------------------

export function SectionHeading({ badge, title, sub, tone }: { badge?: string; title: string; sub?: string; tone?: Tone }) {
  // `tone` is optional: when set it makes the heading self-contained (resolves
  // its own --mk-* tokens), otherwise it inherits the surrounding section tone.
  return (
    <motion.div
      data-tone={tone}
      className="text-center mb-14"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px 80px 0px", amount: 0.15 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      {badge && (
        <motion.span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold brand-soft brand-text border brand-border mb-5"
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "0px 0px 80px 0px" }}
          transition={{ duration: 0.4, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="w-1.5 h-1.5 rounded-full brand-bg animate-pulse" />
          {badge}
        </motion.span>
      )}
      <h2 className="text-3xl md:text-4xl font-black mb-4 [color:var(--mk-text)] tracking-tight">{title}</h2>
      {sub && (
        <p className="text-lg max-w-2xl mx-auto [color:var(--mk-text-muted)] leading-relaxed">
          {sub}
        </p>
      )}
    </motion.div>
  );
}

/** Terminal-style demo window with a typewriter answer. */
export function DemoWindow({
  windowTitle, you, q, a, sourcesLabel, sources,
}: {
  windowTitle: string; you: string; q: string; a: string; sourcesLabel: string; sources: readonly string[];
}) {
  return (
    <div className="rounded-2xl border [border-color:var(--mk-border)] [background:var(--mk-surface)] shadow-2xl shadow-black/20 overflow-hidden text-left">
      <div className="flex items-center gap-2 px-4 py-3 border-b [border-color:var(--mk-border)] [background:var(--mk-bg)]">
        <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
        <div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
        <div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
        <div className="flex-1 ml-4 text-xs [color:var(--mk-text)] opacity-60 font-mono">{windowTitle}</div>
      </div>
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-[var(--brand-primary)]/15 border border-[var(--brand-primary)]/20 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-[10px] brand-text font-semibold">{you}</span>
          </div>
          <p className="text-sm [color:var(--mk-text)]">{q}</p>
        </div>
      </div>
      <div className="px-6 pb-6">
        <div className="flex items-start gap-3">
          <SubsumioMark size={28} className="shrink-0 mt-0.5" />
          <div className="flex-1 text-sm [color:var(--mk-text-muted)] leading-relaxed whitespace-pre-line">
            <TypewriterText text={a} speed={8} />
          </div>
        </div>
      </div>
      <div className="px-6 py-3 border-t [border-color:var(--mk-border)] [background:var(--mk-bg)] flex items-center gap-2 flex-wrap">
        <span className="text-xs [color:var(--mk-text)] opacity-60">{sourcesLabel}</span>
        {sources.map((slug) => (
          <span key={slug} className="text-xs font-mono brand-text brand-soft px-2 py-0.5 rounded">{slug}</span>
        ))}
      </div>
    </div>
  );
}

export function TypewriterText({ text, speed = 12 }: { text: string; speed?: number }) {
  const reduce = useReducedMotion();
  const [displayed, setDisplayed] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (reduce) {
      setDisplayed(text);
      setStarted(true);
      return;
    }
    const t = setTimeout(() => setStarted(true), 800);
    return () => clearTimeout(t);
  }, [reduce, text]);

  useEffect(() => {
    if (reduce || !started || displayed.length >= text.length) return;
    const t = setTimeout(() => setDisplayed(text.slice(0, displayed.length + 1)), speed);
    return () => clearTimeout(t);
  }, [reduce, displayed, started, text, speed]);

  return (
    <span>
      {displayed}
      {!reduce && displayed.length < text.length && started && (
        <span className="inline-block w-0.5 h-4 bg-[var(--brand-text)] animate-pulse ml-0.5 align-text-bottom" />
      )}
    </span>
  );
}

/** Renders **bold** spans inside demo answers (simple, no markdown lib). */
export function FaqList({ items }: { items: readonly { q: string; a: string }[] }) {
  return (
    <div className="max-w-3xl mx-auto space-y-3">
      {items.map((item) => (
        <details key={item.q} className="group rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-surface)] open:[border-color:var(--mk-border-strong)]">
          <summary className="flex items-center justify-between cursor-pointer list-none px-5 py-4 text-sm font-medium [color:var(--mk-text)]">
            {item.q}
            <ChevronDown size={15} className="[color:var(--mk-text-subtle)] shrink-0 ml-4 group-open:rotate-180 transition-transform" />
          </summary>
          <p className="px-5 pb-4 text-sm [color:var(--mk-text-muted)] leading-relaxed">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
