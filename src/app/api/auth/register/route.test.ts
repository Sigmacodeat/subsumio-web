// @vitest-environment node
/**
 * /api/auth/register is a legacy alias of /api/auth/signup — the audit found
 * a second, diverging signup implementation here (no verification mail, no
 * jurisdiction handling). The consolidation guarantee is reference identity:
 * both routes must export THE SAME handler so fixes cannot drift apart again.
 */
import { describe, expect, it } from "vitest";
import { POST as registerPOST } from "./route";
import { POST as signupPOST } from "../signup/route";

describe("POST /api/auth/register (alias)", () => {
  it("re-exports the signup handler — single source of truth", () => {
    expect(registerPOST).toBe(signupPOST);
  });
});
