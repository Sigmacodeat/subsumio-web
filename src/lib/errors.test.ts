// P0-INFRA-003: error-handling contract.
// Locks the AppError hierarchy, isAppError type guard, status-code mapping
// and the safe errorResponse serializer the central API handlers rely on.

import { describe, expect, it } from "vitest";
import {
  AppError,
  AuthError,
  ForbiddenError,
  LegalDeadlineError,
  QuotaExceededError,
  ValidationError,
  DocusignError,
  isAppError,
  errorResponse,
} from "@/lib/errors";

describe("AppError", () => {
  it("carries code, details and default 500 status", () => {
    const err = new AppError("boom", { code: "BOOM", details: { x: 1 } });
    expect(err.code).toBe("BOOM");
    expect(err.statusCode).toBe(500);
    expect(err.details).toEqual({ x: 1 });
    expect(err.name).toBe("AppError");
  });

  it("serializes to a safe JSON shape", () => {
    const err = new AppError("boom", { code: "BOOM", details: { x: 1 } });
    expect(err.toJSON()).toEqual({
      name: "AppError",
      code: "BOOM",
      message: "boom",
      details: { x: 1 },
    });
  });

  it("preserves the cause when provided", () => {
    const cause = new Error("root");
    const err = new AppError("wrap", { code: "WRAP", cause });
    expect(err.cause).toBe(cause);
  });
});

describe("domain subclasses map to correct status codes", () => {
  const cases: Array<[AppError, number]> = [
    [new AuthError("a", { code: "A" }), 401],
    [new ForbiddenError("f", { code: "F" }), 403],
    [new LegalDeadlineError("d", { code: "D" }), 400],
    [new ValidationError("v", { code: "V" }), 422],
    [new QuotaExceededError("q", { code: "Q" }), 429],
    [new DocusignError("ds", { code: "DS" }), 502],
  ];
  it.each(cases)("%s → status", (err, status) => {
    expect(err.statusCode).toBe(status);
    expect(isAppError(err)).toBe(true);
  });
});

describe("isAppError", () => {
  it("returns false for plain errors and non-errors", () => {
    expect(isAppError(new Error("plain"))).toBe(false);
    expect(isAppError("string")).toBe(false);
    expect(isAppError(null)).toBe(false);
  });
});

describe("errorResponse", () => {
  it("exposes code/message/details for AppError", () => {
    const err = new ValidationError("bad", { code: "BAD_INPUT", details: { field: "email" } });
    expect(errorResponse(err)).toEqual({
      error: "ValidationError",
      code: "BAD_INPUT",
      message: "bad",
      details: { field: "email" },
    });
  });

  it("never leaks internals for unknown errors", () => {
    const res = errorResponse(new Error("stacktrace-y detail"));
    expect(res.code).toBe("INTERNAL");
    expect(res.error).toBe("InternalError");
  });
});
