import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
  it("renders a div with animate-pulse class", () => {
    const { container } = render(<Skeleton className="h-3 w-12" />);
    const el = container.querySelector("div");
    expect(el).not.toBeNull();
    expect(el).toHaveClass("animate-pulse");
  });

  it("respects prefers-reduced-motion via motion-reduce class", () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelector("div")).toHaveClass("motion-reduce:animate-none");
  });

  it("is hidden from screen readers (aria-hidden)", () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelector("div")).toHaveAttribute("aria-hidden", "true");
  });

  it("applies custom className", () => {
    const { container } = render(<Skeleton className="h-4 w-20 rounded-full" />);
    const el = container.querySelector("div");
    expect(el).toHaveClass("h-4", "w-20", "rounded-full");
  });

  it("uses design-system surface token for dark-mode consistency", () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelector("div")).toHaveClass("bg-[color:var(--ds-surface-2)]");
  });
});
