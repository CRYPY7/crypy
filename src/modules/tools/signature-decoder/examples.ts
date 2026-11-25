/** Example requests for the decoder (public test data: well-known contracts, made-up spender and nonce). */
const owner = "0x1111111111111111111111111111111111111111";
const stranger = "0x5a0b54d5dc17e0aadc383d2db43b0a0d3e029c4c";

export const examplePermit = JSON.stringify(
  {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Permit",
    domain: {
      name: "USD Coin",
      version: "2",
      chainId: 1,
      verifyingContract: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    },
    message: {
      owner,
      spender: stranger,
      value: "115792089237316195423570985008687907853269984665640564039457584007913129639935",
      nonce: "0",
      deadline: "1999999999",
    },
  },
  null,
  2,
);

export const examplePermit2 = JSON.stringify(
  {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      PermitSingle: [
        { name: "details", type: "PermitDetails" },
        { name: "spender", type: "address" },
        { name: "sigDeadline", type: "uint256" },
      ],
      PermitDetails: [
        { name: "token", type: "address" },
        { name: "amount", type: "uint160" },
        { name: "expiration", type: "uint48" },
        { name: "nonce", type: "uint48" },
      ],
    },
    primaryType: "PermitSingle",
    domain: { name: "Permit2", chainId: 56, verifyingContract: "0x000000000022D473030F116dDEE9F6B43aC78BA3" },
    message: {
      details: {
        token: "0x55d398326f99059fF775485246999027B3197955",
        amount: "250000000000000000000",
        expiration: "1798761600",
        nonce: "3",
      },
      spender: "0x1111111254EEB25477B68fb85Ed929f73A960582",
      sigDeadline: "1798761600",
    },
  },
  null,
  2,
);

export const exampleMessage = "Sign in to example.org\n\nNonce: 8f3a2c\nIssued At: 2026-11-24T10:00:00Z";
