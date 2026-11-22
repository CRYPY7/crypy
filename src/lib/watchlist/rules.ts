import { z } from "zod";

/**
 * What a watched item alerts on (approved boards 39–41). Pure and shared by the browser and the server.
 * Alerts themselves are sent by the background checker (M8 Part 3); these are the person's choices.
 */
export const MAX_WATCH_ITEMS = 10;
export const MAX_LABEL = 40;

const amount = z.object({
  on: z.boolean(),
  /** Only above this USD value; null = any amount. */
  minUsd: z.number().nonnegative().max(1e12).nullable(),
});

export const addressRulesSchema = z.strictObject({
  sent: amount,
  received: amount,
  approvals: z.strictObject({ on: z.boolean() }),
  valueDrop: z.strictObject({ on: z.boolean(), percent: z.number().int().min(5).max(90) }),
});

export const tokenRulesSchema = z.strictObject({
  security: z.strictObject({ on: z.boolean() }),
  liquidity: z.strictObject({ on: z.boolean() }),
});

export type AddressRules = z.infer<typeof addressRulesSchema>;
export type TokenRules = z.infer<typeof tokenRulesSchema>;

/** The person's own (signed-in) wallet: every outgoing transfer, incoming above $100, new approvals. */
export const ownWalletDefaults: AddressRules = {
  sent: { on: true, minUsd: null },
  received: { on: true, minUsd: 100 },
  approvals: { on: true },
  valueDrop: { on: false, percent: 20 },
};

/** Someone else's wallet: big moves only. */
export const watchOnlyDefaults: AddressRules = {
  sent: { on: true, minUsd: 1000 },
  received: { on: true, minUsd: 1000 },
  approvals: { on: false },
  valueDrop: { on: false, percent: 20 },
};

export const tokenDefaults: TokenRules = { security: { on: true }, liquidity: { on: true } };

export const watchItemInput = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("address"),
    target: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    label: z.string().max(200).default(""),
    rules: addressRulesSchema.optional(),
  }),
  z.strictObject({
    kind: z.literal("token"),
    chain: z.string().regex(/^[a-z0-9-]{2,20}$/),
    target: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    label: z.string().max(200).default(""),
    rules: tokenRulesSchema.optional(),
  }),
]);

export const watchItemPatch = z.strictObject({
  label: z.string().max(200).optional(),
  /** "Mute this wallet": no alerts for it until unmuted. */
  muted: z.boolean().optional(),
  rules: z.union([addressRulesSchema, tokenRulesSchema]).optional(),
});

export type WatchItemInput = z.infer<typeof watchItemInput>;

export interface WatchItem {
  id: string;
  kind: "address" | "token";
  /** "" for addresses (watched on every supported chain). */
  chain: string;
  target: string;
  label: string;
  rules: AddressRules | TokenRules;
  muted: boolean;
  createdAt: string;
}
