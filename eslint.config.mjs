import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // Legacy application code uses synchronous initial hydration in effects.
      // Track refactoring separately rather than changing wallet UI behavior
      // as part of a toolchain/security release.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      // TypeScript strict checking still runs in CI. Existing third-party ABI
      // structures need a dedicated, separately tested type refinement.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "**/*.test.ts",
    "**/*.test.tsx",
  ]),
]);
