import { describe, expect, it } from "vitest";
import { matterAccessLevel, type MatterPermissions } from "./matter-access";
import { matterAccessLevel as engineMatterAccessLevel } from "../../server/src/core/matter-access";

const NOW = Date.parse("2026-09-19T12:00:00Z");
const USERS = [
  { userId: "u-admin", role: "admin" },
  { userId: "u-lawyer", role: "lawyer" },
  { userId: "u-assistant", role: "assistant" },
  { userId: "u-client", role: "client_viewer" },
];
const CASES: MatterPermissions[] = [
  {},
  { blocked_users: ["u-admin"] },
  { visibility: "restricted", allowed_users: ["u-lawyer"] },
  { visibility: "confidential", allowed_users: ["u-assistant"] },
  { visibility: "confidential", grants: [{ user_id: "u-admin", level: "read" }] },
  {
    visibility: "restricted",
    grants: [
      { user_id: "u-assistant", level: "write", expires_at: "2026-09-18T00:00:00Z" },
      { user_id: "u-client", level: "write" },
    ],
  },
  { allowed_users: ["lawyer"], visibility: "restricted" },
];

describe("matter access rule", () => {
  it("gives the same answer in the web app and in the engine", () => {
    for (const user of USERS) {
      for (const perms of CASES) {
        expect(matterAccessLevel(user, perms, NOW), JSON.stringify({ user, perms })).toBe(
          engineMatterAccessLevel(user, perms, NOW)
        );
      }
    }
  });
});
