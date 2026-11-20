import { z } from "zod";

/**
 * Public (browser-safe) settings. Server-only secrets live in `src/server/env.ts`.
 * NEXT_PUBLIC_ values are visible to anyone: never put secrets in them.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  // WalletConnect project IDs are public by design; restrict them to your domains in Reown Cloud.
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: z
    .string()
    .regex(/^[a-f0-9]{32}$/, "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID must be 32 hex characters")
    .optional(),
});

export const publicEnv = publicSchema.parse({
  // Next.js only inlines NEXT_PUBLIC_ variables when they are written out in full like this.
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || undefined,
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || undefined,
});

export const siteUrl = new URL(publicEnv.NEXT_PUBLIC_SITE_URL);
