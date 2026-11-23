import { keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * The admin wallet for browser tests: a throwaway key derived from a fixed text, so the test server can list its
 * address in ADMIN_WALLETS before the tests start. Test-only; it never holds funds and is never used anywhere else.
 */
export const ADMIN_TEST_KEY = keccak256(toHex("crypy e2e admin wallet - test only, never funded"));
export const ADMIN_TEST_ADDRESS = privateKeyToAccount(ADMIN_TEST_KEY).address;
