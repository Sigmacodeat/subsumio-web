import { describe, expect, it } from "vitest";
import { integrationReturnToast, withoutIntegrationReturn } from "./integration-return";

describe("integrationReturnToast (R8-18)", () => {
  it("maps the callback result to a toast", () => {
    expect(integrationReturnToast(new URLSearchParams("outlook=connected"))).toEqual({
      type: "success",
      title: "Outlook-Kalender verbunden",
    });
    expect(integrationReturnToast(new URLSearchParams("outlook=state_mismatch"))?.title).toMatch(
      /abgelaufen/
    );
    expect(integrationReturnToast(new URLSearchParams("docusign=denied"))?.type).toBe("error");
    expect(integrationReturnToast(new URLSearchParams("tab=kanzlei"))).toBeNull();
  });
  it("drops only the result parameters", () => {
    expect(withoutIntegrationReturn(new URLSearchParams("tab=kanzlei&outlook=connected"))).toBe(
      "?tab=kanzlei"
    );
  });
});
