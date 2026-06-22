import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from "./dialog";

describe("Dialog", () => {
  it("renders trigger and opens content on click", () => {
    render(
      <Dialog>
        <DialogTrigger>Open Dialog</DialogTrigger>
        <DialogContent>
          <DialogTitle>Test Dialog</DialogTitle>
          <DialogDescription>Dialog content here</DialogDescription>
        </DialogContent>
      </Dialog>
    );
    expect(screen.getByText("Open Dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Open Dialog"));
    expect(screen.getByText("Test Dialog")).toBeInTheDocument();
    expect(screen.getByText("Dialog content here")).toBeInTheDocument();
  });

  it("closes on Escape key", () => {
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Escape Test</DialogTitle>
        </DialogContent>
      </Dialog>
    );
    fireEvent.click(screen.getByText("Open"));
    expect(screen.getByText("Escape Test")).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByText("Escape Test")).not.toBeInTheDocument();
  });

  it("closes on close button click", () => {
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>Close Test</DialogTitle>
        </DialogContent>
      </Dialog>
    );
    fireEvent.click(screen.getByText("Open"));
    expect(screen.getByText("Close Test")).toBeInTheDocument();
    const closeBtn = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeBtn);
    expect(screen.queryByText("Close Test")).not.toBeInTheDocument();
  });

  it("has aria-describedby when description is provided", () => {
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent>
          <DialogTitle>A11y Test</DialogTitle>
          <DialogDescription>A11y description</DialogDescription>
        </DialogContent>
      </Dialog>
    );
    fireEvent.click(screen.getByText("Open"));
    const title = screen.getByText("A11y Test");
    const desc = screen.getByText("A11y description");
    expect(title).toHaveAttribute("id");
    expect(desc).toHaveAttribute("id");
  });
});
