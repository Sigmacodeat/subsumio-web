import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConfirmProvider, useConfirm } from "./confirm-dialog";
import { Button } from "./button";

function TestConsumer() {
  const confirm = useConfirm();
  return (
    <Button
      onClick={async () => {
        const ok = await confirm({ message: "Are you sure?", title: "Confirm Action" });
        if (ok) window.dispatchEvent(new CustomEvent("confirmed"));
        else window.dispatchEvent(new CustomEvent("cancelled"));
      }}
    >
      Delete
    </Button>
  );
}

describe("ConfirmDialog", () => {
  it("shows dialog when confirm is called", async () => {
    render(
      <ConfirmProvider>
        <TestConsumer />
      </ConfirmProvider>
    );
    fireEvent.click(screen.getByText("Delete"));
    expect(await screen.findByText("Confirm Action")).toBeInTheDocument();
    expect(screen.getByText("Are you sure?")).toBeInTheDocument();
  });

  it("resolves true when confirm button is clicked", async () => {
    const handler = vi.fn();
    window.addEventListener("confirmed", handler);
    render(
      <ConfirmProvider>
        <TestConsumer />
      </ConfirmProvider>
    );
    fireEvent.click(screen.getByText("Delete"));
    const confirmBtn = await screen.findByText("Bestätigen");
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(handler).toHaveBeenCalled());
    window.removeEventListener("confirmed", handler);
  });

  it("resolves false when cancel button is clicked", async () => {
    const handler = vi.fn();
    window.addEventListener("cancelled", handler);
    render(
      <ConfirmProvider>
        <TestConsumer />
      </ConfirmProvider>
    );
    fireEvent.click(screen.getByText("Delete"));
    const cancelBtn = await screen.findByText("Abbrechen");
    fireEvent.click(cancelBtn);
    await waitFor(() => expect(handler).toHaveBeenCalled());
    window.removeEventListener("cancelled", handler);
  });
});
