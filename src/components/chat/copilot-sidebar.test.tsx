import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProactiveAlerts } from "./copilot-sidebar";

const t = (key: string) => key;

describe("ProactiveAlerts", () => {
  it("triggers onQuery when the alert row is clicked", () => {
    const onQuery = vi.fn();
    const onDismiss = vi.fn();
    render(
      <ProactiveAlerts
        t={t}
        onQuery={onQuery}
        onDismiss={onDismiss}
        alerts={[{ label: "Deadline", query: "Zeige Fristen", severity: "urgent", icon: "deadline" }]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Deadline/i }));
    expect(onQuery).toHaveBeenCalledWith("Zeige Fristen");
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("triggers onQuery on Enter and Space keys", () => {
    const onQuery = vi.fn();
    render(
      <ProactiveAlerts
        t={t}
        onQuery={onQuery}
        onDismiss={vi.fn()}
        alerts={[{ label: "Deadline", query: "Zeige Fristen", severity: "warning", icon: "mail" }]}
      />
    );
    const row = screen.getByRole("button", { name: /Deadline/i });
    fireEvent.keyDown(row, { key: "Enter", code: "Enter" });
    expect(onQuery).toHaveBeenCalledWith("Zeige Fristen");
    onQuery.mockClear();
    fireEvent.keyDown(row, { key: " ", code: "Space" });
    expect(onQuery).toHaveBeenCalledWith("Zeige Fristen");
  });

  it("dismisses the alert when clicking the X button without triggering onQuery", () => {
    const onQuery = vi.fn();
    const onDismiss = vi.fn();
    render(
      <ProactiveAlerts
        t={t}
        onQuery={onQuery}
        onDismiss={onDismiss}
        alerts={[{ label: "Conflict", query: "Konflikt", severity: "urgent", icon: "conflict" }]}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /copilot.dismiss_hint/i }));
    expect(onDismiss).toHaveBeenCalledWith("Conflict-Konflikt");
    expect(onQuery).not.toHaveBeenCalled();
  });
});
