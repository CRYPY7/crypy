# CLAUDE.md — working on CRYPY

@AGENTS.md

Read ARCHITECTURE.md, DEVELOPMENT_ROADMAP.md and PROGRESS.md before changing anything.

## Non-negotiables

- Non-custodial: never add fields or features that touch seed phrases or private keys. Wallet connection never triggers a signature or transaction by itself.
- Real data only. Tools stay `status: "soon"` in `src/config/tools.ts` until they work with real blockchain data and are tested. Never show a "safe" verdict.
- No hard-coded UI text: every string lives in `messages/en.json` (ESLint enforces it). Addresses and hashes use the `.technical` class (always LTR, never translated).
- Lightweight pages: server components by default; client components only for interaction; anything heavy is lazy-loaded (see `tools-dialog-loader.tsx`). The performance budget tests in `tests/e2e/foundation.spec.ts` must pass.
- **Zero API cost:** never add a dependency on a paid API or data service. Every external source must be free and have a free fallback; blockchain reads go through the metered provider rotation (`src/server/chains/evm/providers.ts`).
- Secrets only on the server. Browser code may read only `NEXT_PUBLIC_*` variables. Server code lives in `src/server/` and imports `server-only`.
- Chain-specific code only inside adapters (`src/server/chains/<family>/`). Pages and services talk to the `ChainFamilyAdapter` interface and CAIP ids.
- Third-party data is untrusted: token text goes through `sanitizeTokenText`; amounts are BigInt strings formatted with `formatAmount`.
- Pages that call providers must call `pageRequestAllowed()` and stay `noindex`.
- Working tools get their own route folder and an entry in `modules/tools/own-route.ts`; never import tool widgets into the shared `[toolId]` route (it would load every tool on every tool page).

## This stack's specifics

- Next.js 16: `src/proxy.ts` (not middleware), `cacheComponents: true`, locale via `next/root-params` (`import { locale } from "next/root-params"`). Read `node_modules/next/dist/docs/` before using an unfamiliar API.
- i18n: `next-intl/server` only. Client components receive translated strings as props.
- shadcn/ui uses Base UI primitives (`render` prop, not `asChild`). Plain elements can use `buttonVariants` from `components/ui/button-variants.ts`.
- wagmi 3: `useConnection` (not `useAccount`); config has `ssr: true`. Wallet code is lazy (`wallets/wallet-root.tsx`); never import wagmi outside `src/wallets/evm/`.
- RTL: use logical Tailwind utilities (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`); flip directional icons with `rtl:-scale-x-100`.

## Before reporting work as done

Run, in this order (type generation rewrites part of `.next`, so build last):

1. `pnpm typecheck` 2. `pnpm lint` 3. `pnpm test` 4. `pnpm build` 5. `pnpm test:e2e`
   Then update PROGRESS.md. Never claim a check passed unless it was run.
