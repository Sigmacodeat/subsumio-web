import { describe, it, expect } from "vitest";
import {
  WORKFLOW_TEMPLATES,
  getTemplate,
  buildWorkflowSteps,
  buildWorkflowFrontmatter,
  buildWorkflowSlug,
  buildWorkflowTitle,
  buildWorkflowEvent,
  getWorkflowProgress,
  getActiveStep,
  getPendingApprovals,
  inferWorkflowStatus,
  advanceStep,
  advanceStepIdempotent,
  isTerminalStepStatus,
  canAdvanceStep,
  getStepStatusLabel,
  getWorkflowStatusLabel,
  getActionTypeLabel,
  fmToWorkflowInstance,
  filterWorkflows,
  sortWorkflowsByStartedAt,
  type WorkflowStep,
  type WorkflowInstance,
} from "@/lib/workflow";

// ── Templates ─────────────────────────────────────────────────────────

describe("WORKFLOW_TEMPLATES", () => {
  it("has at least 5 templates", () => {
    expect(WORKFLOW_TEMPLATES.length).toBeGreaterThanOrEqual(5);
  });

  it("each template has id, label, description, icon, prompt, steps", () => {
    for (const t of WORKFLOW_TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.label).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.icon).toBeTruthy();
      expect(t.prompt).toBeTruthy();
      expect(t.steps.length).toBeGreaterThan(0);
    }
  });

  it("each step has label and action_type", () => {
    for (const t of WORKFLOW_TEMPLATES) {
      for (const step of t.steps) {
        expect(step.label).toBeTruthy();
        expect(step.action_type).toBeTruthy();
      }
    }
  });

  it("template ids are unique", () => {
    const ids = WORKFLOW_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("getTemplate", () => {
  it("returns template by id", () => {
    const t = getTemplate("due_diligence");
    expect(t).toBeDefined();
    expect(t?.label).toBe("Due Diligence");
  });

  it("returns undefined for unknown id", () => {
    expect(getTemplate("nonexistent")).toBeUndefined();
  });
});

// ── buildWorkflowSteps ────────────────────────────────────────────────

describe("buildWorkflowSteps", () => {
  it("builds steps from template", () => {
    const template = WORKFLOW_TEMPLATES[0];
    const steps = buildWorkflowSteps(template);
    expect(steps.length).toBe(template.steps.length);
    expect(steps[0].status).toBe("pending");
    expect(steps[0].id).toBe("step-1");
  });

  it("each step has unique id", () => {
    const template = WORKFLOW_TEMPLATES[0];
    const steps = buildWorkflowSteps(template);
    const ids = steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── buildWorkflowFrontmatter ──────────────────────────────────────────

describe("buildWorkflowFrontmatter", () => {
  it("builds valid frontmatter", () => {
    const fm = buildWorkflowFrontmatter({
      template_id: "due_diligence",
      prompt: "Test prompt",
      started_by: "user@test.com",
    });
    expect(fm.type).toBe("workflow");
    expect(fm.template_id).toBe("due_diligence");
    expect(fm.status).toBe("running");
    expect(fm.prompt).toBe("Test prompt");
    expect(fm.started_by).toBe("user@test.com");
    expect(fm.started_at).toBeTruthy();
    expect(Array.isArray(fm.steps)).toBe(true);
    expect((fm.steps as WorkflowStep[]).length).toBeGreaterThan(0);
  });

  it("includes case_slug when provided", () => {
    const fm = buildWorkflowFrontmatter({
      template_id: "due_diligence",
      prompt: "Test",
      started_by: "user@test.com",
      case_slug: "cases/2024-001",
    });
    expect(fm.case_slug).toBe("cases/2024-001");
  });

  it("throws for unknown template", () => {
    expect(() =>
      buildWorkflowFrontmatter({
        template_id: "nonexistent",
        prompt: "Test",
        started_by: "user@test.com",
      })
    ).toThrow("Unknown workflow template");
  });

  it("uses custom date when provided", () => {
    const date = new Date("2024-01-15T10:00:00Z");
    const fm = buildWorkflowFrontmatter({
      template_id: "due_diligence",
      prompt: "Test",
      started_by: "user@test.com",
      at: date,
    });
    expect(fm.started_at).toBe(date.toISOString());
  });
});

// ── buildWorkflowSlug ─────────────────────────────────────────────────

describe("buildWorkflowSlug", () => {
  it("builds slug with template id and timestamp", () => {
    const slug = buildWorkflowSlug("due_diligence");
    expect(slug).toMatch(/^workflows\/due_diligence-\d{4}-\d{2}-\d{2}T/);
  });

  it("uses custom date", () => {
    const date = new Date("2024-06-15T10:30:00.000Z");
    const slug = buildWorkflowSlug("contract_review", date);
    expect(slug).toBe("workflows/contract_review-2024-06-15T10-30-00");
  });
});

// ── buildWorkflowTitle ────────────────────────────────────────────────

describe("buildWorkflowTitle", () => {
  it("builds title from template", () => {
    const template = getTemplate("due_diligence")!;
    const title = buildWorkflowTitle(template);
    expect(title).toContain("Due Diligence");
    expect(title).toContain("🔍");
  });
});

// ── getWorkflowProgress ───────────────────────────────────────────────

describe("getWorkflowProgress", () => {
  it("returns 0% for all pending", () => {
    const steps: WorkflowStep[] = [
      { id: "s1", label: "A", action_type: "document_finalize", status: "pending" },
      { id: "s2", label: "B", action_type: "document_finalize", status: "pending" },
    ];
    const progress = getWorkflowProgress(steps);
    expect(progress.completed).toBe(0);
    expect(progress.total).toBe(2);
    expect(progress.percentage).toBe(0);
  });

  it("counts approved and skipped as completed", () => {
    const steps: WorkflowStep[] = [
      { id: "s1", label: "A", action_type: "document_finalize", status: "approved" },
      { id: "s2", label: "B", action_type: "document_finalize", status: "skipped" },
      { id: "s3", label: "C", action_type: "document_finalize", status: "pending" },
    ];
    const progress = getWorkflowProgress(steps);
    expect(progress.completed).toBe(2);
    expect(progress.total).toBe(3);
    expect(progress.percentage).toBe(67);
  });

  it("returns 100% when all done", () => {
    const steps: WorkflowStep[] = [
      { id: "s1", label: "A", action_type: "document_finalize", status: "approved" },
    ];
    expect(getWorkflowProgress(steps).percentage).toBe(100);
  });

  it("handles empty steps", () => {
    expect(getWorkflowProgress([])).toEqual({ completed: 0, total: 0, percentage: 0 });
  });
});

// ── getActiveStep ─────────────────────────────────────────────────────

describe("getActiveStep", () => {
  it("returns running step", () => {
    const steps: WorkflowStep[] = [
      { id: "s1", label: "A", action_type: "document_finalize", status: "approved" },
      { id: "s2", label: "B", action_type: "document_finalize", status: "running" },
      { id: "s3", label: "C", action_type: "document_finalize", status: "pending" },
    ];
    expect(getActiveStep(steps)?.id).toBe("s2");
  });

  it("returns null when no running step", () => {
    const steps: WorkflowStep[] = [
      { id: "s1", label: "A", action_type: "document_finalize", status: "pending" },
    ];
    expect(getActiveStep(steps)).toBeNull();
  });
});

// ── getPendingApprovals ───────────────────────────────────────────────

describe("getPendingApprovals", () => {
  it("returns running steps with agent_action_slug", () => {
    const steps: WorkflowStep[] = [
      {
        id: "s1",
        label: "A",
        action_type: "document_finalize",
        status: "running",
        agent_action_slug: "actions/123",
      },
      { id: "s2", label: "B", action_type: "document_finalize", status: "running" },
      {
        id: "s3",
        label: "C",
        action_type: "document_finalize",
        status: "pending",
        agent_action_slug: "actions/456",
      },
    ];
    const pending = getPendingApprovals(steps);
    expect(pending.length).toBe(1);
    expect(pending[0].id).toBe("s1");
  });

  it("returns empty when no running steps have agent_action_slug", () => {
    const steps: WorkflowStep[] = [
      { id: "s1", label: "A", action_type: "document_finalize", status: "running" },
    ];
    expect(getPendingApprovals(steps)).toEqual([]);
  });
});

// ── inferWorkflowStatus ───────────────────────────────────────────────

describe("inferWorkflowStatus", () => {
  it("returns 'failed' when any step is rejected", () => {
    const steps: WorkflowStep[] = [
      { id: "s1", label: "A", action_type: "document_finalize", status: "approved" },
      { id: "s2", label: "B", action_type: "document_finalize", status: "rejected" },
    ];
    expect(inferWorkflowStatus(steps)).toBe("failed");
  });

  it("returns 'completed' when all steps approved/skipped", () => {
    const steps: WorkflowStep[] = [
      { id: "s1", label: "A", action_type: "document_finalize", status: "approved" },
      { id: "s2", label: "B", action_type: "document_finalize", status: "skipped" },
    ];
    expect(inferWorkflowStatus(steps)).toBe("completed");
  });

  it("returns 'running' when a step is running", () => {
    const steps: WorkflowStep[] = [
      { id: "s1", label: "A", action_type: "document_finalize", status: "approved" },
      { id: "s2", label: "B", action_type: "document_finalize", status: "running" },
    ];
    expect(inferWorkflowStatus(steps)).toBe("running");
  });

  it("returns 'paused' when no step is running but not all done", () => {
    const steps: WorkflowStep[] = [
      { id: "s1", label: "A", action_type: "document_finalize", status: "approved" },
      { id: "s2", label: "B", action_type: "document_finalize", status: "pending" },
    ];
    expect(inferWorkflowStatus(steps)).toBe("paused");
  });
});

// ── advanceStep ───────────────────────────────────────────────────────

describe("advanceStep", () => {
  const steps: WorkflowStep[] = [
    { id: "s1", label: "A", action_type: "document_finalize", status: "pending" },
    { id: "s2", label: "B", action_type: "document_finalize", status: "pending" },
  ];

  it("advances step to running", () => {
    const updated = advanceStep(steps, "s1", "running");
    expect(updated[0].status).toBe("running");
    expect(updated[0].started_at).toBeTruthy();
    expect(updated[1].status).toBe("pending");
  });

  it("advances step to approved with completed_at", () => {
    const updated = advanceStep(steps, "s1", "approved");
    expect(updated[0].status).toBe("approved");
    expect(updated[0].completed_at).toBeTruthy();
  });

  it("preserves other steps", () => {
    const updated = advanceStep(steps, "s2", "running");
    expect(updated[0].status).toBe("pending");
    expect(updated[1].status).toBe("running");
  });

  it("adds agent_action_slug", () => {
    const updated = advanceStep(steps, "s1", "running", { agent_action_slug: "actions/abc" });
    expect(updated[0].agent_action_slug).toBe("actions/abc");
  });

  it("adds error on rejection", () => {
    const updated = advanceStep(steps, "s1", "rejected", { error: "Missing signature" });
    expect(updated[0].status).toBe("rejected");
    expect(updated[0].error).toBe("Missing signature");
    expect(updated[0].completed_at).toBeTruthy();
  });
});

// ── Label Helpers ─────────────────────────────────────────────────────

describe("getStepStatusLabel", () => {
  it("returns German labels for all statuses", () => {
    expect(getStepStatusLabel("pending")).toBe("Wartet");
    expect(getStepStatusLabel("running")).toBe("Läuft");
    expect(getStepStatusLabel("approved")).toBe("Freigegeben");
    expect(getStepStatusLabel("rejected")).toBe("Abgelehnt");
    expect(getStepStatusLabel("skipped")).toBe("Übersprungen");
  });
});

describe("getWorkflowStatusLabel", () => {
  it("returns German labels for all statuses", () => {
    expect(getWorkflowStatusLabel("running")).toBe("Läuft");
    expect(getWorkflowStatusLabel("completed")).toBe("Abgeschlossen");
    expect(getWorkflowStatusLabel("failed")).toBe("Fehlgeschlagen");
    expect(getWorkflowStatusLabel("paused")).toBe("Pausiert");
  });
});

describe("getActionTypeLabel", () => {
  it("returns label for known action type", () => {
    expect(getActionTypeLabel("document_finalize")).toBe("Schriftsatz freigeben");
    expect(getActionTypeLabel("deadline_create")).toBe("Frist notieren");
  });
});

// ── fmToWorkflowInstance ──────────────────────────────────────────────

describe("fmToWorkflowInstance", () => {
  it("converts valid page to workflow instance", () => {
    const page = {
      slug: "workflows/test-123",
      title: "Test Workflow",
      frontmatter: {
        type: "workflow",
        template_id: "due_diligence",
        status: "running",
        prompt: "Test",
        steps: [{ id: "s1", label: "A", action_type: "document_finalize", status: "pending" }],
        started_at: "2024-01-01T00:00:00Z",
        started_by: "user@test.com",
      },
    };
    const instance = fmToWorkflowInstance(page);
    expect(instance).not.toBeNull();
    expect(instance?.slug).toBe("workflows/test-123");
    expect(instance?.frontmatter.template_id).toBe("due_diligence");
  });

  it("returns null for non-workflow page", () => {
    const page = {
      slug: "cases/123",
      title: "Test Case",
      frontmatter: { type: "case" },
    };
    expect(fmToWorkflowInstance(page)).toBeNull();
  });

  it("returns null for missing frontmatter", () => {
    const page = { slug: "test", title: "Test" };
    expect(fmToWorkflowInstance(page)).toBeNull();
  });

  it("fills defaults for missing fields", () => {
    const page = {
      slug: "workflows/test",
      title: "Test",
      frontmatter: { type: "workflow" },
    };
    const instance = fmToWorkflowInstance(page);
    expect(instance?.frontmatter.template_id).toBe("custom");
    expect(instance?.frontmatter.status).toBe("running");
    expect(instance?.frontmatter.steps).toEqual([]);
    expect(instance?.frontmatter.started_by).toBe("—");
  });
});

// ── filterWorkflows ───────────────────────────────────────────────────

describe("filterWorkflows", () => {
  const instances: WorkflowInstance[] = [
    {
      slug: "w1",
      title: "Running",
      frontmatter: {
        type: "workflow",
        template_id: "t",
        status: "running",
        prompt: "",
        steps: [],
        started_at: "2024-01-01",
        started_by: "u",
      },
    },
    {
      slug: "w2",
      title: "Completed",
      frontmatter: {
        type: "workflow",
        template_id: "t",
        status: "completed",
        prompt: "",
        steps: [],
        started_at: "2024-01-02",
        started_by: "u",
      },
    },
    {
      slug: "w3",
      title: "Failed",
      frontmatter: {
        type: "workflow",
        template_id: "t",
        status: "failed",
        prompt: "",
        steps: [],
        started_at: "2024-01-03",
        started_by: "u",
      },
    },
    {
      slug: "w4",
      title: "Paused",
      frontmatter: {
        type: "workflow",
        template_id: "t",
        status: "paused",
        prompt: "",
        steps: [],
        started_at: "2024-01-04",
        started_by: "u",
      },
    },
  ];

  it("returns all for 'all' filter", () => {
    expect(filterWorkflows(instances, "all").length).toBe(4);
  });

  it("returns running+paused for 'active' filter", () => {
    const active = filterWorkflows(instances, "active");
    expect(active.length).toBe(2);
    expect(active.some((w) => w.slug === "w1")).toBe(true);
    expect(active.some((w) => w.slug === "w4")).toBe(true);
  });

  it("returns completed for 'completed' filter", () => {
    expect(filterWorkflows(instances, "completed").length).toBe(1);
  });

  it("returns failed for 'failed' filter", () => {
    expect(filterWorkflows(instances, "failed").length).toBe(1);
  });
});

// ── sortWorkflowsByStartedAt ──────────────────────────────────────────

describe("sortWorkflowsByStartedAt", () => {
  const instances: WorkflowInstance[] = [
    {
      slug: "w1",
      title: "A",
      frontmatter: {
        type: "workflow",
        template_id: "t",
        status: "running",
        prompt: "",
        steps: [],
        started_at: "2024-01-01",
        started_by: "u",
      },
    },
    {
      slug: "w2",
      title: "B",
      frontmatter: {
        type: "workflow",
        template_id: "t",
        status: "running",
        prompt: "",
        steps: [],
        started_at: "2024-03-01",
        started_by: "u",
      },
    },
    {
      slug: "w3",
      title: "C",
      frontmatter: {
        type: "workflow",
        template_id: "t",
        status: "running",
        prompt: "",
        steps: [],
        started_at: "2024-02-01",
        started_by: "u",
      },
    },
  ];

  it("sorts descending by default", () => {
    const sorted = sortWorkflowsByStartedAt(instances);
    expect(sorted[0].slug).toBe("w2");
    expect(sorted[1].slug).toBe("w3");
    expect(sorted[2].slug).toBe("w1");
  });

  it("sorts ascending when specified", () => {
    const sorted = sortWorkflowsByStartedAt(instances, "asc");
    expect(sorted[0].slug).toBe("w1");
    expect(sorted[2].slug).toBe("w2");
  });

  it("does not mutate original array", () => {
    const original = [...instances];
    sortWorkflowsByStartedAt(instances);
    expect(instances.map((i) => i.slug)).toEqual(original.map((i) => i.slug));
  });
});

// ── buildWorkflowEvent (SSE) ──────────────────────────────────────────

describe("buildWorkflowEvent", () => {
  it("builds a started event with correct shape", () => {
    const evt = buildWorkflowEvent("started", { slug: "w1", title: "Test" });
    expect(evt.event).toBe("started");
    expect(evt.at).toBeTruthy();
    expect(evt.data.slug).toBe("w1");
    expect(evt.data.title).toBe("Test");
  });

  it("builds a step_changed event with step and workflow status", () => {
    const evt = buildWorkflowEvent("step_changed", {
      slug: "w1",
      step_id: "s1",
      new_status: "approved",
      workflow_status: "running",
    });
    expect(evt.event).toBe("step_changed");
    expect(evt.data.step_id).toBe("s1");
    expect(evt.data.new_status).toBe("approved");
    expect(evt.data.workflow_status).toBe("running");
  });

  it("builds a completed event", () => {
    const evt = buildWorkflowEvent("completed", { slug: "w1" });
    expect(evt.event).toBe("completed");
    expect(evt.data.slug).toBe("w1");
  });

  it("builds a failed event with error info", () => {
    const evt = buildWorkflowEvent("failed", { slug: "w1", error: "Missing signature" });
    expect(evt.event).toBe("failed");
    expect(evt.data.error).toBe("Missing signature");
  });

  it("includes ISO timestamp", () => {
    const evt = buildWorkflowEvent("started", {});
    expect(evt.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(() => new Date(evt.at).toISOString()).not.toThrow();
  });

  it("preserves arbitrary data fields", () => {
    const evt = buildWorkflowEvent("step_changed", {
      slug: "w1",
      custom_field: "value",
      nested: { a: 1 },
    });
    expect(evt.data.custom_field).toBe("value");
    expect((evt.data.nested as Record<string, number>).a).toBe(1);
  });
});

// ── Idempotency ───────────────────────────────────────────────────────

describe("isTerminalStepStatus", () => {
  it("returns true for approved", () => {
    expect(isTerminalStepStatus("approved")).toBe(true);
  });
  it("returns true for rejected", () => {
    expect(isTerminalStepStatus("rejected")).toBe(true);
  });
  it("returns true for skipped", () => {
    expect(isTerminalStepStatus("skipped")).toBe(true);
  });
  it("returns false for pending", () => {
    expect(isTerminalStepStatus("pending")).toBe(false);
  });
  it("returns false for running", () => {
    expect(isTerminalStepStatus("running")).toBe(false);
  });
});

describe("canAdvanceStep", () => {
  it("allows pending → running", () => {
    const step: WorkflowStep = {
      id: "s1",
      label: "A",
      action_type: "document_finalize",
      status: "pending",
    };
    expect(canAdvanceStep(step, "running")).toBe(true);
  });
  it("blocks approved → running (terminal)", () => {
    const step: WorkflowStep = {
      id: "s1",
      label: "A",
      action_type: "document_finalize",
      status: "approved",
    };
    expect(canAdvanceStep(step, "running")).toBe(false);
  });
  it("blocks same status", () => {
    const step: WorkflowStep = {
      id: "s1",
      label: "A",
      action_type: "document_finalize",
      status: "running",
    };
    expect(canAdvanceStep(step, "running")).toBe(false);
  });
});

describe("advanceStepIdempotent", () => {
  const steps: WorkflowStep[] = [
    { id: "s1", label: "A", action_type: "document_finalize", status: "pending" },
    { id: "s2", label: "B", action_type: "document_finalize", status: "pending" },
  ];

  it("advances step successfully", () => {
    const result = advanceStepIdempotent(steps, "s1", "running");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.steps[0].status).toBe("running");
    }
  });

  it("blocks advancement of terminal step", () => {
    const approvedSteps: WorkflowStep[] = [
      { id: "s1", label: "A", action_type: "document_finalize", status: "approved" },
    ];
    const result = advanceStepIdempotent(approvedSteps, "s1", "running");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("terminal");
    }
  });

  it("blocks same-status advancement", () => {
    const runningSteps: WorkflowStep[] = [
      { id: "s1", label: "A", action_type: "document_finalize", status: "running" },
    ];
    const result = advanceStepIdempotent(runningSteps, "s1", "running");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("already");
    }
  });

  it("returns error for non-existent step", () => {
    const result = advanceStepIdempotent(steps, "nonexistent", "running");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("not found");
    }
  });

  it("preserves other steps", () => {
    const result = advanceStepIdempotent(steps, "s1", "running");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.steps[1].status).toBe("pending");
    }
  });
});
