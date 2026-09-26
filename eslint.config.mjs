import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import useServerExportsOnlyAsyncFunctions from "./eslint-rules/use-server-exports-only-async-functions.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // A 'use server' file may export only async functions. Next.js enforces
  // this at module evaluation — when an action is first invoked — so neither
  // `next build` nor the test suite catches a violation. One such export took
  // every server action on the setup route down in production on 26 Sep 2026
  // behind an entirely green build. See the rule's own header.
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      local: { rules: { "use-server-exports-only-async-functions": useServerExportsOnlyAsyncFunctions } },
    },
    rules: { "local/use-server-exports-only-async-functions": "error" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
