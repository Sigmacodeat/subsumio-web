import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Link from "next/link";
import { Upload } from "lucide-react";
import { PrimaryAction } from "./primary-action";

describe("PrimaryAction", () => {
  it("renders the canonical plus icon and label", () => {
    const { container } = render(<PrimaryAction>Neue Akte</PrimaryAction>);
    const button = screen.getByRole("button", { name: "Neue Akte" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass("whitespace-nowrap");
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("supports a custom icon", () => {
    const { container } = render(
      <PrimaryAction icon={<Upload data-testid="upload-icon" size={15} aria-hidden="true" />}>
        Hochladen
      </PrimaryAction>
    );
    expect(container.querySelector("[data-testid='upload-icon']")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hochladen" })).toBeInTheDocument();
  });

  it("renders link content unchanged when asChild is used", () => {
    render(
      <PrimaryAction asChild>
        <Link href="/dashboard/cases/new">Neue Akte</Link>
      </PrimaryAction>
    );
    const link = screen.getByRole("link", { name: "Neue Akte" });
    expect(link).toHaveAttribute("href", "/dashboard/cases/new");
    expect(link).toHaveClass("whitespace-nowrap");
  });

  it("keeps disabled semantics and merges custom classes", () => {
    render(
      <PrimaryAction disabled className="custom-class">
        Speichern
      </PrimaryAction>
    );
    const button = screen.getByRole("button", { name: "Speichern" });
    expect(button).toBeDisabled();
    expect(button).toHaveClass("custom-class");
  });
});
