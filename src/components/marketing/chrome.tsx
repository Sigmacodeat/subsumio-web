"use client";

// Shared marketing chrome: Nav (with language switcher), Footer,
// and small shared primitives used across all marketing pages.

import { useEffect, useRef, useState } from "react";
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
  Download,
  User,
  Building2,
  Info,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EASE } from "./motion-system";
import { SubsumioLogo, SubsumioMark } from "@/components/brand/subsumio-logo";
import { type SiteBrand } from "@/lib/brand";
import {
  NAV,
  FOOTER,
  p,
  UI_STRINGS,
  SUPPORTED_LANGS,
  JURISDICTION_LABEL,
  HREFLANG,
  type Lang,
  type NavContent,
  type NavFeaturedContent,
} from "@/content/site";

/** Persist the user's explicit language choice so the browser-language redirect doesn't override it. */
function setLangPref(lang: Lang) {
  document.cookie = `sb_lang=${lang};path=/;max-age=${365 * 24 * 3600};samesite=lax`;
}

export function useSiteBrand(): SiteBrand {
  return "subsumio";
}

function BrandLogo() {
  return <SubsumioLogo size={32} />;
}

// Content files store icon names as strings; resolve them here.
export const ICONS: Record<string, LucideIcon> = {
  Brain,
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
  Download,
  User,
  Building2,
  Info,
  Sparkles,
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
    orange: "text-orange-700 bg-orange-50 border-orange-200",
    gray: "text-gray-700 bg-gray-50 border-gray-200",
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
  dashboard: {
    violet: "brand-text brand-soft brand-border",
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    rose: "text-rose-400 bg-rose-500/10 border-rose-500/20",
    purple: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  },
} as const;

export type Tone = "light" | "slate" | "dark" | "dashboard";

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
  ...rest
}: {
  tone?: Tone;
  id?: string;
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  // `...rest` forwards native section attributes (notably `aria-label`, which
  // callers pass for landmark labeling) onto the real <section> — previously
  // these were silently dropped, leaving the marketing landmarks unlabeled.
  return (
    <section
      id={id}
      data-tone={tone}
      className={`relative z-10 ${className}`}
      style={{ background: "var(--mk-bg)" }}
      {...rest}
    >
      {(tone === "dark" || tone === "slate") && (
        <>
          {/* Premium top edge — 1px hairline + subtle brand glow.
              Replaces cheap gradient strips with a clean, intentional
              boundary (Linear/Vercel pattern). */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{ background: "var(--mk-border-strong)" }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-40"
            style={{
              background:
                "radial-gradient(ellipse 70% 100% at 50% 0%, color-mix(in srgb, var(--brand-primary) 7%, transparent), transparent)",
            }}
          />
        </>
      )}
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
  { Icon: Brain, x: "8%", y: "12%", size: 180, opacity: 0.035, speed: 0.4 },
  { Icon: Database, x: "85%", y: "18%", size: 140, opacity: 0.03, speed: -0.3 },
  { Icon: GitBranch, x: "72%", y: "55%", size: 200, opacity: 0.025, speed: 0.5 },
  { Icon: Shield, x: "15%", y: "62%", size: 160, opacity: 0.03, speed: -0.45 },
  { Icon: Network, x: "92%", y: "78%", size: 120, opacity: 0.035, speed: 0.35 },
  { Icon: Search, x: "5%", y: "85%", size: 100, opacity: 0.025, speed: -0.25 },
  { Icon: Zap, x: "45%", y: "8%", size: 90, opacity: 0.02, speed: 0.55 },
  { Icon: Layers, x: "55%", y: "92%", size: 130, opacity: 0.03, speed: -0.4 },
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
    <motion.div style={{ y: yIcon, left: x, top: y }} className="absolute will-change-transform">
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
  const yBlue = useTransform(scrollY, [0, 2400], [0, -190 * span]);
  const yGrid = useTransform(scrollY, [0, 2400], [0, 110 * span]);

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      {/* Gradient orbs (existing) */}
      <motion.div
        style={{ y: yViolet }}
        className="absolute top-[-20%] left-[-10%] will-change-transform"
      >
        <div className="orb brand-glow-bg h-[600px] w-[600px] rounded-full" />
      </motion.div>
      <motion.div
        style={{ y: yBlue }}
        className="absolute right-[-10%] bottom-[-20%] will-change-transform"
      >
        <div className="orb-slow brand-secondary-soft h-[500px] w-[500px] rounded-full" />
      </motion.div>

      {/* Subtle grid (existing, lowered opacity for calmer look) */}
      <motion.div
        style={{ y: yGrid }}
        className="grid-bg absolute inset-0 opacity-[0.22] will-change-transform"
      />

      {/* Parallax icon silhouettes */}
      {BG_ICONS.map((def, i) => (
        <ParallaxIcon key={i} def={def} scrollY={scrollY} span={span} />
      ))}
    </div>
  );
}

// --- Shared nav link styles (DRY — desktop + mobile use the same definitions) --
const NAV_LINK_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mk-surface)]";
const NAV_LINK_BORDER = "border border-transparent";
const NAV_LINK_INACTIVE =
  "[color:var(--mk-text-muted)] hover:[color:var(--brand-text)] hover:[background:var(--mk-hover)]";
const NAV_LINK_ACTIVE =
  "[color:var(--brand-text)] [background:color-mix(in_srgb,var(--brand-primary)_10%,var(--mk-hover))] font-medium [border-color:color-mix(in_srgb,var(--brand-primary)_20%,var(--mk-border))]";

/** Shared link class helper — used by both desktop and mobile nav. */
function navLinkCls(isActive: boolean): string {
  return `text-sm px-3 py-2 rounded-lg transition-all duration-200 ${NAV_LINK_BORDER} ${NAV_LINK_FOCUS} ${
    isActive ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE
  }`;
}

/** Mobile link helper — same active/inactive styles, block + 44px touch target. */
function mobileLinkCls(isActive: boolean): string {
  return `block text-sm px-3 py-2.5 rounded-lg transition-colors ${NAV_LINK_BORDER} ${NAV_LINK_FOCUS} min-h-[44px] flex items-center ${
    isActive ? NAV_LINK_ACTIVE : NAV_LINK_INACTIVE
  }`;
}

/** Badge pill for "AI" / "New" tags in nav items. */
function NavBadge({ label }: { label: string }) {
  const isAi = label === "AI" || label === "KI";
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] leading-none font-bold ${
        isAi ? "brand-bg text-white" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      }`}
    >
      {isAi && <Sparkles size={8} className="shrink-0" />}
      {label}
    </span>
  );
}

/** Featured content sidebar for mega menus — rich card with icon, title, description. */
function FeaturedSidebar({
  content,
  lang,
  onClick,
}: {
  content: NavFeaturedContent;
  lang: Lang;
  onClick: () => void;
}) {
  const Icon = ICONS[content.icon ?? "Sparkles"] ?? Sparkles;
  return (
    <Link
      href={p(lang, content.href)}
      onClick={onClick}
      className="group relative flex w-[240px] shrink-0 flex-col justify-between border-l [border-color:var(--mk-border)] p-4 transition-colors hover:[background:var(--mk-hover)]"
    >
      {/* Decorative gradient orb */}
      <div className="brand-bg pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full opacity-[0.07] blur-2xl transition-opacity duration-300 group-hover:opacity-[0.12]" />

      <div className="relative">
        {/* Icon + Badge row */}
        <div className="mb-3 flex items-center gap-2">
          <div className="brand-soft brand-border flex h-10 w-10 items-center justify-center rounded-xl border">
            <Icon size={18} className="brand-text" />
          </div>
          {content.badge && <NavBadge label={content.badge} />}
        </div>
        {/* Title */}
        <div className="text-sm font-semibold [color:var(--mk-text)]">{content.title}</div>
        {/* Description */}
        <div className="mt-1 text-xs leading-relaxed [color:var(--mk-text-subtle)]">
          {content.description}
        </div>
      </div>

      {/* CTA arrow */}
      <div className="brand-text mt-4 flex items-center gap-1 text-xs font-medium">
        <ChevronRight
          size={14}
          className="shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
        />
      </div>
    </Link>
  );
}

/** Announcement bar above the header — dismissible, links to featured content. */
function AnnouncementBar({ nav, lang }: { nav: NavContent; lang: Lang }) {
  const [dismissed, setDismissed] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    try {
      if (sessionStorage.getItem("sb_announcement_dismissed") === "1") {
        setDismissed(true);
      }
    } catch {}
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem("sb_announcement_dismissed", "1");
    } catch {}
  };

  if (!nav.announcement) return null;

  return (
    <AnimatePresence>
      {!dismissed && (
        <motion.div
          key="announcement-bar"
          initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: -8 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.3, ease: "easeOut" }}
          className="relative z-[60] border-b [border-color:color-mix(in_srgb,var(--brand-primary)_12%,var(--mk-border))]"
          style={{
            background:
              "linear-gradient(90deg, color-mix(in srgb, var(--brand-primary) 5%, var(--mk-bg)), color-mix(in srgb, var(--brand-primary) 2%, var(--mk-bg)))",
          }}
        >
          <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-1.5 text-center sm:px-6 lg:px-8">
            <Link
              href={p(lang, nav.announcement.href)}
              className="group hover:brand-text flex items-center gap-2 text-xs font-medium [color:var(--mk-text)] transition-colors"
            >
              {nav.announcement.badge && (
                <span className="relative inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] leading-none font-bold text-white">
                  <span className="brand-bg relative z-10 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5">
                    <Sparkles size={8} className="shrink-0" />
                    {nav.announcement.badge}
                  </span>
                </span>
              )}
              <span>{nav.announcement.text}</span>
              <ChevronRight
                size={12}
                className="shrink-0 [color:var(--brand-text)] transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </Link>
            <button
              onClick={handleDismiss}
              className="absolute top-1/2 right-3 -translate-y-1/2 rounded p-1 [color:var(--mk-text-subtle)] transition-colors hover:[color:var(--mk-text)] hover:[background:var(--mk-hover)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
              aria-label={UI_STRINGS[lang].dismissAnnouncement}
            >
              <X size={12} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function MarketingNav({ lang }: { lang: Lang }) {
  const nav = NAV[lang];
  const pathname = usePathname() || "/";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [openSection, setOpenSection] = useState<number | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState<number | null>(null);
  const [langOpen, setLangOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const firstMobileLinkRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const langRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrollY = useRef(0);

  const isActive = (href: string) => pathname === p(lang, href) || pathname === href;

  const isSectionActive = (sectionIdx: number) => {
    return nav.sections[sectionIdx].items.some((item) => isActive(item.href));
  };

  // Scroll detection — backdrop blur after 8px + hide/show on scroll direction.
  useEffect(() => {
    const onScroll = () => {
      const currentY = window.scrollY;
      setScrolled(currentY > 8);
      // Hide header on scroll down (past 120px), show on scroll up.
      if (currentY > 120 && currentY > lastScrollY.current) {
        setHeaderVisible(false);
      } else {
        setHeaderVisible(true);
      }
      lastScrollY.current = currentY;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mobile menu + mega dropdown on route change.
  useEffect(() => {
    setMobileOpen(false);
    setOpenSection(null);
    setLangOpen(false);
  }, [pathname]);

  // Body scroll lock + focus management when mobile menu is open.
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
      const t = setTimeout(() => firstMobileLinkRef.current?.focus(), 50);
      return () => {
        document.body.style.overflow = "";
        clearTimeout(t);
      };
    }
    document.body.style.overflow = "";
  }, [mobileOpen]);

  // Escape closes mobile menu and returns focus to hamburger.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
        hamburgerRef.current?.focus();
      }
      // Focus trap — Tab cycles within drawer.
      if (e.key === "Tab" && mobileMenuRef.current) {
        const focusable = mobileMenuRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  // Click-outside closes mobile menu.
  useEffect(() => {
    if (!mobileOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [mobileOpen]);

  // Keyboard handling for mega dropdown (Escape closes).
  useEffect(() => {
    if (openSection === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenSection(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openSection]);

  // Click-outside closes mega dropdown.
  useEffect(() => {
    if (openSection === null) return;
    const onMouseDown = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenSection(null);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [openSection]);

  // Click-outside closes language dropdown.
  useEffect(() => {
    if (!langOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [langOpen]);

  // Escape closes language dropdown.
  useEffect(() => {
    if (!langOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLangOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [langOpen]);

  // Cleanup hover timeout on unmount.
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const handleSectionEnter = (idx: number) => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setOpenSection(idx);
  };

  const handleSectionLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => setOpenSection(null), 150);
  };

  return (
    <>
      <AnnouncementBar nav={nav} lang={lang} />
      <div
        className={`sticky top-0 z-50 transition-transform duration-300 ${
          headerVisible ? "translate-y-0" : "-translate-y-full"
        }`}
      >
        <header
          data-tone="light"
          className={`border-b transition-[background,box-shadow,border-color] duration-300 ${
            scrolled
              ? "[border-color:var(--mk-border)] shadow-[0_1px_0_rgba(0,0,0,0.06),0_4px_20px_rgba(0,0,0,0.06)] backdrop-blur-xl"
              : "[border-color:transparent]"
          }`}
          style={{
            background: scrolled
              ? "color-mix(in srgb, var(--mk-bg) 88%, transparent)"
              : "var(--mk-bg)",
          }}
        >
          <nav
            ref={navRef}
            className="mx-auto max-w-7xl px-4 py-2.5 sm:px-6 lg:px-8"
            aria-label="Main navigation"
          >
            <div className="flex items-center justify-between gap-4">
              <Link href={p(lang, "")} aria-label="Subsumio home" className="shrink-0">
                <BrandLogo />
              </Link>

              {/* Desktop nav — mega dropdown sections with featured content */}
              <div className="hidden items-center gap-0.5 lg:flex">
                {nav.sections.map((section, sIdx) => {
                  const sectionActive = isSectionActive(sIdx);
                  const isOpen = openSection === sIdx;
                  return (
                    <div
                      key={section.label}
                      className="relative"
                      onMouseEnter={() => handleSectionEnter(sIdx)}
                      onMouseLeave={handleSectionLeave}
                    >
                      <button
                        className={`relative flex items-center gap-1 rounded-lg px-3 py-2 text-sm transition-all duration-200 ${NAV_LINK_BORDER} ${NAV_LINK_FOCUS} ${
                          sectionActive || isOpen
                            ? "font-medium [color:var(--brand-text)]"
                            : NAV_LINK_INACTIVE
                        }`}
                        onClick={() => setOpenSection(isOpen ? null : sIdx)}
                        aria-expanded={isOpen}
                        aria-haspopup="true"
                        aria-controls={`mega-menu-${sIdx}`}
                      >
                        {section.label}
                        <ChevronDown
                          size={14}
                          className={`shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                        />
                        {/* Active section underline indicator */}
                        {sectionActive && (
                          <span className="brand-bg absolute -bottom-[1px] left-1/2 h-[2px] w-6 -translate-x-1/2 rounded-full" />
                        )}
                      </button>

                      <AnimatePresence>
                        {isOpen && (
                          <motion.div
                            id={`mega-menu-${sIdx}`}
                            initial={
                              reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8, scale: 0.98 }
                            }
                            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
                            transition={
                              reduceMotion
                                ? { duration: 0 }
                                : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
                            }
                            className="absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2"
                            style={{
                              minWidth: section.featuredContent
                                ? "640px"
                                : section.items.length > 4
                                  ? "560px"
                                  : "340px",
                            }}
                          >
                            {/* Arrow pointer */}
                            <div className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-t border-l [border-color:var(--mk-border)] [background:var(--mk-surface)]" />
                            <div
                              className="overflow-hidden rounded-2xl border [border-color:var(--mk-border)] shadow-2xl shadow-black/10 backdrop-blur-xl"
                              style={{
                                background:
                                  "color-mix(in srgb, var(--mk-surface) 96%, transparent)",
                              }}
                              role="menu"
                              aria-label={section.label}
                            >
                              <div
                                className={`flex ${section.featuredContent ? "flex-row" : "flex-col"}`}
                              >
                                {/* Nav items grid */}
                                <div
                                  className={`flex-1 ${section.items.length > 4 ? "grid grid-cols-2 gap-1 p-3" : "p-3"}`}
                                >
                                  {section.items.map((item) => {
                                    const active = isActive(item.href);
                                    const Icon = ICONS[item.icon] ?? Layers;
                                    return (
                                      <Link
                                        key={item.href + item.label}
                                        href={p(lang, item.href)}
                                        onClick={() => setOpenSection(null)}
                                        role="menuitem"
                                        className={`group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-all duration-150 ${NAV_LINK_FOCUS} ${
                                          active
                                            ? "[background:color-mix(in_srgb,var(--brand-primary)_8%,var(--mk-hover))]"
                                            : "hover:[background:var(--mk-hover)]"
                                        } ${item.featured ? "ring-1 ring-[color-mix(in_srgb,var(--brand-primary)_12%,transparent)]" : ""}`}
                                      >
                                        <div
                                          className={`group-hover:brand-soft group-hover:brand-border flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border [border-color:var(--mk-border)] transition-colors [background:var(--mk-bg)] ${item.featured ? "brand-soft brand-border" : ""}`}
                                        >
                                          <Icon
                                            size={16}
                                            className={`group-hover:brand-text [color:var(--mk-text-muted)] ${item.featured ? "brand-text" : ""}`}
                                          />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <div
                                            className={`flex items-center gap-1.5 text-sm font-medium ${active ? "brand-text" : "[color:var(--mk-text)]"}`}
                                          >
                                            {item.label}
                                            {item.badge && <NavBadge label={item.badge} />}
                                          </div>
                                          <div className="mt-0.5 text-xs leading-snug [color:var(--mk-text-subtle)]">
                                            {item.description}
                                          </div>
                                        </div>
                                      </Link>
                                    );
                                  })}
                                </div>

                                {/* Featured content sidebar */}
                                {section.featuredContent && (
                                  <FeaturedSidebar
                                    content={section.featuredContent}
                                    lang={lang}
                                    onClick={() => setOpenSection(null)}
                                  />
                                )}
                              </div>
                              {/* Footer CTA */}
                              {section.ctaBottom && (
                                <Link
                                  href={p(lang, section.ctaBottom.href)}
                                  onClick={() => setOpenSection(null)}
                                  className="group hover:brand-text flex items-center justify-between border-t [border-color:var(--mk-border)] px-4 py-2.5 text-xs font-medium [color:var(--mk-text-muted)] transition-colors hover:[background:var(--mk-hover)]"
                                >
                                  {section.ctaBottom.label}
                                  <ChevronRight
                                    size={12}
                                    className="shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                                  />
                                </Link>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}

                {/* Standalone pricing link */}
                <Link
                  href={p(lang, nav.pricingHref)}
                  className={navLinkCls(isActive(nav.pricingHref))}
                  aria-current={isActive(nav.pricingHref) ? "page" : undefined}
                >
                  {nav.pricingLabel}
                </Link>
              </div>

              {/* Action area */}
              <div className="flex items-center gap-1.5">
                {/* Language switcher — click-to-open with keyboard support */}
                <div ref={langRef} className="relative hidden lg:block">
                  <button
                    className="flex min-h-[36px] items-center gap-1.5 rounded-full px-3 py-1.5 text-xs [color:var(--mk-text-muted)] transition-colors duration-200 [background:var(--mk-surface)] hover:[color:var(--mk-text)] hover:[background:var(--mk-hover)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
                    aria-label="Language"
                    aria-haspopup="true"
                    aria-expanded={langOpen}
                    onClick={() => setLangOpen(!langOpen)}
                  >
                    <Globe size={12} /> {JURISDICTION_LABEL[lang]}
                    <ChevronDown
                      size={10}
                      className={`opacity-50 transition-transform duration-200 ${langOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  <AnimatePresence>
                    {langOpen && (
                      <motion.div
                        initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 4 }}
                        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 }}
                        transition={
                          reduceMotion ? { duration: 0 } : { duration: 0.15, ease: "easeOut" }
                        }
                        className="absolute top-full right-0 z-50 mt-1.5"
                      >
                        <div
                          className="overflow-hidden rounded-xl border [border-color:var(--mk-border)] p-1.5 shadow-xl shadow-black/10 [background:var(--mk-surface)]"
                          role="menu"
                          aria-label="Language"
                        >
                          {SUPPORTED_LANGS.map((l) => (
                            <Link
                              key={l}
                              href={p(l, pathname.replace(/^\/(en|at|ch|it|es|pl|fr|nl)/, ""))}
                              onClick={() => {
                                setLangPref(l);
                                setLangOpen(false);
                              }}
                              role="menuitem"
                              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs transition-colors hover:[background:var(--mk-hover)] ${l === lang ? "brand-text font-medium" : "[color:var(--mk-text-muted)]"}`}
                            >
                              <span className="font-mono text-[10px] opacity-60">
                                {HREFLANG[l]}
                              </span>
                              <span>{JURISDICTION_LABEL[l]}</span>
                            </Link>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                {/* Secondary CTA — Demo ansehen / Watch demo */}
                {nav.ctaSecondary && nav.ctaSecondaryHref && (
                  <Link href={p(lang, nav.ctaSecondaryHref)} className="hidden lg:block">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="hover:brand-text text-xs [color:var(--mk-text-muted)]"
                    >
                      {nav.ctaSecondary}
                    </Button>
                  </Link>
                )}
                <Link href={p(lang, "/login")} className="hidden lg:block">
                  <Button variant="ghost" size="sm" className="[color:var(--mk-text)]">
                    {nav.signIn}
                  </Button>
                </Link>
                <Link href={p(lang, "/signup")} className="hidden sm:block">
                  <Button size="sm" variant="primary" className="group min-h-[36px]">
                    {nav.cta}
                    <ChevronRight
                      size={14}
                      className="transition-transform duration-200 group-hover:translate-x-0.5"
                    />
                  </Button>
                </Link>
                {/* Compact CTA icon for xs screens */}
                <Link href={p(lang, "/signup")} className="sm:hidden">
                  <Button size="sm" variant="primary" className="group min-h-[36px] px-3">
                    <ChevronRight
                      size={16}
                      className="transition-transform duration-200 group-hover:translate-x-0.5"
                    />
                  </Button>
                </Link>
                <button
                  ref={hamburgerRef}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 [color:var(--mk-text)] transition-colors hover:[background:var(--mk-hover)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mk-surface)] focus-visible:outline-none lg:hidden"
                  onClick={() => setMobileOpen(!mobileOpen)}
                  aria-label={UI_STRINGS[lang].menuAria}
                  aria-expanded={mobileOpen}
                  aria-controls="mobile-nav-menu"
                >
                  {mobileOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
              </div>
            </div>

            {/* Mobile full-screen drawer */}
            <AnimatePresence>
              {mobileOpen && (
                <>
                  {/* Backdrop overlay */}
                  <motion.div
                    initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
                    animate={reduceMotion ? { opacity: 1 } : { opacity: 1 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0 }}
                    transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
                    className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
                    onClick={() => setMobileOpen(false)}
                  />
                  {/* Drawer panel */}
                  <motion.div
                    ref={mobileMenuRef}
                    id="mobile-nav-menu"
                    aria-label="Mobile navigation"
                    role="dialog"
                    aria-modal="true"
                    initial={reduceMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: "100%" }}
                    animate={reduceMotion ? { opacity: 1, x: 0 } : { opacity: 1, x: 0 }}
                    exit={reduceMotion ? { opacity: 0, x: 0 } : { opacity: 0, x: "100%" }}
                    transition={
                      reduceMotion ? { duration: 0 } : { duration: 0.25, ease: [0.22, 1, 0.36, 1] }
                    }
                    className="fixed top-0 right-0 bottom-0 z-50 flex w-full max-w-sm flex-col overflow-y-auto border-l [border-color:var(--mk-border)] [background:var(--mk-bg)] lg:hidden"
                  >
                    {/* Drawer header */}
                    <div className="flex items-center justify-between border-b [border-color:var(--mk-border)] px-4 py-3">
                      <Link
                        href={p(lang, "")}
                        onClick={() => setMobileOpen(false)}
                        className="shrink-0"
                      >
                        <BrandLogo />
                      </Link>
                      <button
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 [color:var(--mk-text)] transition-colors hover:[background:var(--mk-hover)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:outline-none"
                        onClick={() => setMobileOpen(false)}
                        aria-label="Close menu"
                      >
                        <X size={20} />
                      </button>
                    </div>

                    {/* Quick CTA row */}
                    <div className="flex gap-2 border-b [border-color:var(--mk-border)] px-4 py-3">
                      <Link
                        href={p(lang, "/signup")}
                        onClick={() => setMobileOpen(false)}
                        className="flex-1"
                      >
                        <Button size="sm" variant="primary" className="group min-h-[44px] w-full">
                          {nav.cta}
                          <ChevronRight
                            size={14}
                            className="transition-transform duration-200 group-hover:translate-x-0.5"
                          />
                        </Button>
                      </Link>
                      <Link
                        href={p(lang, "/login")}
                        onClick={() => setMobileOpen(false)}
                        className="flex-1"
                      >
                        <Button
                          size="sm"
                          variant="ghost"
                          className="min-h-[44px] w-full [color:var(--mk-text)]"
                        >
                          {nav.signIn}
                        </Button>
                      </Link>
                    </div>

                    {/* Expandable sections */}
                    <div className="flex-1 px-2 py-2">
                      {nav.sections.map((section, sIdx) => {
                        const expanded = mobileExpanded === sIdx;
                        const sectionActive = isSectionActive(sIdx);
                        return (
                          <div key={section.label}>
                            <button
                              ref={sIdx === 0 ? firstMobileLinkRef : undefined}
                              className={`flex min-h-[48px] w-full items-center justify-between rounded-lg px-3 py-3 text-base font-medium transition-colors ${NAV_LINK_FOCUS} ${
                                sectionActive ? "brand-text" : "[color:var(--mk-text)]"
                              } hover:[background:var(--mk-hover)]`}
                              onClick={() => setMobileExpanded(expanded ? null : sIdx)}
                              aria-expanded={expanded}
                            >
                              {section.label}
                              <ChevronDown
                                size={18}
                                className={`shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""} [color:var(--mk-text-subtle)]`}
                              />
                            </button>
                            <AnimatePresence>
                              {expanded && (
                                <motion.div
                                  initial={
                                    reduceMotion ? { opacity: 1 } : { opacity: 0, height: 0 }
                                  }
                                  animate={
                                    reduceMotion ? { opacity: 1 } : { opacity: 1, height: "auto" }
                                  }
                                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                                  transition={
                                    reduceMotion
                                      ? { duration: 0 }
                                      : { duration: 0.15, ease: "easeInOut" }
                                  }
                                  className="overflow-hidden"
                                >
                                  <div className="ml-3 space-y-0.5 border-l [border-color:var(--mk-border)] pl-3">
                                    {section.items.map((item) => {
                                      const active = isActive(item.href);
                                      const Icon = ICONS[item.icon] ?? Layers;
                                      return (
                                        <Link
                                          key={item.href + item.label}
                                          href={p(lang, item.href)}
                                          className={mobileLinkCls(active)}
                                          aria-current={active ? "page" : undefined}
                                          onClick={() => setMobileOpen(false)}
                                        >
                                          <span className="flex items-center gap-2">
                                            <Icon
                                              size={16}
                                              className="shrink-0 [color:var(--mk-text-subtle)]"
                                            />
                                            <span className="flex flex-1 items-center gap-1.5">
                                              <span>{item.label}</span>
                                              {item.badge && <NavBadge label={item.badge} />}
                                            </span>
                                          </span>
                                        </Link>
                                      );
                                    })}
                                    {/* Mobile footer CTA */}
                                    {section.ctaBottom && (
                                      <Link
                                        href={p(lang, section.ctaBottom.href)}
                                        className={`${mobileLinkCls(false)} brand-text font-medium`}
                                        onClick={() => setMobileOpen(false)}
                                      >
                                        <span className="flex items-center gap-1.5">
                                          {section.ctaBottom.label}
                                          <ChevronRight size={12} />
                                        </span>
                                      </Link>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}

                      {/* Standalone pricing link */}
                      <Link
                        href={p(lang, nav.pricingHref)}
                        className={mobileLinkCls(isActive(nav.pricingHref))}
                        aria-current={isActive(nav.pricingHref) ? "page" : undefined}
                        onClick={() => setMobileOpen(false)}
                      >
                        {nav.pricingLabel}
                      </Link>
                    </div>

                    {/* Language switcher — bottom of drawer */}
                    <div className="border-t [border-color:var(--mk-border)] px-4 py-3">
                      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium [color:var(--mk-text-subtle)]">
                        <Globe size={12} /> {UI_STRINGS[lang].languageLabel}
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {SUPPORTED_LANGS.map((l) => (
                          <Link
                            key={l}
                            href={p(l, pathname.replace(/^\/(en|at|ch|it|es|pl|fr|nl)/, ""))}
                            className={`flex items-center justify-center rounded-lg px-2 py-2 text-xs transition-colors ${
                              l === lang
                                ? "brand-soft brand-border brand-text border font-medium"
                                : "[color:var(--mk-text-muted)] hover:[background:var(--mk-hover)]"
                            }`}
                            onClick={() => {
                              setMobileOpen(false);
                              setLangPref(l);
                            }}
                          >
                            {JURISDICTION_LABEL[l]}
                          </Link>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </nav>
        </header>
      </div>
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
    <footer
      className="relative z-10 border-t [border-color:var(--mk-border)] px-4 py-14 sm:px-6 lg:px-8"
      style={{ background: "var(--mk-surface)" }}
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 grid grid-cols-2 gap-8 md:grid-cols-6">
          <div className="col-span-2">
            <div className="mb-3">
              <SubsumioLogo size={28} />
            </div>
            <p className="mb-4 text-sm [color:var(--mk-text-muted)]">
              {lang === "en"
                ? "The firm brain that never forgets — built for AT, DE and CH."
                : "Das Kanzlei-Brain, das nie vergisst — für AT, DE und CH."}
            </p>
            <p className="max-w-xs text-xs leading-relaxed [color:var(--mk-text-subtle)]">
              {footer.note}
            </p>
            <div className="mt-4 flex items-center gap-3">
              <a
                href="https://www.linkedin.com/company/subsumio"
                target="_blank"
                rel="noreferrer"
                aria-label="LinkedIn"
                className="hover:brand-text [color:var(--mk-text-subtle)] transition-colors"
              >
                <SocialLinkedIn size={16} />
              </a>
              <a
                href="https://github.com/subsumio"
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub"
                className="hover:brand-text [color:var(--mk-text-subtle)] transition-colors"
              >
                <SocialGitHub size={16} />
              </a>
              <a
                href="https://x.com/subsumio"
                target="_blank"
                rel="noreferrer"
                aria-label="X (Twitter)"
                className="hover:brand-text [color:var(--mk-text-subtle)] transition-colors"
              >
                <SocialX size={16} />
              </a>
            </div>
          </div>
          {footer.columns.map((col) => (
            <div key={col.title}>
              <p className="mb-3 text-xs font-semibold tracking-wider [color:var(--mk-text-muted)] uppercase">
                {col.title}
              </p>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {"external" in link && link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs [color:var(--mk-text-subtle)] hover:[color:var(--mk-text-muted)]"
                      >
                        {link.label}
                      </a>
                    ) : (
                      // App-Routen (/dashboard…) sind nicht lokalisiert —
                      // niemals den Sprachpräfix anhängen (/en/dashboard = 404).
                      <Link
                        href={link.href.startsWith("/dashboard") ? link.href : p(lang, link.href)}
                        className="text-xs [color:var(--mk-text-subtle)] hover:[color:var(--mk-text-muted)]"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-col items-center justify-between gap-2 border-t [border-color:var(--mk-border)] pt-6 sm:flex-row">
          <p className="text-xs [color:var(--mk-text-subtle)]">
            © 2026 Subsumio ·{" "}
            {lang !== "en"
              ? "Legal Intelligence für Kanzleien"
              : "Legal intelligence for law firms"}
          </p>
          <p className="text-xs [color:var(--mk-text-subtle)]">
            {lang === "en"
              ? "EU-hosted or self-hosted · GDPR-ready · confidentiality-first"
              : "EU-gehostet oder self-hosted · DSGVO-konform · vertraulichkeitskritisch"}
          </p>
        </div>
      </div>
    </footer>
  );
}

// --- Gradient transition band between light/dark sections ------------------
// Renders a thin gradient strip that smoothly blends from one tone background
// to another, eliminating hard-cut section boundaries. Agency-standard pattern
// used by Stripe, Linear, Vercel for premium section flow.
export function SectionTransition({
  from = "var(--mk-bg)",
  to = "var(--mk-surface)",
  height = 80,
}: {
  from?: string;
  to?: string;
  height?: number;
}) {
  return (
    <div
      aria-hidden
      className="relative z-10 w-full"
      style={{
        height,
        background: `linear-gradient(to bottom, ${from}, ${to})`,
      }}
    />
  );
}

// --- Shared section primitives -------------------------------------------

export function SectionHeading({
  badge,
  title,
  sub,
  tone,
}: {
  badge?: string;
  title: string;
  sub?: string;
  tone?: Tone;
}) {
  // `tone` is optional: when set it makes the heading self-contained (resolves
  // its own --mk-* tokens), otherwise it inherits the surrounding section tone.
  return (
    <motion.div
      data-tone={tone}
      className="mb-14 text-center"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px 80px 0px", amount: 0.15 }}
      transition={{ duration: 0.55, ease: EASE.out }}
    >
      {badge && (
        <motion.span
          className="brand-soft brand-text brand-border mb-5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold"
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "0px 0px 80px 0px" }}
          transition={{ duration: 0.4, delay: 0.05, ease: EASE.out }}
        >
          <span className="brand-bg h-1.5 w-1.5 rounded-full" />
          {badge}
        </motion.span>
      )}
      <h2 className="mx-auto mb-4 max-w-3xl [font-family:var(--font-display)] text-[1.75rem] leading-[1.12] font-black tracking-[-0.02em] text-balance [color:var(--mk-text)] md:text-4xl">
        {title}
      </h2>
      {sub && (
        <p className="mx-auto max-w-2xl text-base leading-relaxed text-pretty [color:var(--mk-text-muted)] md:text-lg">
          {sub}
        </p>
      )}
    </motion.div>
  );
}

/** Terminal-style demo window with a typewriter answer. */
export function DemoWindow({
  windowTitle,
  you,
  q,
  a,
  sourcesLabel,
  sources,
}: {
  windowTitle: string;
  you: string;
  q: string;
  a: string;
  sourcesLabel: string;
  sources: readonly string[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border [border-color:var(--mk-border)] text-left shadow-2xl shadow-black/20 [background:var(--mk-surface)]">
      <div className="flex items-center gap-2 border-b [border-color:var(--mk-border)] px-4 py-3 [background:var(--mk-bg)]">
        <div className="terminal-dots flex items-center gap-2">
          <span className="terminal-dot-red" />
          <span className="terminal-dot-amber" />
          <span className="terminal-dot-green" />
        </div>
        <div className="ml-4 flex-1 font-mono text-xs [color:var(--mk-text)] opacity-60">
          {windowTitle}
        </div>
      </div>
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--brand-primary)]/20 bg-[var(--brand-primary)]/15">
            <span className="brand-text text-xs font-semibold">{you}</span>
          </div>
          <p className="text-sm [color:var(--mk-text)]">{q}</p>
        </div>
      </div>
      <div className="px-6 pb-6">
        <div className="flex items-start gap-3">
          <SubsumioMark size={28} className="mt-0.5 shrink-0" />
          <div className="flex-1 text-sm leading-relaxed whitespace-pre-line [color:var(--mk-text-muted)]">
            <TypewriterText text={a} speed={8} />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t [border-color:var(--mk-border)] px-4 py-3 [background:var(--mk-bg)] sm:px-6 lg:px-8">
        <span className="text-xs [color:var(--mk-text)] opacity-60">{sourcesLabel}</span>
        {sources.map((slug) => (
          <span key={slug} className="brand-text brand-soft rounded px-2 py-0.5 font-mono text-xs">
            {slug}
          </span>
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
        <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-[var(--brand-text)] align-text-bottom" />
      )}
    </span>
  );
}

/** Renders **bold** spans inside demo answers (simple, no markdown lib). */
export function FaqList({ items }: { items: readonly { q: string; a: string }[] }) {
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {items.map((item) => (
        <details
          key={item.q}
          className="group rounded-xl border [border-color:var(--mk-border)] [background:var(--mk-surface)] open:[border-color:var(--mk-border-strong)]"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-medium [color:var(--mk-text)]">
            {item.q}
            <ChevronDown
              size={15}
              className="ml-4 shrink-0 [color:var(--mk-text-subtle)] transition-transform group-open:rotate-180"
            />
          </summary>
          <p className="px-5 pb-4 text-sm leading-relaxed [color:var(--mk-text-muted)]">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
