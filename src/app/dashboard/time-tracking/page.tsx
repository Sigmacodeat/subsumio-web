"use client";

import { useMemo, useState } from "react";
import {
  Clock,
  Plus,
  Briefcase,
  Loader2,
  Receipt,
  CheckCircle2,
  CalendarClock,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useLang } from "@/lib/use-lang";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ACTIVITIES = ["research", "drafting", "court", "meeting", "other"] as const;

export default function TimeTrackingPage() {
  const t = useLang().t;
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [minutes, setMinutes] = useState("");
  const [caseSlug, setCaseSlug] = useState("");
  const [rate, setRate] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [activity, setActivity] = useState<string>("other");

  const { data, isLoading } = useQuery({
    queryKey: ["time-tracking"],
    queryFn: () => api.time.list({ limit: 200 }),
  });

  const { data: cases = [] } = useQuery({
    queryKey: ["time-tracking-cases"],
    queryFn: () => api.cases.list({ limit: 100 }),
  });

  const createMutation = useMutation({
    mutationFn: api.time.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-tracking"] });
      setOpen(false);
      resetForm();
      addToast({ title: t("time_tracking.saved"), type: "success" });
    },
    onError: () => {
      addToast({ title: t("time_tracking.save_failed"), type: "error" });
    },
  });

  const resetForm = () => {
    setDescription("");
    setMinutes("");
    setCaseSlug("");
    setRate("");
    setDate(new Date().toISOString().split("T")[0]);
    setActivity("other");
  };

  const handleSave = () => {
    if (!description || !minutes || !caseSlug) return;
    createMutation.mutate({
      case_slug: caseSlug,
      description,
      minutes: parseInt(minutes, 10),
      date,
      rate: rate ? parseFloat(rate) : undefined,
      activity_type: activity as "research" | "drafting" | "court" | "meeting" | "other",
      billable: true,
    });
  };

  const entries = data?.entries ?? [];
  const summary = data?.summary;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={t("time_tracking.title")}
        description={t("time_tracking.description")}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} className="mr-1.5" />
            {t("time_tracking.add")}
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-center text-[color:var(--ds-text-muted)]">
            <Clock size={40} className="mb-3 opacity-40" />
            <p className="font-medium text-[color:var(--ds-text)]">
              {t("time_tracking.empty_title")}
            </p>
            <p className="text-sm">{t("time_tracking.empty_desc")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {summary && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <SummaryCard
                  icon={<Clock size={18} />}
                  label={t("time_tracking.total_hours")}
                  value={summary.total_hours.toFixed(2)}
                />
                <SummaryCard
                  icon={<Receipt size={18} />}
                  label={t("time_tracking.total_amount")}
                  value={summary.billable_amount.toFixed(2)}
                />
                <SummaryCard
                  icon={<CheckCircle2 size={18} />}
                  label={t("time_tracking.unbilled")}
                  value={entries.filter((e) => !e.billed).length.toString()}
                />
              </div>
            )}

            <div className="space-y-2">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[color:var(--ds-surface-2)]">
                    <Clock size={16} className="text-[color:var(--brand-primary)]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[color:var(--ds-text)]">
                      {entry.description}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-[color:var(--ds-text-subtle)]">
                      <span className="inline-flex items-center gap-1">
                        <Briefcase size={11} />
                        <span className="max-w-[180px] truncate">
                          {entry.case_title || entry.case_slug || t("time_tracking.case")}
                        </span>
                      </span>
                      <span className="h-3 w-px bg-[color:var(--ds-border)]" />
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock size={11} />
                        {formatDate(entry.date)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[color:var(--ds-text)] tabular-nums">
                      {(entry.minutes / 60).toFixed(2)} h
                    </span>
                    {entry.billed ? (
                      <Badge variant="success">{t("time_tracking.billed")}</Badge>
                    ) : (
                      <Badge variant="accent">{t("time_tracking.unbilled")}</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("time_tracking.add")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>{t("time_tracking.description_label")}</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("time_tracking.description_label")}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>{t("time_tracking.minutes")}</Label>
                <Input
                  type="number"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  placeholder="60"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{t("time_tracking.date")}</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>{t("time_tracking.case")}</Label>
              <Select value={caseSlug} onValueChange={setCaseSlug}>
                <SelectTrigger>
                  <SelectValue placeholder={t("time_tracking.case")} />
                </SelectTrigger>
                <SelectContent>
                  {cases.map((c) => (
                    <SelectItem key={c.slug} value={c.slug}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>{t("time_tracking.activity")}</Label>
                <Select value={activity} onValueChange={setActivity}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTIVITIES.map((a) => (
                      <SelectItem key={a} value={a}>
                        {t(`time_tracking.${a}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>{t("time_tracking.rate")}</Label>
                <Input
                  type="number"
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  placeholder="250"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("time_tracking.cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || !description || !minutes || !caseSlug}
            >
              {createMutation.isPending ? (
                <Loader2 className="mr-1.5 animate-spin" size={16} />
              ) : null}
              {t("time_tracking.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[color:var(--ds-surface-2)] text-[color:var(--brand-primary)]">
        {icon}
      </div>
      <div>
        <p className="text-xs text-[color:var(--ds-text-subtle)]">{label}</p>
        <p className="text-lg font-semibold text-[color:var(--ds-text)] tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
  });
}
