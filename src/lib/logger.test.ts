import { describe, test, expect, vi, afterEach } from "vitest";
import { logger, setRequestId, getRequestId } from "./logger";

describe("setRequestId / getRequestId", () => {
  afterEach(() => setRequestId(undefined));

  test("sets and gets request ID", () => {
    setRequestId("req-123");
    expect(getRequestId()).toBe("req-123");
  });

  test("defaults to undefined", () => {
    setRequestId(undefined);
    expect(getRequestId()).toBeUndefined();
  });

  test("overwrites previous value", () => {
    setRequestId("req-1");
    setRequestId("req-2");
    expect(getRequestId()).toBe("req-2");
  });
});

describe("logger", () => {
  const origLevel = process.env.LOG_LEVEL;

  afterEach(() => {
    process.env.LOG_LEVEL = origLevel;
    setRequestId(undefined);
  });

  test("returns object with debug, info, warn, error methods", () => {
    const log = logger("test-module");
    expect(typeof log.debug).toBe("function");
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
  });

  test("info writes JSON to stdout", () => {
    const log = logger("test");
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    log.info("test message", { key: "value" });
    expect(spy).toHaveBeenCalledOnce();
    const line = spy.mock.calls[0][0] as string;
    const entry = JSON.parse(line);
    expect(entry.level).toBe("info");
    expect(entry.module).toBe("test");
    expect(entry.msg).toBe("test message");
    expect(entry.key).toBe("value");
    expect(entry.ts).toBeDefined();
    spy.mockRestore();
  });

  test("error writes JSON to stderr", () => {
    const log = logger("test");
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    log.error("error message");
    expect(spy).toHaveBeenCalledOnce();
    const line = spy.mock.calls[0][0] as string;
    const entry = JSON.parse(line);
    expect(entry.level).toBe("error");
    spy.mockRestore();
  });

  test("includes requestId when set", () => {
    setRequestId("req-abc");
    const log = logger("test");
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    log.info("msg");
    const entry = JSON.parse(spy.mock.calls[0][0] as string);
    expect(entry.requestId).toBe("req-abc");
    spy.mockRestore();
  });

  test("omits requestId when not set", () => {
    setRequestId(undefined);
    const log = logger("test");
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    log.info("msg");
    const entry = JSON.parse(spy.mock.calls[0][0] as string);
    expect(entry.requestId).toBeUndefined();
    spy.mockRestore();
  });

  test("respects LOG_LEVEL=warn (suppresses info and debug)", () => {
    process.env.LOG_LEVEL = "warn";
    const log = logger("test");
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    log.info("should not appear");
    log.debug("should not appear");
    expect(stdoutSpy).not.toHaveBeenCalled();
    stdoutSpy.mockRestore();
  });

  test("LOG_LEVEL=error only allows error", () => {
    process.env.LOG_LEVEL = "error";
    const log = logger("test");
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    log.warn("should not appear");
    log.info("should not appear");
    log.error("should appear");
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalledOnce();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  test("LOG_LEVEL=debug allows all levels", () => {
    process.env.LOG_LEVEL = "debug";
    const log = logger("test");
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    log.debug("debug msg");
    log.info("info msg");
    log.warn("warn msg");
    expect(stdoutSpy).toHaveBeenCalledTimes(3);
    stdoutSpy.mockRestore();
  });

  test("handles missing meta gracefully", () => {
    const log = logger("test");
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    log.info("no meta");
    const entry = JSON.parse(spy.mock.calls[0][0] as string);
    expect(entry.msg).toBe("no meta");
    expect(entry.level).toBe("info");
    spy.mockRestore();
  });
});

describe("normalizeLogArgs (console-compatible arguments)", () => {
  test("string + object → meta", async () => {
    const { normalizeLogArgs } = await import("./logger");
    expect(normalizeLogArgs("saved", [{ caseSlug: "x" }])).toEqual({
      msg: "saved",
      meta: { caseSlug: "x" },
    });
  });
  test("string + Error → meta.error", async () => {
    const { normalizeLogArgs } = await import("./logger");
    const out = normalizeLogArgs("failed", [new Error("boom")]);
    expect(out.msg).toBe("failed");
    expect((out.meta?.error as { message: string }).message).toBe("boom");
  });
  test("Error as message → message text + stack meta", async () => {
    const { normalizeLogArgs } = await import("./logger");
    const out = normalizeLogArgs(new Error("kaputt"), []);
    expect(out.msg).toBe("kaputt");
    expect(out.meta?.error).toBeDefined();
  });
  test("several extra values → details[]", async () => {
    const { normalizeLogArgs } = await import("./logger");
    expect(normalizeLogArgs("x", [1, "y"])).toEqual({ msg: "x", meta: { details: [1, "y"] } });
  });
});

describe("redaction", () => {
  test("secret-named string fields, credentials and e-mails never reach the log line", () => {
    const log = logger("test");
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    log.info("mail to alice-example@example.at failed", {
      password: "hunter2",
      apiKey: "sk-live-123",
      headers: { Authorization: "Bearer abc.def", cookie: "sb_session=s" },
      note: "Authorization: Bearer xyz.123",
      inputTokens: 1234,
      caseSlug: "legal/case-1",
    });
    const line = spy.mock.calls[0][0] as string;
    spy.mockRestore();
    expect(line).not.toContain("hunter2");
    expect(line).not.toContain("sk-live-123");
    expect(line).not.toContain("abc.def");
    expect(line).not.toContain("xyz.123");
    expect(line).not.toContain("sb_session=s");
    expect(line).not.toContain("alice-example@");
    const entry = JSON.parse(line);
    expect(entry.msg).toBe("mail to a***@example.at failed");
    expect(entry.password).toBe("[redacted]");
    expect(entry.inputTokens).toBe(1234); // counts stay
    expect(entry.caseSlug).toBe("legal/case-1");
  });

  test("error stacks stay readable", async () => {
    const { redactLogValue } = await import("./logger");
    const out = redactLogValue({
      error: { message: "x", stack: "Error: x\n    at f (/app/a.ts:1:1)" },
    }) as {
      error: { stack: string };
    };
    expect(out.error.stack).toContain("/app/a.ts:1:1");
  });
});
