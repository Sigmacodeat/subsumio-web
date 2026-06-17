import { defineConfig, globalIgnores } from "eslint/config";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = defineConfig([
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".vercel/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "server/**",
    "legacy-admin/**",
    "evals/**",
    "tests/**",
    "examples/**",
    "tools/**",
    "recipes/**",
    "templates/**",
    "mobile/**",
    "law-corpus/**",
  ]),
]);

export default eslintConfig;
