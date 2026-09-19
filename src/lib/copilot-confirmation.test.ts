import { describe, expect, it } from "vitest";
import {
  CONFIRMED_TOOLS,
  consumeToolConfirmation,
  createToolConfirmation,
} from "./copilot-confirmation";
import { DESTRUCTIVE_TOOLS } from "@/components/chat/chat-types";

const params = { title: "Müller gegen Maier", client_name: "Müller" };

describe("copilot confirmation", () => {
  it("covers exactly the tools the chat asks the person to confirm", () => {
    expect([...CONFIRMED_TOOLS].sort()).toEqual([...DESTRUCTIVE_TOOLS].sort());
  });

  it("runs once, for the same person, tool and parameters", () => {
    const { token } = createToolConfirmation("u-1", "create_case", params);
    const reordered = { client_name: "Müller", title: "Müller gegen Maier" };
    expect(consumeToolConfirmation(token, "u-1", "create_case", reordered)).toEqual({ ok: true });
    expect(consumeToolConfirmation(token, "u-1", "create_case", params)).toEqual({
      ok: false,
      reason: "used",
    });
  });

  it("refuses other parameters, another person, another tool, and no token", () => {
    const { token } = createToolConfirmation("u-1", "create_case", params);
    expect(consumeToolConfirmation(token, "u-1", "create_case", { ...params, title: "X" }).ok).toBe(
      false
    );
    expect(consumeToolConfirmation(token, "u-2", "create_case", params).ok).toBe(false);
    expect(consumeToolConfirmation(token, "u-1", "intake_create", params).ok).toBe(false);
    expect(consumeToolConfirmation(undefined, "u-1", "create_case", params)).toEqual({
      ok: false,
      reason: "missing",
    });
  });

  it("refuses a tampered or expired token", () => {
    const { token } = createToolConfirmation(
      "u-1",
      "create_case",
      params,
      Date.parse("2026-09-19T10:00:00Z")
    );
    expect(consumeToolConfirmation(`${token}x`, "u-1", "create_case", params).ok).toBe(false);
    expect(
      consumeToolConfirmation(
        token,
        "u-1",
        "create_case",
        params,
        Date.parse("2026-09-19T10:11:00Z")
      )
    ).toEqual({ ok: false, reason: "expired" });
  });
});
