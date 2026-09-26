import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Sheet } from "./sheet";

vi.mock("@/lib/use-lang", () => ({
  useLang: () => ({ lang: "de", t: (k: string) => (k === "sheet.aria_close" ? "Schließen" : k) }),
}));

// framer-motion: AnimatePresence/motion synchron rendern, ohne Animations-Timer.
vi.mock("framer-motion", async () => {
  const React = await import("react");
  const motion = new Proxy(
    {},
    {
      get:
        (_target, tag: string) =>
        ({
          initial: _i,
          animate: _a,
          exit: _e,
          transition: _t,
          ...rest
        }: Record<string, unknown>) =>
          React.createElement(tag, rest),
    }
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

function flushFrames() {
  return act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("Sheet — Fokusfalle & Dialog-Semantik", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 0)
    );
    vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("trägt role=dialog, aria-modal und aria-labelledby auf den Titel", async () => {
    render(
      <Sheet open onClose={() => {}} title="Aktenvorschau" description="Details zur Akte">
        <button type="button">Innen</button>
      </Sheet>
    );
    await flushFrames();
    const dialog = screen.getByRole("dialog", { name: "Aktenvorschau" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription("Details zur Akte");
  });

  it("setzt den initialen Fokus auf das erste fokussierbare Element", async () => {
    render(
      <Sheet open onClose={() => {}} title="Titel">
        <button type="button">Innen</button>
      </Sheet>
    );
    await flushFrames();
    // Erstes fokussierbares Element im Panel ist der Schließen-Button im Header.
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Schließen" }));
  });

  it("fokussiert das Panel selbst, wenn nichts fokussierbar ist", async () => {
    render(
      <Sheet open onClose={() => {}}>
        <p>Nur Text</p>
      </Sheet>
    );
    await flushFrames();
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
  });

  it("zyklisiert Tab / Shift+Tab innerhalb des Panels", async () => {
    render(
      <Sheet open onClose={() => {}} title="Titel">
        <button type="button">Erster</button>
        <button type="button">Letzter</button>
      </Sheet>
    );
    await flushFrames();
    const close = screen.getByRole("button", { name: "Schließen" });
    const last = screen.getByRole("button", { name: "Letzter" });

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);

    close.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("holt den Fokus zurück, wenn der Fokus das Panel verlassen hat", async () => {
    render(
      <>
        <button type="button">Außen</button>
        <Sheet open onClose={() => {}} title="Titel">
          <button type="button">Innen</button>
        </Sheet>
      </>
    );
    await flushFrames();
    screen.getByRole("button", { name: "Außen" }).focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Schließen" }));
  });

  it("gibt den Fokus beim Schließen an das auslösende Element zurück", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Öffnen
          </button>
          <Sheet open={open} onClose={() => setOpen(false)} title="Titel">
            <button type="button">Innen</button>
          </Sheet>
        </>
      );
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Öffnen" });
    trigger.focus();
    fireEvent.click(trigger);
    await flushFrames();
    expect(document.activeElement).not.toBe(trigger);

    fireEvent.keyDown(document, { key: "Escape" });
    await flushFrames();
    expect(document.activeElement).toBe(trigger);
  });
});
