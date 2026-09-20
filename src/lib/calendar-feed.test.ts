import { describe, it, expect } from "vitest";
import {
  buildFeedToken,
  createFeedSecret,
  feedUrl,
  hashFeedSecret,
  parseFeedToken,
  secretsMatch,
} from "@/lib/calendar-feed";

describe("calendar feed token", () => {
  it("round-trips user id and secret", () => {
    const secret = createFeedSecret();
    const parsed = parseFeedToken(buildFeedToken("user-42", secret));
    expect(parsed).toEqual({ userId: "user-42", secret });
  });

  it("makes a 64 hex character secret", () => {
    expect(createFeedSecret()).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects anything that is not a token", () => {
    expect(parseFeedToken("")).toBeNull();
    expect(parseFeedToken("nodot")).toBeNull();
    expect(parseFeedToken(".secret")).toBeNull();
    expect(parseFeedToken("user-42.")).toBeNull();
    expect(parseFeedToken("user-42.zzzz")).toBeNull();
    expect(parseFeedToken("../../etc.abcdef0123456789abcdef0123456789")).toBeNull();
  });

  it("stores only the hash, and the hash identifies the secret", async () => {
    const secret = createFeedSecret();
    const hash = await hashFeedSecret(secret);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(secret);
    expect(await hashFeedSecret(secret)).toBe(hash);
    expect(await hashFeedSecret(createFeedSecret())).not.toBe(hash);
  });

  it("compares hashes without tripping over length or nulls", () => {
    expect(secretsMatch("abcd", "abcd")).toBe(true);
    expect(secretsMatch("abcd", "abce")).toBe(false);
    expect(secretsMatch("abcd", "abcde")).toBe(false);
    expect(secretsMatch(null, "abcd")).toBe(false);
    expect(secretsMatch("abcd", undefined)).toBe(false);
  });

  it("builds a subscribable URL", () => {
    const url = feedUrl("https://app.subsum.io/", "user-42.abc");
    expect(url).toBe("https://app.subsum.io/api/calendar/user-42.abc/fristen.ics");
  });
});
