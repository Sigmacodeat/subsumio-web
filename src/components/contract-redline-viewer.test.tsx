import { describe, test, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ContractRedlineViewer } from "./contract-redline-viewer";

vi.mock("@/lib/api", () => ({
  api: {
    legal: {
      contractRedline: vi.fn(async () => ({ redline: "" })),
    },
  },
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ addToast: vi.fn() }),
}));

describe("ContractRedlineViewer", () => {
  test("renders header with title", () => {
    render(<ContractRedlineViewer originalText="test" />);
    expect(screen.getByText("Contract Redline")).toBeDefined();
  });

  test("shows empty state when no analysis has been run", () => {
    render(<ContractRedlineViewer originalText="test contract text" />);
    expect(screen.getByText("Redline starten")).toBeDefined();
  });

  test("disables run button when originalText is empty", () => {
    render(<ContractRedlineViewer originalText="" />);
    const button = screen.getByText("Redline starten").closest("button");
    expect(button?.disabled).toBe(true);
  });

  test("enables run button when originalText has content", () => {
    render(<ContractRedlineViewer originalText="some contract" />);
    const button = screen.getByText("Redline starten").closest("button");
    expect(button?.disabled).toBe(false);
  });

  test("shows perspective selector with three options", () => {
    render(<ContractRedlineViewer originalText="test" />);
    expect(screen.getByText("Mandantenperspektive")).toBeDefined();
    expect(screen.getByText("Gegenseite")).toBeDefined();
    expect(screen.getByText("Neutral")).toBeDefined();
  });

  test("renders close button when onClose provided", () => {
    const onClose = vi.fn();
    render(<ContractRedlineViewer originalText="test" onClose={onClose} />);
    const closeBtn = screen.getByLabelText("Schließen");
    expect(closeBtn).toBeDefined();
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("shows contract type in subtitle when provided", () => {
    render(<ContractRedlineViewer originalText="test" contractType="Kaufvertrag" />);
    expect(screen.getByText(/Kaufvertrag/)).toBeDefined();
  });
});
