"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Users, Award, Scale, Briefcase, Languages } from "lucide-react";
import { useLang } from "@/lib/use-lang";

interface PracticeAreaInfo {
  area: string;
  label: string;
  level: "beginner" | "intermediate" | "advanced" | "expert";
  level_label: string;
  years?: number;
  matter_count?: number;
  verified: boolean;
}

interface SanitizedProfile {
  user_id: string;
  display_name: string;
  org_role: string;
  is_lawyer: boolean;
  practice_areas: PracticeAreaInfo[];
  languages: string[];
  qualifications: string[];
  active_matter_count: number;
  endorsement_count: number;
}

interface WhoKnowsResult {
  user_id: string;
  display_name: string;
  org_role: string;
  is_lawyer: boolean;
  practice_area: PracticeAreaInfo | null;
  matching_skills: string[];
  matter_count_in_area: number;
  endorsement_count: number;
  active_matters: number;
}

interface LayerSummary {
  total_profiles: number;
  visible_profiles: number;
  by_role: Record<string, number>;
  by_practice_area: Record<string, number>;
  by_level: Record<string, number>;
  total_endorsements: number;
  total_active_matters: number;
  languages_represented: string[];
}

const LEVEL_COLORS: Record<string, string> = {
  beginner: "bg-gray-100 text-gray-700",
  intermediate: "bg-blue-100 text-blue-700",
  advanced: "bg-purple-100 text-purple-700",
  expert: "bg-amber-100 text-amber-700",
};

const PRACTICE_AREAS = [
  { value: "litigation", labelKey: "experience.pa_litigation" },
  { value: "contract", labelKey: "experience.pa_contract" },
  { value: "tax", labelKey: "experience.pa_tax" },
  { value: "corporate", labelKey: "experience.pa_corporate" },
  { value: "employment", labelKey: "experience.pa_employment" },
  { value: "ip", labelKey: "experience.pa_ip" },
  { value: "compliance", labelKey: "experience.pa_compliance" },
  { value: "family", labelKey: "experience.pa_family" },
  { value: "criminal", labelKey: "experience.pa_criminal" },
  { value: "real_estate", labelKey: "experience.pa_real_estate" },
] as const;

export default function ExperiencePage() {
  const { t } = useLang();
  const [tab, setTab] = useState<"who_knows" | "directory" | "summary">("who_knows");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Who knows query state
  const [practiceArea, setPracticeArea] = useState<string>("");
  const [minLevel, setMinLevel] = useState<string>("");
  const [includeExternal, setIncludeExternal] = useState(false);
  const [language, setLanguage] = useState<string>("");
  const [whoKnowsResults, setWhoKnowsResults] = useState<WhoKnowsResult[]>([]);

  // Directory state
  const [profiles, setProfiles] = useState<SanitizedProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Summary state
  const [summary, setSummary] = useState<LayerSummary | null>(null);

  const fetchWhoKnows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ action: "who_knows" });
      if (practiceArea) params.set("practice_area", practiceArea);
      if (minLevel) params.set("min_level", minLevel);
      if (includeExternal) params.set("include_external", "true");
      if (language) params.set("language", language);
      const res = await fetch(`/api/experience?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setWhoKnowsResults(data.data?.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("experience.error_save"));
    } finally {
      setLoading(false);
    }
  }, [practiceArea, minLevel, includeExternal, language]);

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/experience?action=list");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProfiles(data.data?.profiles || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("experience.error_save"));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/experience?action=summary");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSummary(data.data || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("experience.error_save"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "who_knows") fetchWhoKnows();
    else if (tab === "directory") fetchProfiles();
    else if (tab === "summary") fetchSummary();
  }, [tab, fetchWhoKnows, fetchProfiles, fetchSummary]);

  const filteredProfiles = profiles.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.display_name.toLowerCase().includes(q) ||
      p.org_role.toLowerCase().includes(q) ||
      p.practice_areas.some((pa) => pa.label.toLowerCase().includes(q)) ||
      p.qualifications.some((qual) => qual.toLowerCase().includes(q))
    );
  });

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("experience.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("experience.description")}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <TabButton
          active={tab === "who_knows"}
          onClick={() => setTab("who_knows")}
          icon={<Search className="h-4 w-4" />}
        >
          {t("experience.tab_whoknows")}
        </TabButton>
        <TabButton
          active={tab === "directory"}
          onClick={() => setTab("directory")}
          icon={<Users className="h-4 w-4" />}
        >
          {t("experience.tab_directory")}
        </TabButton>
        <TabButton
          active={tab === "summary"}
          onClick={() => setTab("summary")}
          icon={<Scale className="h-4 w-4" />}
        >
          {t("experience.tab_summary")}
        </TabButton>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive rounded-md p-3 text-sm">{error}</div>
      )}

      {/* Who Knows Tab */}
      {tab === "who_knows" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("experience.card_search")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {t("experience.label_practice_area")}
                  </label>
                  <Select value={practiceArea} onValueChange={setPracticeArea}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("experience.placeholder_all_areas")} />
                    </SelectTrigger>
                    <SelectContent>
                      {PRACTICE_AREAS.map((pa) => (
                        <SelectItem key={pa.value} value={pa.value}>
                          {t(pa.labelKey)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("experience.label_min_level")}</label>
                  <Select value={minLevel} onValueChange={setMinLevel}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("experience.placeholder_all_levels")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="beginner">{t("experience.level_beginner")}</SelectItem>
                      <SelectItem value="intermediate">
                        {t("experience.level_intermediate")}
                      </SelectItem>
                      <SelectItem value="advanced">{t("experience.level_advanced")}</SelectItem>
                      <SelectItem value="expert">{t("experience.level_expert")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("experience.label_language")}</label>
                  <Input
                    placeholder={t("experience.placeholder_language")}
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={includeExternal}
                    onChange={(e) => setIncludeExternal(e.target.checked)}
                    className="rounded"
                  />
                  {t("experience.label_include_external")}
                </label>
                <Button onClick={fetchWhoKnows} disabled={loading} size="sm">
                  <Search className="mr-2 h-4 w-4" />
                  {t("experience.btn_search")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="text-muted-foreground py-8 text-center">
              {t("experience.loading_results")}
            </div>
          ) : whoKnowsResults.length === 0 ? (
            <Card>
              <CardContent className="text-muted-foreground py-8 text-center">
                {t("experience.empty_results")}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {whoKnowsResults.map((result) => (
                <Card key={result.user_id} className="transition-shadow hover:shadow-md">
                  <CardContent className="flex items-start justify-between py-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{result.display_name}</span>
                        <Badge variant="default" className="text-xs">
                          {result.org_role}
                        </Badge>
                        {result.is_lawyer && (
                          <Badge className="text-xs">{t("experience.badge_lawyer")}</Badge>
                        )}
                      </div>
                      {result.practice_area && (
                        <div className="flex items-center gap-2">
                          <Badge className={`text-xs ${LEVEL_COLORS[result.practice_area.level]}`}>
                            {result.practice_area.level_label}
                          </Badge>
                          <span className="text-muted-foreground text-sm">
                            {result.practice_area.label}
                          </span>
                        </div>
                      )}
                      {result.matching_skills.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {result.matching_skills.map((skill) => (
                            <Badge key={skill} variant="accent" className="text-xs">
                              <Award className="mr-1 h-3 w-3" />
                              {skill}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-muted-foreground flex gap-4 text-right text-sm">
                      <div>
                        <div className="font-semibold">{result.active_matters}</div>
                        <div className="text-xs">{t("experience.stat_active_matters")}</div>
                      </div>
                      <div>
                        <div className="font-semibold">{result.matter_count_in_area}</div>
                        <div className="text-xs">{t("experience.stat_in_area")}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Directory Tab */}
      {tab === "directory" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Input
              placeholder={t("experience.placeholder_search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-md"
            />
          </div>

          {loading ? (
            <div className="text-muted-foreground py-8 text-center">
              {t("experience.loading_profiles")}
            </div>
          ) : filteredProfiles.length === 0 ? (
            <Card>
              <CardContent className="text-muted-foreground py-8 text-center">
                {t("experience.empty_profiles")}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {filteredProfiles.map((profile) => (
                <Card key={profile.user_id} className="transition-shadow hover:shadow-md">
                  <CardContent className="space-y-3 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{profile.display_name}</span>
                        {profile.is_lawyer && <Badge className="text-xs">RA</Badge>}
                      </div>
                      <Badge variant="default" className="text-xs">
                        {profile.org_role}
                      </Badge>
                    </div>
                    {profile.practice_areas.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {profile.practice_areas.map((pa) => (
                          <Badge key={pa.area} className={`text-xs ${LEVEL_COLORS[pa.level]}`}>
                            {pa.label} · {pa.level_label}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
                      {profile.qualifications.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Briefcase className="h-3 w-3" />
                          {profile.qualifications.join(", ")}
                        </span>
                      )}
                      {profile.languages.length > 0 && (
                        <span className="flex items-center gap-1">
                          <Languages className="h-3 w-3" />
                          {profile.languages.join(", ")}
                        </span>
                      )}
                      <span>
                        {profile.active_matter_count} {t("experience.active_matters_suffix")}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Summary Tab */}
      {tab === "summary" && (
        <div className="space-y-4">
          {loading ? (
            <div className="text-muted-foreground py-8 text-center">
              {t("experience.loading_summary")}
            </div>
          ) : summary ? (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <StatCard label={t("experience.stat_visible")} value={summary.visible_profiles} />
                <StatCard
                  label={t("experience.stat_active")}
                  value={summary.total_active_matters}
                />
                <StatCard
                  label={t("experience.stat_endorsements")}
                  value={summary.total_endorsements}
                />
                <StatCard
                  label={t("experience.stat_languages")}
                  value={summary.languages_represented.length}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("experience.card_by_area")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {Object.entries(summary.by_practice_area).map(([area, count]) => (
                      <div key={area} className="flex justify-between text-sm">
                        <span>
                          {PRACTICE_AREAS.find((pa) => pa.value === area)?.labelKey
                            ? t(PRACTICE_AREAS.find((pa) => pa.value === area)!.labelKey)
                            : area}
                        </span>
                        <span className="font-semibold">{count}</span>
                      </div>
                    ))}
                    {Object.keys(summary.by_practice_area).length === 0 && (
                      <div className="text-muted-foreground text-sm">
                        {t("experience.empty_data")}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{t("experience.card_by_role")}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {Object.entries(summary.by_role).map(([role, count]) => (
                      <div key={role} className="flex justify-between text-sm">
                        <span>{role}</span>
                        <span className="font-semibold">{count}</span>
                      </div>
                    ))}
                    {Object.keys(summary.by_role).length === 0 && (
                      <div className="text-muted-foreground text-sm">
                        {t("experience.empty_data")}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("experience.card_level_dist")}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                  {Object.entries(summary.by_level).map(([level, count]) => (
                    <Badge key={level} className={LEVEL_COLORS[level] || ""}>
                      {level}: {count}
                    </Badge>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("experience.card_languages")}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {summary.languages_represented.map((lang) => (
                    <Badge key={lang} variant="default">
                      {lang}
                    </Badge>
                  ))}
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="text-muted-foreground py-8 text-center">
              {t("experience.empty_data")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-primary text-primary"
          : "text-muted-foreground hover:text-foreground border-transparent"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="py-4 text-center">
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-muted-foreground text-sm">{label}</div>
      </CardContent>
    </Card>
  );
}
