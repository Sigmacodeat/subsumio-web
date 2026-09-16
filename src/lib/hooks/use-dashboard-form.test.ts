import { describe, test, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useDashboardForm } from "./use-dashboard-form";
import { z } from "zod";

const testSchema = z.object({
  name: z.string().min(1, "Name required"),
  email: z.string().email("Invalid email").or(z.literal("")),
});

describe("useDashboardForm", () => {
  test("initializes with default values", () => {
    const { result } = renderHook(() =>
      useDashboardForm({
        schema: testSchema,
        defaultValues: { name: "", email: "" },
        onSubmit: vi.fn(),
      })
    );
    expect(result.current.form.getValues()).toEqual({ name: "", email: "" });
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
  });

  test("validates on submit and shows errors", async () => {
    const { result } = renderHook(() =>
      useDashboardForm({
        schema: testSchema,
        defaultValues: { name: "", email: "" },
        onSubmit: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.handleSubmit();
    });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("Bitte korrigiere die markierten Felder.");
  });

  test("calls onSubmit with valid data", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useDashboardForm({
        schema: testSchema,
        defaultValues: { name: "Alice", email: "alice@test.com" },
        onSubmit,
      })
    );

    await act(async () => {
      await result.current.handleSubmit();
    });

    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(onSubmit).toHaveBeenCalledWith({ name: "Alice", email: "alice@test.com" });
  });

  test("catches submit errors and sets error state", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Network fail"));
    const { result } = renderHook(() =>
      useDashboardForm({
        schema: testSchema,
        defaultValues: { name: "Bob", email: "" },
        onSubmit,
      })
    );

    await act(async () => {
      await result.current.handleSubmit();
    });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("Network fail");
  });

  test("resetForm restores defaults and clears status", async () => {
    const { result } = renderHook(() =>
      useDashboardForm({
        schema: testSchema,
        defaultValues: { name: "Alice", email: "" },
        onSubmit: vi.fn(),
      })
    );

    act(() => {
      result.current.form.setValue("name", "Changed");
    });

    await act(async () => {
      await result.current.resetForm();
    });

    expect(result.current.form.getValues()).toEqual({ name: "Alice", email: "" });
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
  });
});

describe("useDashboardForm — re-entrancy", () => {
  test("a second submit while the first is in flight is ignored", async () => {
    const onSubmit = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useDashboardForm({
        schema: testSchema,
        defaultValues: { name: "Anna", email: "" },
        onSubmit,
      })
    );

    // Two submits in the same tick (double-click, Enter + click): the second
    // arrives while the first is still validating and must be dropped.
    await act(async () => {
      await Promise.all([result.current.handleSubmit(), result.current.handleSubmit()]);
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.status).toBe("success"));

    // After completion the form can be submitted again.
    await act(async () => {
      await result.current.handleSubmit();
    });
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });
});
