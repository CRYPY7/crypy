import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import i18next from "eslint-plugin-i18next";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Every visible text must come from /messages so it can be translated.
    files: ["src/app/**/*.tsx", "src/components/**/*.tsx"],
    ignores: ["src/components/ui/**"],
    plugins: { i18next },
    rules: {
      "i18next/no-literal-string": [
        "error",
        { mode: "jsx-text-only", "jsx-attributes": { include: ["aria-label", "title", "placeholder", "alt"] } },
      ],
    },
  },
  {
    // Never read secrets from browser code.
    files: ["src/components/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^(?!NEXT_PUBLIC_)/]",
          message: "Only NEXT_PUBLIC_ variables may be used in components.",
        },
      ],
    },
  },
  {
    // CRYPY never asks for signatures or transactions without a reviewed, explicit user flow (M6+).
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "wagmi",
              importNames: [
                "useSignMessage",
                "useSignTypedData",
                "useSendTransaction",
                "useWriteContract",
                "useSendCalls",
              ],
              message: "Signing and transactions need a reviewed user flow (see ARCHITECTURE.md §10).",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "playwright-report/**", "test-results/**"]),
]);

export default eslintConfig;
