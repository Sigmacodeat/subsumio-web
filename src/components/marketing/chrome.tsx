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
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EASE } from "./motion-system";
import { SubsumioLogo, SubsumioMark } from "@/components/brand/subsumio-logo";
import { NAV, FOOTER, p, altPath, UI_STRINGS, type Lang } from "@/content/site";

/** Persist the user's explicit language choice so the browser-language redirect doesn't override it. */
function setLangPref(lang: "en" | "de") {
  document.cookie = `sb_lang=${lang};path=/;max-age=${365 * 24 * 3600};samesite=lax`;
}
import { type SiteBrand } from "@/lib/brand";

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
  "[color:var(--mk-text-muted)] hover:[color:var(--brand-primary)] hover:[background:var(--mk-hover)]";
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

export function MarketingNav({ lang }: { lang: Lang }) {
  const nav = NAV[lang];
  const pathname = usePathname() || "/";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [openSection, setOpenSection] = useState<number | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState<number | null>(null);
  const reduceMotion = useReducedMotion();
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const firstMobileLinkRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActive = (href: string) => pathname === p(lang, href) || pathname === href;

  const isSectionActive = (sectionIdx: number) => {
    return nav.sections[sectionIdx].items.some((item) => isActive(item.href));
  };

  // Scroll detection — backdrop blur after 8px.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mobile menu + mega dropdown on route change.
  useEffect(() => {
    setMobileOpen(false);
    setOpenSection(null);
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
    <header
      data-tone="light"
      className={`sticky top-0 z-50 border-b transition-[background,box-shadow,border-color] duration-300 ${
        scrolled
          ? "[border-color:var(--mk-border)] shadow-[0_1px_0_rgba(0,0,0,0.06),0_2px_12px_rgba(0,0,0,0.04)] backdrop-blur-xl"
          : "[border-color:transparent]"
      }`}
      style={{
        background: scrolled ? "color-mix(in srgb, var(--mk-bg) 92%, transparent)" : "var(--mk-bg)",
      }}
    >
      <nav ref={navRef} className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <Link href={p(lang, "")} aria-label="Subsumio home" className="shrink-0">
            <BrandLogo />
          </Link>

          {/* Desktop nav — mega dropdown sections */}
          <div className="hidden items-center gap-1 lg:flex">
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
                    className={`flex items-center gap-1 rounded-lg px-3 py-2 text-sm transition-all duration-200 ${NAV_LINK_BORDER} ${NAV_LINK_FOCUS} ${
                      sectionActive || isOpen
                        ? "font-medium [color:var(--brand-text)]"
                        : NAV_LINK_INACTIVE
                    }`}
                    onClick={() => setOpenSection(isOpen ? null : sIdx)}
                    aria-expanded={isOpen}
                    aria-haspopup="true"
                  >
                    {section.label}
                    <ChevronDown
                      size={14}
                      className={`shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8 }}
                        animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                        transition={
                          reduceMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }
                        }
                        className="absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2"
                        style={{ minWidth: section.items.length > 4 ? "560px" : "320px" }}
                      >
                        {/* Arrow pointer */}
                        <div className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-t border-l [border-color:var(--mk-border)] [background:var(--mk-surface)]" />
                        <div
                          className="overflow-hidden rounded-2xl border [border-color:var(--mk-border)] shadow-2xl shadow-black/10 backdrop-blur-xl [background:var(--mk-surface)]"
                          style={{
                            background: "color-mix(in srgb, var(--mk-surface) 96%, transparent)",
                          }}
                        >
                          <div
                            className={
                              section.items.length > 4 ? "grid grid-cols-2 gap-1 p-3" : "p-3"
                            }
                          >
                            {section.items.map((item) => {
                              const active = isActive(item.href);
                              const Icon = ICONS[item.icon] ?? Layers;
                              return (
                                <Link
                                  key={item.href + item.label}
                                  href={p(lang, item.href)}
                                  onClick={() => setOpenSection(null)}
                                  className={`group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-all duration-150 ${NAV_LINK_FOCUS} ${
                                    active
                                      ? "[background:color-mix(in_srgb,var(--brand-primary)_8%,var(--mk-hover))]"
                                      : "hover:[background:var(--mk-hover)]"
                                  }`}
                                >
                                  <div className="group-hover:brand-soft group-hover:brand-border flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border [border-color:var(--mk-border)] transition-colors [background:var(--mk-bg)]">
                                    <Icon
                                      size={16}
                                      className="group-hover:brand-text [color:var(--mk-text-muted)]"
                                    />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div
                                      className={`text-sm font-medium ${active ? "brand-text" : "[color:var(--mk-text)]"}`}
                                    >
                                      {item.label}
                                    </div>
                                    <div className="mt-0.5 text-xs leading-snug [color:var(--mk-text-subtle)]">
                                      {item.description}
                                    </div>
                                  </div>
                                </Link>
                              );
                            })}
                          </div>
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
          <div className="flex items-center gap-2">
            <Link
              href={altPath(lang, pathname)}
              onClick={() => setLangPref(lang === "en" ? "de" : "en")}
              className="hidden min-h-[44px] items-center gap-1.5 rounded-full px-3 py-1.5 text-xs [color:var(--mk-text-muted)] transition-colors duration-200 [background:var(--mk-surface)] hover:[color:var(--mk-text)] hover:[background:var(--mk-hover)] lg:flex"
              aria-label={
                lang === "en" ? UI_STRINGS[lang].readInGerman : UI_STRINGS[lang].readInEnglish
              }
            >
              <Globe size={12} /> {lang.toUpperCase()}
            </Link>
            <Link href={p(lang, "/login")} className="hidden lg:block">
              <Button variant="ghost" size="sm" className="[color:var(--mk-text)]">
                {nav.signIn}
              </Button>
            </Link>
            <Link href={p(lang, "/signup")}>
              <Button size="sm" variant="glow" className="group min-h-[44px]">
                {nav.cta}
                <ChevronRight
                  size={14}
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

        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              ref={mobileMenuRef}
              id="mobile-nav-menu"
              role="navigation"
              aria-label="Mobile navigation"
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, height: 0 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, height: "auto" }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden lg:hidden"
            >
              <div className="mt-3 space-y-1 rounded-2xl p-3 shadow-2xl shadow-black/10 [background:var(--mk-bg)]">
                {/* Expandable sections */}
                {nav.sections.map((section, sIdx) => {
                  const expanded = mobileExpanded === sIdx;
                  const sectionActive = isSectionActive(sIdx);
                  return (
                    <div key={section.label}>
                      <button
                        ref={sIdx === 0 ? firstMobileLinkRef : undefined}
                        className={`flex min-h-[44px] w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${NAV_LINK_FOCUS} ${
                          sectionActive ? "brand-text" : "[color:var(--mk-text)]"
                        } hover:[background:var(--mk-hover)]`}
                        onClick={() => setMobileExpanded(expanded ? null : sIdx)}
                        aria-expanded={expanded}
                      >
                        {section.label}
                        <ChevronDown
                          size={15}
                          className={`shrink-0 transition-transform duration-200 ${expanded ? "rotate-180" : ""} [color:var(--mk-text-subtle)]`}
                        />
                      </button>
                      <AnimatePresence>
                        {expanded && (
                          <motion.div
                            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, height: 0 }}
                            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, height: "auto" }}
                            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                            transition={
                              reduceMotion ? { duration: 0 } : { duration: 0.15, ease: "easeInOut" }
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
                                        size={14}
                                        className="shrink-0 [color:var(--mk-text-subtle)]"
                                      />
                                      <span className="flex flex-col">
                                        <span>{item.label}</span>
                                        <span className="text-xs [color:var(--mk-text-subtle)]">
                                          {item.description}
                                        </span>
                                      </span>
                                    </span>
                                  </Link>
                                );
                              })}
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

                {/* Language switcher + Sign-in — always visible in mobile menu */}
                <div className="mt-2 space-y-0.5 border-t [border-color:var(--mk-border)] pt-2">
                  <Link
                    href={altPath(lang, pathname)}
                    className={mobileLinkCls(false)}
                    onClick={() => {
                      setMobileOpen(false);
                      setLangPref(lang === "en" ? "de" : "en");
                    }}
                  >
                    <span className="flex items-center gap-1.5">
                      <Globe size={13} />{" "}
                      {lang === "en"
                        ? UI_STRINGS[lang].readInGerman
                        : UI_STRINGS[lang].readInEnglish}
                    </span>
                  </Link>
                  <Link
                    href={p(lang, "/login")}
                    className={mobileLinkCls(false)}
                    onClick={() => setMobileOpen(false)}
                  >
                    {nav.signIn}
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </header>
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
              {lang === "de"
                ? "Das Brain deiner Kanzlei — für AT, DE und CH."
                : "The memory layer for your law firm — built for AT, DE and CH."}
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
                      // niemals den Sprachpräfix anhängen (/de/dashboard = 404).
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
            {lang === "de"
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
          <span className="brand-bg badge-pulse h-1.5 w-1.5 rounded-full" />
          {badge}
        </motion.span>
      )}
      <h2 className="mb-4 text-3xl font-black tracking-tight [color:var(--mk-text)] md:text-4xl">
        {title}
      </h2>
      {sub && (
        <p className="mx-auto max-w-2xl text-lg leading-relaxed [color:var(--mk-text-muted)]">
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
