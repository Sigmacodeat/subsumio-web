import { describe, expect, it } from "vitest";
import { jsonOrThrow } from "./settings";

describe("jsonOrThrow", () => {
  it("returns the JSON body of a successful response", async () => {
    await expect(jsonOrThrow(Response.json({ success: true }))).resolves.toEqual({
      success: true,
    });
  });

  it("throws the server message on an error status instead of resolving", async () => {
    const res = Response.json(
      { error: "member_not_found", message: "Mitglied ist nicht in dieser Gruppe" },
      { status: 404 }
    );
    await expect(jsonOrThrow(res)).rejects.toThrow("Mitglied ist nicht in dieser Gruppe");
  });

  it("throws with the status when the error body is not JSON", async () => {
    await expect(jsonOrThrow(new Response("gateway", { status: 502 }))).rejects.toThrow("HTTP 502");
  });
});
