/**
 * Compiles contracts/security/CrypyTradeTestV2.sol and prints its runtime bytecode.
 * The compiler is not a project dependency; run it on demand:
 *   npx -y -p solc@0.8.28 node scripts/build-trade-test.mjs
 * Paste the output into src/server/chains/evm/security/trade-test-v2.ts (RUNTIME_V2).
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const solc = require(process.env.SOLC_PATH ?? "solc");
const source = readFileSync(new URL("../contracts/security/CrypyTradeTestV2.sol", import.meta.url), "utf8");
const input = {
  language: "Solidity",
  sources: { "CrypyTradeTestV2.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    evmVersion: "paris",
    metadata: { bytecodeHash: "none" },
    outputSelection: { "*": { "*": ["evm.deployedBytecode.object", "abi"] } },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors ?? []).filter((e) => e.severity === "error");
if (errors.length) {
  console.error(errors.map((e) => e.formattedMessage).join("\n"));
  process.exit(1);
}
const contract = output.contracts["CrypyTradeTestV2.sol"].CrypyTradeTestV2;
console.log(`0x${contract.evm.deployedBytecode.object}`);
