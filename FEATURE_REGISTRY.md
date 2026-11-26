# CRYPY — Feature registry

The full registry is the Sheet **"CRYPY — Feature registry"** (https://claude.ai/artifact/C3afuuDuXpCkVVvFsTYADW):
the 291 tools of the owner's "Web3 Tool Decision Catalog" (2026-11-24), each with where it runs, its status in
CRYPY, what already covers it, priority and the owner's decision. The catalog is the long-term backlog, not
permission to build everything: only rows marked **Approved for development** are built, one batch at a time.

## Statuses (2026-11-26, after U5 and the JSON Diff removal)

| Status                       | Count | Meaning                                                                                             |
| ---------------------------- | ----- | --------------------------------------------------------------------------------------------------- |
| Existing / Verified          | 98    | Live in CRYPY and covered by automated tests                                                        |
| Existing / Needs improvement | 35    | Partly there (e.g. EVM only, known ABIs only, no standalone tool)                                   |
| Approved for development     | 0     | U1–U5 all built; the next batch waits for the owner's choice                                        |
| Planned                      | 32    | Worth doing; not scheduled                                                                          |
| Deferred                     | 120   | Needs the indexer (M5.5 Stage 2), always-on workers or a new chain family                           |
| Rejected                     | 6     | Tax classification, address risk context, wallet clusters, cross-chain flows, NFT floors, JSON diff |

## Utilities track (owner decision 2026-11-24)

Browser-only tools may be built during stabilization, alternating with S3–S5 work, because they run on the
visitor's device and touch no provider, server or stored data. Anything that needs RPC or the server waits for S6.

- **U1 (Batch 1), built 2026-11-24:** token decimals mode in the Unit Converter; manual fee calculator on the Gas Tracker; Token
  Supply & Valuation calculator; APR/APY & compound interest calculator; address QR code (Address Formatter and
  every address page). New sidebar group "Calculators" for the new pages.
- **U2 (Batch 2), built 2026-11-24:** loan-to-value, impermanent loss and slippage calculators; Bitcoin and Solana address format
  validators; EIP-712 / Permit signature decoder (added by owner decision 2026-11-24).
- **U3 (Batch 3), built 2026-11-25:** Keccak-256, function selector and event topic; ABI JSON validator and ABI
  encoder/decoder (linked from the Transaction Data Decoder); Base58/Base64; JSON/CSV formatter. New sidebar group
  "Developer" (Hex Converter and Transaction Data Decoder moved into it).
- **U4 (Batch 4), built 2026-11-25:** signature verifier (who signed a message or EIP-712 request); raw transaction &
  RLP decoder; file hash checker (wallet downloads); Bitcoin fee calculator; local address book with a look-alike
  (address poisoning) check.
- **U5 (Batch 5), built 2026-11-25:** profit & average cost calculator (covers manual cost basis, F-096); contract
  bytecode comparer (F-060); NFT token URI & metadata decoder with traits (F-155, F-161); JSON diff (F-212, removed
  2026-11-26 by owner decision: generic, many free alternatives, little to do with wallet safety); calldata
  gas calculator (data-size and gas units, F-209).

Rules for each batch: built directly without design approval first (owner decision 2026-11-24); English first; the batch's new texts are translated into the
Beta languages in one pass before it is deployed (missing ones show in English meanwhile and the check counts them);
Learn guides only where they really help, English first, translated later; every result is computed in the browser and
a browser test checks that nothing typed is sent anywhere; exact BigInt maths for on-chain amounts, and estimates say so.
