import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Input } from "./input";

describe("Input", () => {
  it("renders with placeholder", () => {
    render(<Input placeholder="Enter text" />);
    expect(screen.getByPlaceholderText("Enter text")).toBeInTheDocument();
  });

  it("updates value on change", () => {
    render(<Input placeholder="Type here" />);
    const input = screen.getByPlaceholderText("Type here") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "hello" } });
    expect(input.value).toBe("hello");
  });

  it("is disabled when disabled prop is set", () => {
    render(<Input disabled placeholder="Disabled" />);
    expect(screen.getByPlaceholderText("Disabled")).toBeDisabled();
  });

  it("renders icon when provided", () => {
    render(<Input placeholder="With icon" icon={<span data-testid="icon">🔍</span>} />);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("supports type password", () => {
    render(<Input type="password" placeholder="Secret" />);
    const input = screen.getByPlaceholderText("Secret") as HTMLInputElement;
    expect(input.type).toBe("password");
  });
});
