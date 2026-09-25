// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import { defineConfig, globalIgnores } from "eslint/config";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = defineConfig([
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      // WCAG: enforce high-value jsx-a11y rules as errors (they are "warn" in
      // next/core-web-vitals). eslint-disable only with a documented reason.
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/no-static-element-interactions": "error",
      "jsx-a11y/no-noninteractive-element-interactions": "error",
      "jsx-a11y/no-noninteractive-element-to-interactive-role": "error",
      "jsx-a11y/interactive-supports-focus": "error",
      "jsx-a11y/aria-props": "error",
      "jsx-a11y/aria-unsupported-elements": "error",
      "jsx-a11y/role-has-required-aria-props": "error",
      "jsx-a11y/role-supports-aria-props": "error",
      "jsx-a11y/no-redundant-roles": "error",
      "jsx-a11y/anchor-is-valid": "error",
    },
  },
  // Server code logs through the structured logger (module + requestId, JSON
  // lines); console.* is only for browser code, tests and scripts.
  {
    files: ["src/app/api/**/*.ts", "src/lib/auth/**/*.ts", "src/lib/legal-graph/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: { "no-console": "error" },
  },
  // CSRF (audit UI-1): the middleware rejects every non-GET /api/* call from a
  // firm session without the x-csrf-token header. Raw fetch never sends it —
  // use csrfFetch (src/lib/csrf.ts) or api.*. Exempt paths mirror the
  // middleware: portal, auth entry points, anonymous public forms, presence.
  {
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    ignores: [
      "**/*.test.{ts,tsx}",
      "**/*.stories.{ts,tsx}",
      // Server code: calls the engine, never the browser-facing /api/*.
      "src/app/api/**",
      "src/app/_archive/**",
      // Session-less flows the middleware exempts (no CSRF cookie yet).
      "src/app/portal/**",
      "src/components/portal/**",
      "src/components/marketing/**",
      "src/components/auth/auth-form.tsx",
      "src/components/auth/recovery-form.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.name='fetch'][arguments.0.type='Literal'][arguments.0.value=/^\\x2Fapi\\x2F(?!portal\\x2F|concierge|intake\\x2Fpublic|booking\\x2Fpublic|demo\\x2Fsession|realtime\\x2Fpresence)/] > ObjectExpression > Property[key.name='method'][value.value=/^(post|put|patch|delete)$/i]",
          message:
            "Schreibende /api/-Aufrufe brauchen den CSRF-Header: csrfFetch (src/lib/csrf.ts) oder api.* statt fetch verwenden.",
        },
        {
          selector:
            "CallExpression[callee.name='fetch'][arguments.0.type='TemplateLiteral'][arguments.0.quasis.0.value.raw=/^\\x2Fapi\\x2F(?!portal\\x2F|concierge|intake\\x2Fpublic|booking\\x2Fpublic|demo\\x2Fsession|realtime\\x2Fpresence)/] > ObjectExpression > Property[key.name='method'][value.value=/^(post|put|patch|delete)$/i]",
          message:
            "Schreibende /api/-Aufrufe brauchen den CSRF-Header: csrfFetch (src/lib/csrf.ts) oder api.* statt fetch verwenden.",
        },
        {
          // `method` passed as a variable (e.g. `{ method, body }`): cannot be
          // proven read-only, so it needs csrfFetch as well.
          selector:
            "CallExpression[callee.name='fetch'][arguments.0.type='Literal'][arguments.0.value=/^\\x2Fapi\\x2F(?!portal\\x2F|concierge|intake\\x2Fpublic|booking\\x2Fpublic|demo\\x2Fsession|realtime\\x2Fpresence)/] > ObjectExpression > Property[key.name='method'][value.type='Identifier']",
          message:
            "Schreibende /api/-Aufrufe brauchen den CSRF-Header: csrfFetch (src/lib/csrf.ts) oder api.* statt fetch verwenden.",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-e2e/**",
    ".next-turbo/**",
    ".next-verify/**",
    ".kilo/**",
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
    "outlook-addin/dist/**",
    "word-addin/dist/**",
    ".claude/**",
    "scripts/**",
  ]),
]);

export default eslintConfig;
