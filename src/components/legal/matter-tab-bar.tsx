"use client";

/**
 * MatterTabBar — URL-based tab navigation for matter sub-pages.
 * Primary tabs (5) always visible, secondary tabs (4) in overflow "More" menu.
 * Follows Miller's Law (7±2 items) by splitting into two groups.
 */

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import {
  FileText,
  FolderOpen,
  CalendarClock,
  Lightbulb,
  Activity,
  ShieldAlert,
  CircleDollarSign,
  Users,
  MoreHorizontal,
  StickyNote,
  Phone,
  Scale,
  Mail,
} from "lucide-react";
import {
  useMatterData,
  matterTabUrl,
  PRIMARY_TABS,
  SECONDARY_TABS,
  type MatterTab,
} from "@/lib/matter-data-context";
import { useLang } from "@/lib/use-lang";
import { cn } from "@/lib/utils";

const TAB_ICONS: Record<MatterTab, typeof FileText> = {
  overview: FileText,
  documents: FolderOpen,
  deadlines: CalendarClock,
  strategy: Lightbulb,
  activity: Activity,
  evidence: ShieldAlert,
  billing: CircleDollarSign,
  contacts: Users,
  notes: StickyNote,
  "phone-notes": Phone,
  emails: Mail,
  investigation: Scale,
};

const TAB_LABELS_DE: Record<MatterTab, string> = {
  overview: "Übersicht",
  documents: "Dokumente",
  deadlines: "Fristen & Aufgaben",
  strategy: "Strategie",
  activity: "Aktivität",
  evidence: "Beweise",
  billing: "Kosten",
  contacts: "Beteiligte",
  notes: "Notizen",
  "phone-notes": "Telefon",
  emails: "E-Mails",
  investigation: "Sachverhalt",
};

const TAB_LABELS_EN: Record<MatterTab, string> = {
  overview: "Overview",
  documents: "Documents",
  deadlines: "Deadlines & tasks",
  strategy: "Strategy",
  activity: "Activity",
  evidence: "Evidence",
  billing: "Billing",
  contacts: "Parties",
  notes: "Notes",
  "phone-notes": "Phone",
  emails: "E-mails",
  investigation: "Investigation",
};

export function MatterTabBar() {
  const { activeTab, caseSlug } = useMatterData();
  const { t, lang } = useLang();
  const [moreOpen, setMoreOpen] = useState(false);
  const labels = lang === "en" ? TAB_LABELS_EN : TAB_LABELS_DE;
  const moreRef = useRef<HTMLDivElement>(null);

  // Close "More" menu on outside click
  useEffect(() => {
    if (!moreOpen) return;
    const handler = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [moreOpen]);

  const isActive = (tab: MatterTab) => activeTab === tab;
  const isSecondaryActive = SECONDARY_TABS.includes(activeTab);

  return (
    <div className="sticky top-[var(--matter-header-height,0px)] z-20 flex items-center gap-1 border-b border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] px-2 py-1.5 md:px-4">
      {/* Primary tabs */}
      {PRIMARY_TABS.map((tab) => {
        const Icon = TAB_ICONS[tab];
        const active = isActive(tab);
        return (
          <Link
            key={tab}
            href={matterTabUrl(caseSlug, tab)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap transition-[background-color,border-color,color] motion-reduce:transition-none md:text-sm",
              active
                ? "bg-[color:var(--ds-hover)] text-[color:var(--ds-text)]"
                : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
            )}
            onClick={() => setMoreOpen(false)}
          >
            <Icon size={14} className="shrink-0" aria-hidden="true" />
            <span className={cn(active ? "inline" : "hidden", "sm:inline")}>{labels[tab]}</span>
          </Link>
        );
      })}

      {/* Secondary tabs in "More" dropdown */}
      <div className="relative ml-auto" ref={moreRef}>
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          aria-haspopup="menu"
          aria-label={t("mattertab.more")}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-[background-color,border-color,color] focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)] focus-visible:outline-none active:scale-[0.97] motion-reduce:transition-none md:text-sm",
            isSecondaryActive || moreOpen
              ? "bg-[color:var(--ds-hover)] text-[color:var(--ds-text)]"
              : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
          )}
        >
          <MoreHorizontal size={14} className="shrink-0" />
          <span className="hidden sm:inline">
            {isSecondaryActive ? labels[activeTab] : t("mattertab.more")}
          </span>
        </button>
        {moreOpen && (
          <div className="absolute top-full right-0 mt-1 min-w-[160px] rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-1 shadow-[var(--ds-shadow-2)]">
            {SECONDARY_TABS.map((tab) => {
              const Icon = TAB_ICONS[tab];
              const active = isActive(tab);
              return (
                <Link
                  key={tab}
                  href={matterTabUrl(caseSlug, tab)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 text-xs font-medium transition-[background-color,border-color,color] motion-reduce:transition-none md:text-sm",
                    active
                      ? "bg-[color:var(--ds-hover)] text-[color:var(--ds-text)]"
                      : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                  )}
                  onClick={() => setMoreOpen(false)}
                >
                  <Icon size={14} className="shrink-0" />
                  {labels[tab]}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
