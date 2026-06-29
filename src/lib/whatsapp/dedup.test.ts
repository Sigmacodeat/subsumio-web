// @vitest-environment node

import { describe, test, expect } from "vitest";
import { isMessageProcessed, markMessageProcessed } from "./dedup";

describe("whatsapp dedup", () => {
  test("new message is not processed", async () => {
    const result = await isMessageProcessed("msg-new-1");
    expect(result).toBe(false);
  });

  test("marked message is processed", async () => {
    await markMessageProcessed("msg-1", "hash-1", "text", "delivered");
    const result = await isMessageProcessed("msg-1");
    expect(result).toBe(true);
  });

  test("different messages are not processed", async () => {
    await markMessageProcessed("msg-2");
    const result = await isMessageProcessed("msg-3");
    expect(result).toBe(false);
  });
});
