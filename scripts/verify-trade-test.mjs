/**
 * Runs CrypyTradeTestV3 against a fee-on-transfer token and a Uniswap-v3-style pool in a local, in-memory EVM, and
 * checks that the fee is measured on the buy, on the transfer and when the pool rejects the sale (SellShort).
 * Real v3 pools can't be given such a token on mainnet, so this path is verified here.
 *
 * The tools are not project dependencies; install them in any folder and point TOOLS_DIR at it:
 *   npm i --prefix /tmp/tt solc@0.8.28 @ethereumjs/vm@8 @ethereumjs/common@4 @ethereumjs/util@9
 *   TOOLS_DIR=/tmp/tt node scripts/verify-trade-test.mjs
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { decodeFunctionResult, encodeFunctionData } from "viem";

const tools = createRequire(`${process.env.TOOLS_DIR ?? "."}/node_modules/`);
const solc = tools("solc");
const { VM } = tools("@ethereumjs/vm");
const { Common, Chain, Hardfork } = tools("@ethereumjs/common");
const { Account, Address, bytesToHex, hexToBytes } = tools("@ethereumjs/util");

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const out = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources: {
        "Mocks.sol": { content: read("contracts/security/test/TradeTestMocks.sol") },
        "T.sol": { content: read("contracts/security/CrypyTradeTestV3.sol") },
      },
      settings: {
        optimizer: { enabled: true, runs: 200 },
        viaIR: true,
        evmVersion: "paris",
        metadata: { bytecodeHash: "none" },
        outputSelection: { "*": { "*": ["evm.deployedBytecode.object", "abi"] } },
      },
    }),
  ),
);
if ((out.errors ?? []).some((e) => e.severity === "error")) throw new Error(JSON.stringify(out.errors));
const pick = (f, n) => ({ code: `0x${out.contracts[f][n].evm.deployedBytecode.object}`, abi: out.contracts[f][n].abi });
const weth = pick("Mocks.sol", "MockWETH");
const fot = pick("Mocks.sol", "MockFoT");
const pool = pick("Mocks.sol", "MockV3Pool");
const tester = pick("T.sol", "CrypyTradeTestV3");

const vm = await VM.create({ common: new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Shanghai }) });
const A = (n) => new Address(hexToBytes(`0x${n.toString(16).padStart(40, "0")}`));
const [WETH, FOT, POOL, TESTER, RECV, CALLER] = [0x1000, 0x2000, 0x3000, 0x7e57, 0xbeef, 0xcafe].map(A);
for (const [a, c] of [
  [WETH, weth],
  [FOT, fot],
  [POOL, pool],
]) {
  await vm.stateManager.putContractCode(a, hexToBytes(c.code));
}
await vm.stateManager.putAccount(TESTER, Account.fromAccountData({ balance: 10n ** 24n }));
await vm.stateManager.putContractCode(TESTER, hexToBytes(tester.code));
const call = async (to, abi, functionName, args) => {
  const data = encodeFunctionData({ abi, functionName, args });
  const r = await vm.evm.runCall({ to, caller: CALLER, origin: CALLER, data: hexToBytes(data), gasLimit: 30_000_000n });
  if (r.execResult.exceptionError) throw new Error(`${functionName} reverted`);
  return decodeFunctionResult({ abi, functionName, data: bytesToHex(r.execResult.returnValue) });
};
const s = (a) => a.toString();
await call(POOL, pool.abi, "init", [s(WETH), s(FOT)]);
await call(WETH, weth.abi, "mint", [s(POOL), 10n ** 30n]);
await call(FOT, fot.abi, "mint", [s(POOL), 10n ** 30n]);
const r = await call(TESTER, tester.abi, "run", [
  {
    kind: 1,
    router: s(A(0)),
    pool: s(POOL),
    token: s(FOT),
    quote: s(WETH),
    wrapped: s(WETH),
    hopRouter: s(A(0)),
    amountIn: 10n ** 18n,
    receiver: s(RECV),
  },
]);
const pct = (a, b) => Number(((b - a) * 10_000n) / b) / 100;
const checks = [
  ["buy fee 1%", pct(r.buyReceived, r.buyExpected) === 1],
  ["transfer fee 1%", pct(r.transferReceived, r.transferSent) === 1],
  ["sale rejected by the pool (failedAt 6)", r.failedAt === 6],
  ["fee measured on the rejected sale: 1%", pct(r.sellArrived, r.sellAmount) === 1],
];
for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);
