import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SignaturePad } from "./signature-pad";

describe("SignaturePad", () => {
  it("renders draw tab as default", () => {
    render(<SignaturePad />);
    expect(screen.getByRole("tab", { name: /zeichnen/i })).toHaveAttribute(
      "data-state",
      "active"
    );
  });

  it("renders canvas with correct aria-label", () => {
    render(<SignaturePad canvasAriaLabel="My Signature Field" />);
    expect(screen.getByRole("img", { name: /my signature field/i })).toBeInTheDocument();
  });

  it("shows empty placeholder text when no signature drawn", () => {
    render(<SignaturePad />);
    expect(screen.getByText(/hier unterschreiben/i)).toBeInTheDocument();
  });

  it("clear button is disabled when empty", () => {
    render(<SignaturePad />);
    expect(screen.getByRole("button", { name: /signatur löschen/i })).toBeDisabled();
  });

  it("switches to type mode and emits typed name", () => {
    const handleChange = vi.fn();
    render(<SignaturePad onChange={handleChange} defaultMode="type" />);
    const input = screen.getByPlaceholderText(/vor- und nachname/i);
    fireEvent.change(input, { target: { value: "Max Mustermann" } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        dataUrl: "Max Mustermann",
        mode: "type",
        empty: false,
      })
    );
  });

  it("emits empty=true when typed name is blank", () => {
    const handleChange = vi.fn();
    render(<SignaturePad onChange={handleChange} defaultMode="type" />);
    const input = screen.getByPlaceholderText(/vor- und nachname/i);
    fireEvent.change(input, { target: { value: "" } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ empty: true })
    );
  });

  it("has sr-only status region for screen readers", () => {
    render(<SignaturePad />);
    const status = screen.getByRole("status");
    expect(status).toHaveClass("sr-only");
    expect(status).toHaveTextContent(/signatur ist leer/i);
  });

  it("has sr-only instructions for screen readers", () => {
    render(<SignaturePad instructions="Custom instructions here" />);
    expect(screen.getByText("Custom instructions here")).toHaveClass("sr-only");
  });

  it("canvas has tabIndex=0 for keyboard focus", () => {
    render(<SignaturePad />);
    const canvas = screen.getByRole("img");
    expect(canvas).toHaveAttribute("tabindex", "0");
  });

  it("clear button has aria-label", () => {
    render(<SignaturePad />);
    expect(screen.getByRole("button", { name: /signatur löschen/i })).toBeInTheDocument();
  });

  it("disables all inputs when disabled prop is set", () => {
    render(<SignaturePad disabled />);
    expect(screen.getByRole("tab", { name: /zeichnen/i })).toBeDisabled();
    expect(screen.getByRole("tab", { name: /namen tippen/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /signatur löschen/i })).toBeDisabled();
  });
});
