// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import { defineConfig, globalIgnores } from "eslint/config";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

// CSRF exempt-path lookahead, kept in ONE place and interpolated into all
// three selectors below — mirrors middleware.ts's full allowlist (the
// prefix checks, API_CSRF_EXEMPT_PATHS and WEBHOOK_CSRF_EXEMPT_PREFIXES) so
// the lint guard recognizes an exempt path wherever it's called from, not
// only from the two files currently excluded by filename below.
const CSRF_EXEMPT_LOOKAHEAD =
  "portal\\x2F|concierge|intake\\x2Fpublic|booking\\x2Fpublic|demo\\x2Fsession|" +
  "realtime\\x2Fpresence|auth\\x2F(?:login|signup|register|forgot|reset|2fa\\x2Flogin-verify)|" +
  "cron\\x2F|billing\\x2F(?:pipeline-reserve|pipeline-settle|webhook)|" +
  "whatsapp\\x2F(?:webhook|flow-endpoint)|email\\x2Fwebhook\\x2Fresend|webhooks\\x2Fresend|" +
  "docusign\\x2Fwebhook|rciid\\x2Fwebhook|webhook\\x2F|cti\\x2Fwebhook";

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
          selector: `CallExpression[callee.name='fetch'][arguments.0.type='Literal'][arguments.0.value=/^\\x2Fapi\\x2F(?!${CSRF_EXEMPT_LOOKAHEAD})/] > ObjectExpression > Property[key.name='method'][value.value=/^(post|put|patch|delete)$/i]`,
          message:
            "Schreibende /api/-Aufrufe brauchen den CSRF-Header: csrfFetch (src/lib/csrf.ts) oder api.* statt fetch verwenden.",
        },
        {
          selector: `CallExpression[callee.name='fetch'][arguments.0.type='TemplateLiteral'][arguments.0.quasis.0.value.raw=/^\\x2Fapi\\x2F(?!${CSRF_EXEMPT_LOOKAHEAD})/] > ObjectExpression > Property[key.name='method'][value.value=/^(post|put|patch|delete)$/i]`,
          message:
            "Schreibende /api/-Aufrufe brauchen den CSRF-Header: csrfFetch (src/lib/csrf.ts) oder api.* statt fetch verwenden.",
        },
        {
          // `method` passed as a variable (e.g. `{ method, body }`): cannot be
          // proven read-only, so it needs csrfFetch as well.
          selector: `CallExpression[callee.name='fetch'][arguments.0.type='Literal'][arguments.0.value=/^\\x2Fapi\\x2F(?!${CSRF_EXEMPT_LOOKAHEAD})/] > ObjectExpression > Property[key.name='method'][value.type='Identifier']`,
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
    // Built Office add-in bundles (scripts/build-office-addins.ts) and their
    // copies in the native app shells — generated output, not source.
    "public/*-addin/**",
    "android/**",
    "ios/**",
    ".claude/**",
    "scripts/**",
  ]),
]);

export default eslintConfig;
