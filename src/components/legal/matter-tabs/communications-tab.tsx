"use client";

import { useState, useMemo } from "react";
import {
  Mail,
  FileText,
  Send,
  MessageSquare,
  Phone,
  Clock,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLang } from "@/lib/use-lang";
import { useMatterDetail } from "@/lib/matter-detail-context";
import { EmailComposeDialog } from "@/components/legal/EmailComposeDialog";
import { DocuSignSendDialog } from "@/components/legal/DocuSignSendDialog";

type CommFilter = "all" | "email" | "docusign" | "call" | "note";

interface CommLogEntry {
  id: string;
  type: "email" | "docusign" | "note" | "call";
  title: string;
  description: string;
  timestamp: string;
  actor: string;
}

export function CommunicationsTab() {
  const ctx = useMatterDetail();
  const { t, lang } = useLang();
  const [filter, setFilter] = useState<CommFilter>("all");
  const [docusignOpen, setDocusignOpen] = useState(false);

  const caseData = ctx.caseData;
  const isArchived = caseData?.status === "archived";

  const communications = useMemo<CommLogEntry[]>(() => {
    if (!caseData) return [];
    const entries: CommLogEntry[] = [];

    for (const entry of caseData.auditLog ?? []) {
      const field = (entry.field ?? "").toLowerCase();
      const note = (entry.note ?? "").toLowerCase();
      if (field.includes("email") || note.includes("e-mail") || note.includes("email")) {
        entries.push({
          id: entry.id,
          type: "email",
          title: entry.note ?? "",
          description: "",
          timestamp: entry.at,
          actor: entry.actor ?? "",
        });
      } else if (field.includes("docusign") || note.includes("docusign") || note.includes("sign")) {
        entries.push({
          id: entry.id,
          type: "docusign",
          title: entry.note ?? "",
          description: "",
          timestamp: entry.at,
          actor: entry.actor ?? "",
        });
      } else if (field.includes("call") || note.includes("telefon") || note.includes("phone")) {
        entries.push({
          id: entry.id,
          type: "call",
          title: entry.note ?? "",
          description: "",
          timestamp: entry.at,
          actor: entry.actor ?? "",
        });
      } else if (field.includes("communication") || note.includes("kommunikation")) {
        entries.push({
          id: entry.id,
          type: "note",
          title: entry.note ?? "",
          description: "",
          timestamp: entry.at,
          actor: entry.actor ?? "",
        });
      }
    }

    return entries.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [caseData]);

  const filtered = filter === "all" ? communications : communications.filter((c) => c.type === filter);

  if (!caseData) return null;

  const filterOptions: Array<{ value: CommFilter; label: string; icon: typeof Mail }> = [
    { value: "all", label: lang === "en" ? "All" : "Alle", icon: Inbox },
    { value: "email", label: lang === "en" ? "Email" : "E-Mail", icon: Mail },
    { value: "docusign", label: "DocuSign", icon: FileText },
    { value: "call", label: lang === "en" ? "Calls" : "Anrufe", icon: Phone },
  ];

  const typeIcon = (type: string) => {
    switch (type) {
      case "email":
        return Mail;
      case "docusign":
        return FileText;
      case "call":
        return Phone;
      default:
        return MessageSquare;
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="max-w-3xl space-y-4">
        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={isArchived}
            onClick={() => ctx.setShowEmailDialog(true)}
            className="gap-2 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-sm text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
          >
            <Mail size={14} />
            {t("email.compose_title")}
          </Button>
          <Button
            variant="secondary"
            disabled={isArchived}
            onClick={() => setDocusignOpen(true)}
            className="gap-2 border border-[color:var(--ds-border)] bg-[color:var(--ds-hover)] text-sm text-[color:var(--ds-text)] hover:bg-[color:var(--ds-hover)]"
          >
            <Send size={14} />
            {lang === "en" ? "Send via DocuSign" : "Via DocuSign senden"}
          </Button>
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-2">
          {filterOptions.map((opt) => {
            const Icon = opt.icon;
            const active = filter === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setFilter(opt.value)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-[color:var(--ds-hover)] text-[color:var(--ds-text)]"
                    : "text-[color:var(--ds-text-muted)] hover:bg-[color:var(--ds-hover)] hover:text-[color:var(--ds-text)]"
                }`}
              >
                <Icon size={12} />
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Communications Log */}
        {filtered.length === 0 ? (
          <div className="space-y-3 py-12 text-center">
            <Inbox size={40} className="mx-auto text-[color:var(--ds-border)]" />
            <p className="text-sm text-[color:var(--ds-text-muted)]">
              {lang === "en"
                ? "No communications recorded yet."
                : "Noch keine Kommunikationen erfasst."}
            </p>
            <p className="text-xs text-[color:var(--ds-text-muted)]">
              {lang === "en"
                ? "Send an email or DocuSign request to get started."
                : "Sende eine E-Mail oder DocuSign-Anfrage, um zu beginnen."}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((comm) => {
              const Icon = typeIcon(comm.type);
              return (
                <div
                  key={comm.id}
                  className="flex items-start gap-3 rounded-xl border border-[color:var(--ds-border)] bg-[color:var(--ds-surface)] p-4"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color:var(--ds-hover)]">
                    <Icon size={16} className="text-[color:var(--ds-text-muted)]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[color:var(--ds-text)]">
                        {comm.title}
                      </span>
                      <Badge
                        variant="default"
                        className="shrink-0 text-[10px]"
                      >
                        {comm.type}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-[color:var(--ds-text-muted)]">
                      <Clock size={11} />
                      {new Date(comm.timestamp).toLocaleString(lang === "en" ? "en-GB" : "de-DE")}
                      <span>·</span>
                      <span>{comm.actor}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Email Dialog */}
      <EmailComposeDialog
        open={ctx.showEmailDialog}
        onOpenChange={ctx.setShowEmailDialog}
        caseSlug={caseData.slug}
        recipientName={caseData.clientName}
      />

      {/* DocuSign Dialog */}
      <DocuSignSendDialog
        open={docusignOpen || ctx.showDocuSignDialog}
        onOpenChange={(open) => {
          setDocusignOpen(open);
          ctx.setShowDocuSignDialog(open);
        }}
        caseSlug={caseData.slug}
        caseTitle={caseData.title}
      />
    </div>
  );
}
