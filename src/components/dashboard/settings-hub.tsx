"use client";

import { useState, useEffect } from "react";
import { Search, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useLang } from "@/lib/use-lang";
import type { DashboardKey } from "@/content/dashboard";
import { ALL_NAV_ITEMS, type AudienceTier } from "@/components/dashboard/sidebar";
import type { LucideIcon } from "lucide-react";
import {
  Settings,
  Database,
  Zap,
  Briefcase,
  Users,
  Key,
  Shield,
  Network,
  ShieldCheck,
  Cpu,
  FileCode2,
} from "lucide-react";

type SettingsTile = {
  labelKey: DashboardKey;
  descKey: DashboardKey;
  icon: LucideIcon;
  href: string;
  allowed: string[];
};

type SettingsTileGroup = {
  groupKey: DashboardKey;
  tiles: SettingsTile[];
};

const TILE_GROUPS: SettingsTileGroup[] = [
  {
    groupKey: "settings.group_personal",
    tiles: [
      {
        labelKey: "settings.tab_account",
        descKey: "settings.tile_account_desc",
        icon: Settings,
        href: "/dashboard/settings?tab=account",
        allowed: ["admin", "lawyer", "assistant", "client_viewer"],
      },
    ],
  },
  {
    groupKey: "settings.group_firm",
    tiles: [
      {
        labelKey: "settings.tab_brain",
        descKey: "settings.tile_brain_desc",
        icon: Database,
        href: "/dashboard/settings?tab=brain",
        allowed: ["admin", "lawyer", "assistant"],
      },
      {
        labelKey: "settings.tab_dream",
        descKey: "settings.tile_dream_desc",
        icon: Zap,
        href: "/dashboard/settings?tab=dream",
        allowed: ["admin", "lawyer"],
      },
      {
        labelKey: "settings.tab_kanzlei",
        descKey: "settings.tile_kanzlei_desc",
        icon: Briefcase,
        href: "/dashboard/settings?tab=kanzlei",
        allowed: ["admin", "lawyer", "assistant"],
      },
      {
        labelKey: "settings.tab_e_invoice",
        descKey: "settings.tile_e_invoice_desc",
        icon: FileCode2,
        href: "/dashboard/settings?tab=kanzlei",
        allowed: ["admin", "lawyer", "assistant"],
      },
      {
        labelKey: "settings.tab_team",
        descKey: "settings.tile_team_desc",
        icon: Users,
        href: "/dashboard/settings?tab=team",
        allowed: ["admin"],
      },
    ],
  },
  {
    groupKey: "settings.group_security",
    tiles: [
      {
        labelKey: "settings.tab_api",
        descKey: "settings.tile_api_desc",
        icon: Key,
        href: "/dashboard/settings?tab=api",
        allowed: ["admin"],
      },
      {
        labelKey: "settings.tab_acls",
        descKey: "settings.tile_acls_desc",
        icon: Shield,
        href: "/dashboard/settings?tab=acls",
        allowed: ["admin"],
      },
      {
        labelKey: "settings.tab_scim",
        descKey: "settings.tile_scim_desc",
        icon: Network,
        href: "/dashboard/settings?tab=scim",
        allowed: ["admin"],
      },
      {
        labelKey: "nav.security",
        descKey: "settings.tile_security_desc",
        icon: ShieldCheck,
        href: "/dashboard/settings/security",
        allowed: ["admin", "lawyer", "assistant", "client_viewer"],
      },
      {
        labelKey: "nav.ai_model",
        descKey: "settings.tile_ai_model_desc",
        icon: Cpu,
        href: "/dashboard/settings/ai-model",
        allowed: ["admin"],
      },
    ],
  },
];

const TIER_ORDER: AudienceTier[] = ["quick-start", "erweitert", "dach-integration", "system"];

const TIER_GROUP_KEYS: Record<AudienceTier, DashboardKey> = {
  "quick-start": "settings.tier_quick_start",
  erweitert: "settings.tier_erweitert",
  "dach-integration": "settings.tier_dach_integration",
  system: "settings.tier_system",
};

const SETTINGS_DESC_MAP: Record<string, DashboardKey> = {
  "/dashboard/billing": "settings.tile_billing_desc",
  "/dashboard/team": "settings.tile_team_mgmt_desc",
  "/dashboard/onboarding": "settings.tile_onboarding_desc",
  "/dashboard/api-keys": "settings.tile_api_keys_desc",
  "/dashboard/settings/security": "settings.tile_security_desc_full",
  "/dashboard/directory": "settings.tile_directory_desc",
  "/dashboard/connectors": "settings.tile_connectors_desc",
  "/dashboard/crypto-forensics": "settings.tile_rciid_desc",
  "/dashboard/agents": "settings.tile_agents_desc",
  "/dashboard/settings/scim": "settings.tile_scim_desc_full",
  "/dashboard/monitoring": "settings.tile_monitoring_desc",
  "/dashboard/rag-eval": "settings.tile_rag_eval_desc",
  "/dashboard/chat/analytics": "settings.tile_chat_analytics_desc",
  "/dashboard/chat/compare": "settings.tile_chat_compare_desc",
  "/dashboard/reports": "settings.tile_reports_desc",
  "/dashboard/adoption-analytics": "settings.tile_adoption_analytics_desc",
  "/dashboard/shared-spaces": "settings.tile_shared_spaces_desc",
  "/dashboard/mobile": "settings.tile_mobile_desc",
  "/dashboard/experience": "settings.tile_experience_desc",
  "/dashboard/portfolio-insights": "settings.tile_portfolio_insights_desc",
  "/dashboard/process-strategy": "settings.tile_process_strategy_desc",
  "/dashboard/client-portal": "settings.tile_client_portal_desc",
  "/dashboard/version-history": "settings.tile_version_history_desc",
  "/dashboard/signature": "settings.tile_signature_desc",
  "/dashboard/vault": "settings.tile_vault_desc",
  "/dashboard/cost-calculator": "settings.tile_cost_calculator_desc",
  "/dashboard/settings/kanzlei": "settings.tile_kanzlei_settings_desc",
  "/dashboard/datev-export": "settings.tile_datev_export_desc",
  "/dashboard/bea": "settings.tile_bea_desc",
  "/dashboard/word-addin": "settings.tile_word_addin_desc",
  "/dashboard/compliance": "settings.tile_compliance_desc",
  "/dashboard/compliance/retention": "settings.tile_retention_desc",
  "/dashboard/anonymize": "settings.tile_anonymize_desc",
  "/dashboard/verfahrensdoku": "settings.tile_verfahrensdoku_desc",
  "/dashboard/data-export": "settings.tile_data_export_desc",
  "/dashboard/import-kanzlei": "settings.tile_import_kanzlei_desc",
  "/dashboard/whatsapp/templates": "settings.tile_whatsapp_templates_desc",
  "/dashboard/calendar-export": "settings.tile_calendar_export_desc",
  "/dashboard/judgements-sync": "settings.tile_judgements_sync_desc",
  "/dashboard/opponents": "settings.tile_opponents_desc",
  "/dashboard/audit": "settings.tile_audit_desc",
  "/dashboard/settings/ai-model": "settings.tile_ai_model_desc_full",
};

const ROLE_ALLOWED: Record<string, string[]> = {
  "/dashboard/billing": ["admin", "lawyer"],
  "/dashboard/team": ["admin"],
  "/dashboard/api-keys": ["admin"],
  "/dashboard/settings/kanzlei": ["admin", "lawyer"],
  "/dashboard/settings/scim": ["admin"],
  "/dashboard/settings/ai-model": ["admin"],
  "/dashboard/import-kanzlei": ["admin"],
  "/dashboard/audit": ["admin"],
  "/dashboard/rag-eval": ["admin"],
  "/dashboard/connectors": ["admin"],
  "/dashboard/agents": ["admin", "lawyer"],
  "/dashboard/monitoring": ["admin"],
  "/dashboard/adoption-analytics": ["admin"],
};

interface NotifHealth {
  channels: Array<{ channel: string; configured: boolean; detail?: string }>;
  all_configured: boolean;
  any_configured: boolean;
}

export function SettingsHub({ userRole }: { userRole: string }) {
  const { t } = useLang();
  const [search, setSearch] = useState("");
  const [notifHealth, setNotifHealth] = useState<NotifHealth | null>(null);

  useEffect(() => {
    fetch("/api/notifications/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.data) setNotifHealth(data.data as NotifHealth);
      })
      .catch(() => {});
  }, []);

  const kanzleiWarning = notifHealth && !notifHealth.all_configured;

  const hubItems = ALL_NAV_ITEMS.filter((item) => item.audienceTier);

  const roleVisible = hubItems.filter((item) => {
    const allowed = ROLE_ALLOWED[item.href];
    if (!allowed) return true;
    return allowed.includes(userRole);
  });

  const searchLower = search.toLowerCase().trim();
  const filtered = searchLower
    ? roleVisible.filter((item) => {
        const label = t(item.labelKey).toLowerCase();
        const keywords = (item.keywords ?? "").toLowerCase();
        return label.includes(searchLower) || keywords.includes(searchLower);
      })
    : roleVisible;

  const grouped = TIER_ORDER.map((tier) => ({
    tier,
    items: filtered.filter((item) => item.audienceTier === tier),
  })).filter((g) => g.items.length > 0);

  const existingTiles = TILE_GROUPS.flatMap((g) => g.tiles).filter((tile) =>
    tile.allowed.includes(userRole)
  );

  const hasNoResults = grouped.length === 0 && searchLower;

  return (
    <div className="space-y-8">
      <div className="relative max-w-md">
        <Search
          size={16}
          className="absolute top-1/2 left-3 -translate-y-1/2 text-[color:var(--ds-text-muted)]"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("settings.hub_search_placeholder")}
          className="w-full rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] py-2.5 pr-3 pl-9 text-sm text-[color:var(--ds-text)] transition-colors placeholder:text-[color:var(--ds-text-muted)] focus:border-[color:var(--brand-primary)] focus:outline-none"
        />
      </div>

      {hasNoResults && (
        <p className="py-8 text-center text-sm text-[color:var(--ds-text-muted)]">
          {t("settings.hub_no_results")}
        </p>
      )}

      {grouped.map(({ tier, items }) => (
        <div key={tier} className="space-y-3">
          <h2 className="text-xs font-semibold tracking-wider text-[color:var(--ds-text-subtle)] uppercase">
            {t(TIER_GROUP_KEYS[tier])}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tier === "quick-start" &&
              !searchLower &&
              existingTiles.map((tile) => {
                const Icon = tile.icon;
                return (
                  <Link
                    key={tile.labelKey}
                    href={tile.href}
                    className="group flex items-start gap-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-[border-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-[color:var(--ds-border-hover)] hover:shadow-md focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none"
                  >
                    <div className="group-hover:brand-soft group-hover:brand-border flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] transition-[border-color,background-color] duration-200">
                      <Icon
                        size={18}
                        className="group-hover:brand-text text-[color:var(--ds-text-muted)] transition-colors duration-200"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-[color:var(--ds-text)]">
                          {t(tile.labelKey)}
                        </p>
                        {kanzleiWarning && tile.href === "/dashboard/settings?tab=kanzlei" && (
                          <span
                            title={t("settings.notification_warning_tooltip")}
                            className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400"
                          >
                            <AlertCircle size={10} />
                            {t("settings.notification_warning_label")}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                        {t(tile.descKey)}
                      </p>
                    </div>
                  </Link>
                );
              })}
            {items.map((item) => {
              const Icon = item.icon;
              const descKey = SETTINGS_DESC_MAP[item.href];
              return (
                <Link
                  key={item.href + "-" + (item.labelKey || "")}
                  href={item.href}
                  className="group flex items-start gap-4 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4 transition-[border-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-[color:var(--ds-border-hover)] hover:shadow-md focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-surface)] focus-visible:outline-none"
                >
                  <div className="group-hover:brand-soft group-hover:brand-border flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface-2)] transition-[border-color,background-color] duration-200">
                    <Icon
                      size={18}
                      className="group-hover:brand-text text-[color:var(--ds-text-muted)] transition-colors duration-200"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[color:var(--ds-text)]">
                      {t(item.labelKey)}
                    </p>
                    {descKey && (
                      <p className="mt-1 text-xs leading-relaxed text-[color:var(--ds-text-muted)]">
                        {t(descKey)}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
