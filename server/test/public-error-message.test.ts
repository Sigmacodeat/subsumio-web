import { describe, test, expect } from "bun:test";
import {
  publicErrorMessage,
  GENERIC_WRITE_FAILURE_MESSAGE,
} from "../src/core/public-error-message.ts";

describe("publicErrorMessage", () => {
  test("redacts a raw OpenRouter billing error", () => {
    const raw =
      "[embed(openrouter:openai/text-embedding-3-small)] Insufficient credits. Add more using https://openrouter.ai/settings/credits";
    expect(publicErrorMessage(raw)).toBe(GENERIC_WRITE_FAILURE_MESSAGE);
  });

  test("redacts a raw provider/API-key error", () => {
    expect(publicErrorMessage("Anthropic API key revoked")).toBe(GENERIC_WRITE_FAILURE_MESSAGE);
  });

  test("passes through an ordinary validation message unchanged", () => {
    expect(publicErrorMessage("Slug already exists")).toBe("Slug already exists");
  });
});
