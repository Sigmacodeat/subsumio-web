"use client";

/**
 * Demo chapter 2 — the incoming brief. Renders on /dashboard/intake for
 * demo sessions and shows the employer's statement of defence arriving via
 * ERV. Clicking "In Akte aufnehmen" calls POST /api/demo/ingest (which
 * clones the staged inbox pages into the visitor's isolated demo source)
 * while UploadLifecycle walks the real pipeline stages at demo speed.
 *
 * The extraction results shown afterwards (parties, the detected Reply
 * deadline) come from the server response — nothing is hardcoded beyond
 * the file metadata in DEMO_INBOX_FILE.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { CalendarCheck, FileText, Inbox as InboxIcon, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useLang } from "@/lib/use-lang";
import { useReducedMotion } from "@/lib/use-safe-reduced-motion";
import { UploadLifecycle, UPLOAD_STAGES } from "@/components/dashboard/upload-lifecycle";
import { useMe } from "@/lib/queries/auth";
import { useDemoSession, useDemoIngest } from "@/lib/queries/demo";
import { demoInboxFile } from "@/content/demo-matter";
import { tracking } from "@/lib/tracking";

const STAGE_MS = [1200, 900, 1500, 3200]; // per-stage dwell; total ~6.8s demo speed
const MIN_TOTAL_MS = STAGE_MS.reduce((a, b) => a + b, 0);

export function DemoIngestCard() {
  const { t } = useLang();
  const { addToast } = useToast();
  const reduceMotion = useReducedMotion();
  const me = useMe();
  const demoQ = useDemoSession(Boolean(me.data?.demo));
  const demo = demoQ.data;
  const ingest = useDemoIngest();
  const [stage, setStage] = useState(-1); // -1 = idle, 0..3 active, 4 done
  const [ingested, setIngested] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  if (!demo?.demo) return null;

  const running = stage >= 0 && stage < UPLOAD_STAGES.length;
  const done = ingested || Boolean(demo.ingested);
  const inboxFile = demoInboxFile(demo.jurisdiction === "de" ? "de" : "at");

  function start() {
    if (running || done || ingest.isPending) return;
    tracking.demo?.ingestStarted();
    setStage(0);
    let acc = 0;
    for (let i = 0; i < STAGE_MS.length; i++) {
      acc += STAGE_MS[i];
      timers.current.push(setTimeout(() => setStage(i + 1), acc));
    }
    const started = Date.now();
    ingest.mutate(undefined, {
      onSuccess: () => {
        const wait = Math.max(0, MIN_TOTAL_MS - (Date.now() - started));
        timers.current.push(
          setTimeout(() => {
            setStage(UPLOAD_STAGES.length);
            setIngested(true);
            tracking.demo?.ingestDone();
            addToast({
              type: "success",
              title: t("demo.ingest.done_title"),
              description: t("demo.ingest.done_body"),
            });
          }, wait)
        );
      },
      onError: () => {
        timers.current.forEach(clearTimeout);
        setStage(-1);
        addToast({
          type: "error",
          title: t("demo.ingest.err_title"),
          description: t("demo.ingest.err_body"),
        });
      },
    });
  }

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <Card className="border-[color:var(--brand-primary)]/30 bg-[color:var(--brand-primary)]/[0.03]">
        <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-primary)]">
            <InboxIcon size={20} aria-hidden />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <FileText
                size={14}
                className="shrink-0 text-[color:var(--ds-text-subtle)]"
                aria-hidden
              />
              <span className="text-sm font-medium text-[color:var(--ds-text)]">
                {inboxFile.name}
              </span>
              <Badge variant="info" className="text-[0.625rem]">
                {t("demo.ingest.via")}
              </Badge>
              {done && (
                <Badge variant="success" className="text-[0.625rem]">
                  {t("demo.ingest.in_file")}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-[color:var(--ds-text-subtle)]">
              {inboxFile.size} · {t("demo.ingest.new_doc")}
            </p>

            {running && (
              <div className="mt-3" aria-live="polite">
                <UploadLifecycle stage={stage} />
                <p className="mt-1.5 text-[0.6875rem] text-[color:var(--ds-text-muted)]">
                  {t("demo.ingest.note")}
                </p>
              </div>
            )}

            {done && (
              <div
                className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[color:var(--ds-text)]"
                aria-live="polite"
              >
                <span className="inline-flex items-center gap-1">
                  <Users size={12} aria-hidden /> 2 {t("demo.ingest.parties")}
                </span>
                <span className="inline-flex items-center gap-1">
                  <CalendarCheck size={12} aria-hidden /> 1 {t("demo.ingest.deadline")}
                </span>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {!done && (
              <Button size="sm" onClick={start} disabled={running || ingest.isPending}>
                {running ? t("demo.ingest.processing") : t("demo.ingest.cta")}
              </Button>
            )}
            {done && (
              <Button asChild size="sm">
                <Link href="/dashboard/deadlines?ai=1">{t("demo.ingest.to_deadline")}</Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
