/**
 * Reusable Zod validation helper for API routes.
 * Usage:
 *   const parsed = await validateRequest(req, loginSchema);
 *   if (!parsed.ok) return parsed.error;
 *   // parsed.data is typed
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-response";

export type ValidationResult<T> = { ok: true; data: T } | { ok: false; error: Response };

export async function validateRequest<T>(
  req: NextRequest,
  schema: z.ZodSchema<T>
): Promise<ValidationResult<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      error: apiError("invalid_json", "Request body is not valid JSON", 400),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      error: apiError("validation_failed", "Request body validation failed", 400, {
        issues: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      }),
    };
  }
  return { ok: true, data: result.data };
}

export function validateQuery<T>(
  searchParams: URLSearchParams,
  schema: z.ZodSchema<T>
): ValidationResult<T> {
  const params: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    params[key] = value;
  }
  const result = schema.safeParse(params);
  if (!result.success) {
    return {
      ok: false,
      error: apiError("validation_failed", "Query parameter validation failed", 400, {
        issues: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      }),
    };
  }
  return { ok: true, data: result.data };
}

// Common schemas
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
  remember: z.boolean().optional(),
});

// Password complexity: min 12 chars, at least 1 uppercase, 1 lowercase, 1 digit.
// This is enforced at signup and password reset. Login only checks non-empty
// (the stored hash is the source of truth for login validation).
export const passwordSchema = z
  .string()
  .min(12, "password_too_short")
  .max(200, "password_too_long")
  .regex(/[A-Z]/, "password_needs_uppercase")
  .regex(/[a-z]/, "password_needs_lowercase")
  .regex(/[0-9]/, "password_needs_digit");

export const signupSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  name: z.string().min(1).max(100).optional(),
  referralCode: z.string().optional(),
  locale: z.enum(["de", "en"]).optional(),
  industry: z.string().max(50).optional(),
});

export const registerSchema = signupSchema
  .extend({
    name: z.string().min(1).max(120),
    referredBy: z.string().optional(),
  })
  .omit({ locale: true, referralCode: true });

export const thinkSchema = z.object({
  query: z.string().min(1).max(10000),
  context: z.string().max(50000).optional(),
  citations: z.boolean().optional(),
  jurisdiction: z.enum(["de", "at", "ch", "eu"]).optional(),
});

export const uploadSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().max(100).optional(),
});
