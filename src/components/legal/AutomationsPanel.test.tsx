import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

import { AutomationsPanel, draftToAction } from "./AutomationsPanel";

const RULES = [
  {
    slug: "automation-mail",
    name: "Mahnung",
    enabled: true,
    event: "invoice.overdue",
    actions: [{ type: "send_mail", recipient: "buchhaltung@kanzlei.at" }],
    created_at: "2026-09-01T00:00:00.000Z",
    created_by: "x",
    paused_reason: "owner_missing",
    status_message: "Besitzer fehlt — bitte neu speichern",
  },
  {
    slug: "automation-task",
    name: "Erstgespräch",
    enabled: true,
    event: "case.created",
    actions: [{ type: "create_task", title: "Erstgespräch" }],
    created_at: "2026-09-02T00:00:00.000Z",
    created_by: "anna@kanzlei.at",
    owner_user_id: "u-anna",
    owner_name: "Anna Anwältin",
    active_since: "2026-09-23T08:00:00.000Z",
    last_run_at: "2026-09-23T09:00:00.000Z",
    last_error: "automation-task: create_task: Akte cases/x nicht lesbar",
    last_error_at: "2026-09-23T09:00:00.000Z",
  },
  {
    slug: "legal/automation-rules/old",
    name: "Alt",
    enabled: true,
    event: "booking.created",
    actions: [{ type: "notify" }],
    created_at: "2026-09-01T00:00:00.000Z",
    created_by: "anna@kanzlei.at",
    pending_migration: true,
  },
];

const calls: Array<{ method: string; body: unknown }> = [];

beforeEach(() => {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method !== "GET") {
        calls.push({ method, body: JSON.parse(String(init?.body)) });
        return Response.json({ data: { ok: true } });
      }
      return Response.json({ data: { rules: RULES } });
    })
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("AutomationsPanel", () => {
  it("shows owner, pause reason, cutoff, last run and last error of each rule", async () => {
    render(<AutomationsPanel />);
    expect(await screen.findByText("Mahnung")).toBeTruthy();
    expect(screen.getByText(/Besitzer fehlt — bitte neu speichern/)).toBeTruthy();
    expect(screen.getByText("pausiert")).toBeTruthy();
    expect(screen.getByText(/Besitzer: Anna Anwältin/)).toBeTruthy();
    expect(screen.getByText(/reagiert auf Ereignisse ab/)).toBeTruthy();
    expect(screen.getByText(/zuletzt ausgeführt/)).toBeTruthy();
    expect(screen.getByText(/Akte cases\/x nicht lesbar/)).toBeTruthy();
    expect(screen.getByText("wird übernommen")).toBeTruthy();
    expect(screen.getByText(/Rechnung überfällig → E-Mail senden/)).toBeTruthy();
  });

  it("re-saving a paused rule sends a save through the one rule API", async () => {
    render(<AutomationsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /Neu speichern/ }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ method: "PATCH", body: { slug: "automation-mail" } });
  });

  it("creates rules via /api/automations with the canonical shape", async () => {
    render(<AutomationsPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /Neue Regel/ }));
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: "Fristen" } });
    fireEvent.change(screen.getByLabelText("Aufgabentext"), {
      target: { value: "Frist vorbereiten" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Regel anlegen/ }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      method: "POST",
      body: {
        name: "Fristen",
        event: "deadline.due_soon",
        within_days: 7,
        actions: [{ type: "create_task", title: "Frist vorbereiten" }],
      },
    });
  });

  it("keeps only the fields that belong to an action", () => {
    expect(
      draftToAction({
        type: "send_mail",
        title: "Betreff {title}",
        message: "",
        recipient: " a@b.at ",
        assignee: "X",
        dueInDays: "3",
        workflowTemplateId: "",
        status: "",
      })
    ).toEqual({ type: "send_mail", recipient: "a@b.at", title: "Betreff {title}" });
  });
});
