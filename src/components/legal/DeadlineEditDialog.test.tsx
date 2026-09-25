import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/use-lang", () => ({ useLang: () => ({ t: (k: string) => k, lang: "de" }) }));
// jsdom has no ResizeObserver — the dialog/checkbox primitives need it.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

import { DeadlineEditDialog } from "./DeadlineEditDialog";

function setup(isNotfrist: boolean) {
  const onSave = vi.fn();
  render(
    <DeadlineEditDialog
      open
      onOpenChange={vi.fn()}
      deadline={{ description: "Berufung", date: "2026-03-30", isNotfrist }}
      saving={false}
      onSave={onSave}
    />
  );
  return onSave;
}

describe("DeadlineEditDialog — Notfrist verschieben nur mit Begründung (FRI-7)", () => {
  it("moving a Notfrist requires a reason, which is handed to the save", () => {
    const onSave = setup(true);
    fireEvent.change(screen.getByLabelText(/Fälligkeitsdatum/), {
      target: { value: "2026-04-15" },
    });
    const save = screen.getByText("Speichern").closest("button") as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Begründung/), {
      target: { value: "Zustellung korrigiert" },
    });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ dueDate: "2026-04-15", changeReason: "Zustellung korrigiert" })
    );
  });

  it("an ordinary deadline can be moved without a reason", () => {
    const onSave = setup(false);
    fireEvent.change(screen.getByLabelText(/Fälligkeitsdatum/), {
      target: { value: "2026-04-15" },
    });
    expect(screen.queryByLabelText(/Begründung/)).toBeNull();
    fireEvent.click(screen.getByText("Speichern"));
    expect(onSave).toHaveBeenCalledWith(
      expect.not.objectContaining({ changeReason: expect.anything() })
    );
  });
});
