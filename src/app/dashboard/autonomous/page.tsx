"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, CheckCircle, XCircle, AlertTriangle, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useLang } from "@/lib/use-lang";
import { PageHeader } from "@/components/dashboard/page-header";

export default function AutonomousTasksPage() {
  const { t } = useLang();
  const [activeTab, setActiveTab] = useState("pending");

  // Fetch queue stats
  const { data: stats } = useQuery({
    queryKey: ["autonomous-queue-stats"],
    queryFn: () => api.autonomous.getQueueStats(),
    refetchInterval: 30_000,
  });

  // Fetch pending tasks
  const { data: pendingTasks, isLoading: pendingLoading } = useQuery({
    queryKey: ["autonomous-tasks", "pending"],
    queryFn: () => api.autonomous.listTasks({ status: "pending", limit: 20 }),
    refetchInterval: 30_000,
  });

  // Fetch tasks requiring approval
  const { data: approvalTasks, isLoading: approvalLoading } = useQuery({
    queryKey: ["autonomous-tasks", "requires_approval"],
    queryFn: () => api.autonomous.listTasks({ status: "requires_approval", limit: 20 }),
    refetchInterval: 30_000,
  });

  // Fetch completed tasks
  const { data: completedTasks, isLoading: completedLoading } = useQuery({
    queryKey: ["autonomous-tasks", "completed"],
    queryFn: () => api.autonomous.listTasks({ status: "completed", limit: 20 }),
    refetchInterval: 60_000,
  });

  const handleApprove = async (taskId: string, workflowSlug: string, stepId: string) => {
    await api.workflows.approveStep({
      workflowSlug,
      stepId,
      action: "approve",
    });
  };

  const handleReject = async (
    taskId: string,
    workflowSlug: string,
    stepId: string,
    comment?: string
  ) => {
    await api.workflows.approveStep({
      workflowSlug,
      stepId,
      action: "reject",
      comment,
    });
  };

  const getPriorityBadge = (priority: string) => {
    const colors = {
      urgent: "bg-[color:var(--ds-danger-bg)] text-[color:var(--ds-danger-text)] border-[color:var(--ds-danger-border)]",
      normal: "bg-[color:var(--ds-info-bg)] text-[color:var(--ds-info-text)] border-[color:var(--ds-info-border)]",
      low: "bg-gray-500/10 text-gray-500 border-gray-500/20",
    };
    return (
      <Badge className={colors[priority as keyof typeof colors] || colors.normal}>{priority}</Badge>
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="h-4 w-4 text-[color:var(--ds-warning-text)]" />;
      case "running":
        return <RefreshCw className="h-4 w-4 animate-spin text-[color:var(--ds-info-text)]" />;
      case "completed":
        return <CheckCircle className="h-4 w-4 text-[color:var(--ds-success-text)]" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-[color:var(--ds-danger-text)]" />;
      case "requires_approval":
        return <AlertTriangle className="h-4 w-4 text-[color:var(--ds-attention-text)]" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("autonomous.title")}
        description={t("autonomous.description")}
        actions={[]}
      />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ausstehend</CardTitle>
            <Clock className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.pending ?? 0}</div>
            <p className="text-muted-foreground text-xs">
              {stats?.by_priority?.urgent ?? 0} dringend
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Läuft</CardTitle>
            <RefreshCw className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.running ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Genehmigung erforderlich</CardTitle>
            <AlertTriangle className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.requires_approval ?? 0}</div>
            <p className="text-muted-foreground text-xs">Benötigt Review</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Abgeschlossen</CardTitle>
            <CheckCircle className="text-muted-foreground h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.completed ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tasks Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending">Ausstehend</TabsTrigger>
          <TabsTrigger value="approval">Genehmigung</TabsTrigger>
          <TabsTrigger value="completed">Abgeschlossen</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Ausstehende Aufgaben</CardTitle>
              <CardDescription>Aufgaben in der Warteschlange</CardDescription>
            </CardHeader>
            <CardContent>
              {pendingLoading ? (
                <div className="text-muted-foreground py-8 text-center">Laden...</div>
              ) : pendingTasks && pendingTasks.length > 0 ? (
                <div className="space-y-4">
                  {pendingTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div className="flex items-center gap-4">
                        {getStatusIcon(task.status)}
                        <div>
                          <div className="font-medium">{task.title}</div>
                          <div className="text-muted-foreground text-sm">
                            {task.task_type} • {task.case_slug || "Global"}
                          </div>
                        </div>
                      </div>
                      {getPriorityBadge(task.priority)}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground py-8 text-center">Keine Aufgaben</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approval" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Genehmigungsanfragen</CardTitle>
              <CardDescription>Aufgaben, die Ihre Genehmigung benötigen</CardDescription>
            </CardHeader>
            <CardContent>
              {approvalLoading ? (
                <div className="text-muted-foreground py-8 text-center">Laden...</div>
              ) : approvalTasks && approvalTasks.length > 0 ? (
                <div className="space-y-4">
                  {approvalTasks.map((task) => (
                    <div key={task.id} className="space-y-4 rounded-lg border p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          {getStatusIcon(task.status)}
                          <div>
                            <div className="font-medium">{task.title}</div>
                            <div className="text-muted-foreground text-sm">
                              {task.task_type} • {task.case_slug || "Global"}
                            </div>
                          </div>
                        </div>
                        {getPriorityBadge(task.priority)}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            handleApprove(
                              task.id,
                              task.payload.workflowSlug as string,
                              task.payload.stepId as string
                            )
                          }
                        >
                          Genehmigen
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            handleReject(
                              task.id,
                              task.payload.workflowSlug as string,
                              task.payload.stepId as string
                            )
                          }
                        >
                          Ablehnen
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground py-8 text-center">Keine Genehmigungen</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Abgeschlossene Aufgaben</CardTitle>
              <CardDescription>Erledigte Aufgaben</CardDescription>
            </CardHeader>
            <CardContent>
              {completedLoading ? (
                <div className="text-muted-foreground py-8 text-center">Laden...</div>
              ) : completedTasks && completedTasks.length > 0 ? (
                <div className="space-y-4">
                  {completedTasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <div className="flex items-center gap-4">
                        {getStatusIcon(task.status)}
                        <div>
                          <div className="font-medium">{task.title}</div>
                          <div className="text-muted-foreground text-sm">
                            {task.task_type} • {task.case_slug || "Global"}
                          </div>
                        </div>
                      </div>
                      <div className="text-muted-foreground text-sm">
                        {task.completed_at ? new Date(task.completed_at).toLocaleString() : "-"}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground py-8 text-center">
                  Keine abgeschlossenen Aufgaben
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
