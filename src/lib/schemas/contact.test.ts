// @vitest-environment node

import { describe, test, expect } from "vitest";
import { contactFormSchema, contactRoleSchema } from "./contact";

describe("contactRoleSchema", () => {
  test("accepts valid roles", () => {
    expect(contactRoleSchema.safeParse("client").success).toBe(true);
    expect(contactRoleSchema.safeParse("lawyer").success).toBe(true);
    expect(contactRoleSchema.safeParse("court").success).toBe(true);
  });

  test("rejects invalid role", () => {
    expect(contactRoleSchema.safeParse("vendor").success).toBe(false);
  });
});

describe("contactFormSchema", () => {
  test("accepts valid contact", () => {
    const result = contactFormSchema.safeParse({
      name: "Max Mustermann",
      role: "client",
      email: "max@example.com",
    });
    expect(result.success).toBe(true);
  });

  test("accepts empty email", () => {
    const result = contactFormSchema.safeParse({
      name: "Max Mustermann",
      role: "client",
      email: "",
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid email", () => {
    const result = contactFormSchema.safeParse({
      name: "Max Mustermann",
      role: "client",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty name", () => {
    const result = contactFormSchema.safeParse({
      name: "",
      role: "client",
    });
    expect(result.success).toBe(false);
  });
});
