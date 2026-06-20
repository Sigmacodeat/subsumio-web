import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
  it("renders unchecked by default", () => {
    render(<Checkbox aria-label="Agree" />);
    const checkbox = screen.getByRole("checkbox", { name: "Agree" });
    expect(checkbox).toHaveAttribute("data-state", "unchecked");
  });

  it("toggles on click", () => {
    render(<Checkbox aria-label="Toggle" />);
    const checkbox = screen.getByRole("checkbox", { name: "Toggle" });
    fireEvent.click(checkbox);
    expect(checkbox).toHaveAttribute("data-state", "checked");
    fireEvent.click(checkbox);
    expect(checkbox).toHaveAttribute("data-state", "unchecked");
  });

  it("calls onCheckedChange when toggled", () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox aria-label="Callback" onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Callback" }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("is disabled when disabled prop is set", () => {
    render(<Checkbox disabled aria-label="Disabled" />);
    expect(screen.getByRole("checkbox", { name: "Disabled" })).toBeDisabled();
  });

  it("renders as checked when defaultChecked", () => {
    render(<Checkbox defaultChecked aria-label="Pre-checked" />);
    const checkbox = screen.getByRole("checkbox", { name: "Pre-checked" });
    expect(checkbox).toHaveAttribute("data-state", "checked");
  });
});
