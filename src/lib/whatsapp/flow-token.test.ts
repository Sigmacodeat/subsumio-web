// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFlowToken, verifyFlowToken } from "./flow-token";

describe("WhatsApp flow token", () => {
  beforeEach(() => {
    process.env.WHATSAPP_FLOW_TOKEN_SECRET = "secret-a";
  });
  afterEach(() => {
    delete process.env.WHATSAPP_FLOW_TOKEN_SECRET;
  });

  it("binds the token to the recipient and keeps the flow prefix", () => {
    const token = createFlowToken("appointment", "+43 1 234 5678")!;
    expect(token.split(":")[0]).toBe("appointment");
    expect(verifyFlowToken(token)).toEqual({ kind: "appointment", phone: "+4312345678" });
  });

  it("rejects tampered, foreign-key and expired tokens", () => {
    const token = createFlowToken("appointment", "+4312345678", 0)!;
    const [head, payload, sig] = token.split(".");
    const other = Buffer.from(JSON.stringify({ p: "+4399999999", e: 9e15 })).toString("base64url");
    expect(verifyFlowToken(`${head}.${other}.${sig}`, 0)).toBeNull();
    expect(verifyFlowToken(token, 0)).not.toBeNull();
    expect(verifyFlowToken(token, 15 * 86_400_000)).toBeNull();
    process.env.WHATSAPP_FLOW_TOKEN_SECRET = "secret-b";
    expect(verifyFlowToken(`${head}.${payload}.${sig}`, 0)).toBeNull();
  });

  it("mints nothing without a secret (the caller keeps its own token)", () => {
    delete process.env.WHATSAPP_FLOW_TOKEN_SECRET;
    const prev = process.env.WHATSAPP_APP_SECRET;
    delete process.env.WHATSAPP_APP_SECRET;
    expect(createFlowToken("appointment", "+4312345678")).toBeNull();
    if (prev !== undefined) process.env.WHATSAPP_APP_SECRET = prev;
  });
});
