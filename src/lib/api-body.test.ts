import { describe, expect, it } from "vitest";
import { unwrapApiBody } from "./api-body";

describe("unwrapApiBody", () => {
  it("unwraps apiSuccess object payloads and marks them ok", () => {
    expect(unwrapApiBody({ data: { items: [1] } })).toEqual({ items: [1], ok: true });
  });

  it("returns array payloads as-is", () => {
    expect(unwrapApiBody({ data: [1, 2] })).toEqual([1, 2]);
  });

  it("leaves error bodies untouched", () => {
    const err = { error: "Nope", code: "forbidden" };
    expect(unwrapApiBody(err)).toBe(err);
  });

  it("leaves unwrapped legacy responses untouched", () => {
    const legacy = { ok: true, url: "/x" };
    expect(unwrapApiBody(legacy)).toBe(legacy);
  });
});
