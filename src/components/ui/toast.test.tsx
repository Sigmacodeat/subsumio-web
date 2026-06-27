import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ToastProvider, useToast } from "./toast";
import { Button } from "./button";

function ToastTrigger() {
  const { addToast } = useToast();
  return (
    <Button onClick={() => addToast({ title: "Success", description: "Saved!", type: "success" })}>
      Show Toast
    </Button>
  );
}

describe("Toast", () => {
  it("renders toast when addToast is called", async () => {
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("Show Toast"));
    expect(await screen.findByText("Success")).toBeInTheDocument();
    expect(screen.getByText("Saved!")).toBeInTheDocument();
  });

  it("auto-dismisses after duration", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("Show Toast"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.getByText("Success")).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await waitFor(
      () => {
        expect(screen.queryByText("Success")).not.toBeInTheDocument();
      },
      { timeout: 2000 }
    );
    vi.useRealTimers();
  });

  it("can be manually dismissed via close button", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("Show Toast"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(screen.getByText("Success")).toBeInTheDocument();
    const closeBtn = screen.getByRole("button", { name: /benachrichtigung schließen/i });
    fireEvent.click(closeBtn);
    await waitFor(
      () => {
        expect(screen.queryByText("Success")).not.toBeInTheDocument();
      },
      { timeout: 2000 }
    );
    vi.useRealTimers();
  });

  it("throws when useToast is used outside provider", () => {
    function NoProvider() {
      useToast();
      return null;
    }
    expect(() => render(<NoProvider />)).toThrow("useToast must be used within ToastProvider");
  });
});
