# CRYPY — Feature registry

The full registry is the Sheet **"CRYPY — Feature registry"** (https://claude.ai/artifact/C3afuuDuXpCkVVvFsTYADW):
the 291 tools of the owner's "Web3 Tool Decision Catalog" (2026-11-24), each with where it runs, its status in
CRYPY, what already covers it, priority and the owner's decision. The catalog is the long-term backlog, not
permission to build everything: only rows marked **Approved for development** are built, one batch at a time.

## Statuses (2026-11-24, after U2)

| Status                       | Count | Meaning                                                                                  |
| ---------------------------- | ----- | ---------------------------------------------------------------------------------------- |
| Existing / Verified          | 78    | Live in CRYPY and covered by automated tests                                             |
| Existing / Needs improvement | 35    | Partly there (e.g. EVM only, known ABIs only, no standalone tool)                        |
| Approved for development     | 8     | Utilities batches U1–U3 and the signature decoder                                        |
| Planned                      | 45    | Worth doing; not scheduled                                                               |
| Deferred                     | 120   | Needs the indexer (M5.5 Stage 2), always-on workers or a new chain family                |
| Rejected                     | 5     | Tax classification, address risk context, wallet clusters, cross-chain flows, NFT floors |

## Utilities track (owner decision 2026-11-24)

Browser-only tools may be built during stabilization, alternating with S3–S5 work, because they run on the
visitor's device and touch no provider, server or stored data. Anything that needs RPC or the server waits for S6.

- **U1 (Batch 1), built 2026-11-24:** token decimals mode in the Unit Converter; manual fee calculator on the Gas Tracker; Token
  Supply & Valuation calculator; APR/APY & compound interest calculator; address QR code (Address Formatter and
  every address page). New sidebar group "Calculators" for the new pages.
- **U2 (Batch 2), built 2026-11-24:** loan-to-value, impermanent loss and slippage calculators; Bitcoin and Solana address format
  validators; EIP-712 / Permit signature decoder (added by owner decision 2026-11-24).
- **U3 (Batch 3):** Keccak-256, function selector and event topic; ABI JSON validator and ABI encoder/decoder (extends
  the Transaction Data Decoder with your own ABI); Base58/Base64; JSON/CSV formatter (lowest priority).

Rules for each batch: built directly without design approval first (owner decision 2026-11-24); English first; the batch's new texts are translated into the
Beta languages in one pass before it is deployed (missing ones show in English meanwhile and the check counts them);
Learn guides only where they really help, English first, translated later; every result is computed in the browser and
a browser test checks that nothing typed is sent anywhere; exact BigInt maths for on-chain amounts, and estimates say so.
