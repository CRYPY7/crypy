import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import i18next from "eslint-plugin-i18next";

/** Wallet actions that sign or send. Allowed only in the reviewed revoke runner. */
const signingActions = [
  "sendTransaction",
  "sendCalls",
  "writeContract",
  "signMessage",
  "signTypedData",
  "deployContract",
  "sendTransactionSync",
  "writeContractSync",
  "sendCallsSync",
];

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
            ...["wagmi/actions", "@wagmi/core"].map((name) => ({
              name,
              importNames: signingActions,
              message: "Only src/wallets/evm/revoke-runner.ts may ask the wallet to send (reviewed in M6).",
            })),
          ],
        },
      ],
    },
  },
  {
    // The reviewed revoke flow: may send zeroing revoke transactions only (checked by revoke.ts).
    files: ["src/wallets/evm/revoke-runner.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  {
    // The reviewed sign-in flow (M8): may ask for a message signature (signMessage) on CRYPY's sign-in text, nothing else.
    files: ["src/wallets/evm/sign-in-runner.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        ...["wagmi/actions", "@wagmi/core"].map((name) => ({
          name,
          importNames: signingActions.filter((action) => action !== "signMessage"),
          message: "The sign-in runner may only ask for a message signature.",
        })),
      ],
    },
  },
  globalIgnores([
    ".next/**",
    ".next-a/**",
    ".next-b/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
