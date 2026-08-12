"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Play, Square, Timer } from "lucide-react";
import { useRealtime } from "@/lib/realtime";
import { useMe } from "@/lib/queries/auth";
import { csrfFetch } from "@/lib/csrf";
import type { CurrentActivity, ActivityType } from "@/lib/time-tracking";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type RealtimeTimeData = { userId: string; entryId?: string };

const ACTIVITY_TYPES: Array<{ value: ActivityType; label: string }> = [
  { value: "document", label: "Dokument" },
  { value: "query", label: "Recherche" },
  { value: "case", label: "Akte" },
  { value: "meeting", label: "Besprechung" },
  { value: "email", label: "E-Mail" },
  { value: "phone", label: "Telefonat" },
  { value: "review", label: "Prüfung" },
  { value: "other", label: "Sonstiges" },
];

export function TimeTrackingWidget() {
  const [currentActivity, setCurrentActivity] = useState<CurrentActivity | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [startForm, setStartForm] = useState({
    activityType: "other" as ActivityType,
    description: "",
  });
  const { data: meData } = useMe();
  const userId = meData?.user?.id;

  // Listen for time activity events
  useRealtime("time.activity.started", (data) => {
    const td = data as RealtimeTimeData;
    if (td.userId === userId) {
      fetchCurrentActivity();
    }
  });

  useRealtime("time.activity.stopped", (data) => {
    const td = data as RealtimeTimeData;
    if (td.userId === userId) {
      setCurrentActivity(null);
      setElapsed(0);
    }
  });

  // Fetch current activity on mount
  useEffect(() => {
    fetchCurrentActivity();
  }, []);

  // Update elapsed time every second
  useEffect(() => {
    if (!currentActivity) return;

    const interval = setInterval(() => {
      const started = new Date(currentActivity.started_at);
      const now = new Date();
      setElapsed(Math.floor((now.getTime() - started.getTime()) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [currentActivity]);

  // Send heartbeat every 60 seconds
  useEffect(() => {
    if (!currentActivity) return;

    const interval = setInterval(() => {
      csrfFetch("/api/time-tracking/heartbeat", { method: "POST" });
    }, 60_000);

    return () => clearInterval(interval);
  }, [currentActivity]);

  async function fetchCurrentActivity() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/time-tracking/current");
      const data = await res.json();
      setCurrentActivity(data.current);
      if (data.current) {
        const started = new Date(data.current.started_at);
        const now = new Date();
        setElapsed(Math.floor((now.getTime() - started.getTime()) / 1000));
      }
    } catch (err) {
      console.error("Failed to fetch current activity:", err);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleStart() {
    setShowStartDialog(true);
  }

  async function confirmStart() {
    try {
      await csrfFetch("/api/time-tracking/current", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activity_type: startForm.activityType,
          description:
            startForm.description ||
            ACTIVITY_TYPES.find((a) => a.value === startForm.activityType)?.label ||
            "Arbeit",
        }),
      });
      setShowStartDialog(false);
      setStartForm({ activityType: "other", description: "" });
      await fetchCurrentActivity();
    } catch (err) {
      console.error("Failed to start activity:", err);
    }
  }

  async function handleStop() {
    try {
      await csrfFetch("/api/time-tracking/stop", { method: "POST" });
      setCurrentActivity(null);
      setElapsed(0);
    } catch (err) {
      console.error("Failed to stop activity:", err);
    }
  }

  function formatElapsed(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    return `${minutes}m ${secs}s`;
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Timer className="h-4 w-4" />
            Zeiterfassung
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-[color:var(--ds-text-muted)] text-sm">Laden...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Timer className="h-4 w-4" />
          Zeiterfassung
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {currentActivity ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">{currentActivity.description}</div>
              <div className="text-[color:var(--ds-text-muted)] text-sm">
                {currentActivity.case_slug || "Global"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-[color:var(--ds-info-text)]" />
              <div className="font-mono text-2xl font-bold">{formatElapsed(elapsed)}</div>
            </div>
            <Button onClick={handleStop} variant="danger" size="sm" className="w-full">
              <Square className="mr-2 h-4 w-4" />
              Stoppen
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-[color:var(--ds-text-muted)] py-4 text-center text-sm">
              Keine aktive Zeiterfassung
            </div>
            <Button onClick={handleStart} size="sm" className="w-full">
              <Play className="mr-2 h-4 w-4" />
              Starten
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Zeiterfassung starten</DialogTitle>
            <DialogDescription>
              Wählen Sie eine Tätigkeit und beschreiben Sie diese optional.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="activity-type">Tätigkeit</Label>
              <Select
                value={startForm.activityType}
                onValueChange={(v) =>
                  setStartForm((prev) => ({ ...prev, activityType: v as ActivityType }))
                }
              >
                <SelectTrigger id="activity-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map((a) => (
                    <SelectItem key={a.value} value={a.value}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="activity-description">Beschreibung (optional)</Label>
              <Input
                id="activity-description"
                value={startForm.description}
                onChange={(e) => setStartForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="z.B. Klageschrift Müller ./. Schmidt"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void confirmStart();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowStartDialog(false)}>
              Abbrechen
            </Button>
            <Button onClick={confirmStart}>
              <Play className="mr-2 h-4 w-4" />
              Starten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
