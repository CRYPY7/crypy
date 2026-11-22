import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * CRYPY's database (M8). Kept deliberately small: who signed in (their wallet addresses), their sessions, the one-time
 * sign-in codes, and what they watch. No email, no password, no IP addresses. Deleting a user deletes everything
 * below it (ON DELETE CASCADE). Addresses are stored as CAIP-10 ids, so other chain families fit without changes.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** Revenue phases are modelled but switched off in V1 (ARCHITECTURE "Payment-ready V1"). */
  plan: text("plan").notNull().default("free"),
});

/** A wallet that signed in. One user can later link several wallets. `accountId` is CAIP-10 with a lower-case address. */
export const accounts = pgTable("accounts", {
  accountId: text("account_id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Sign-in sessions. Only a SHA-256 hash of the cookie's token is stored, so a database copy can't be used to sign in. */
export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** One-time codes put into the sign-in message (EIP-4361 nonce). Deleted when used or expired. */
export const signInNonces = pgTable("sign_in_nonces", {
  nonce: text("nonce").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

/**
 * What a user watches. `kind` "address": a wallet or contract, watched on every supported chain (`chain` empty).
 * `kind` "token": one token contract on one chain. `rules` holds the alert choices (lib/watchlist/rules.ts).
 */
export const watchItems = pgTable(
  "watch_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    chain: text("chain").notNull().default(""),
    target: text("target").notNull(),
    label: text("label").notNull().default(""),
    rules: jsonb("rules").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("watch_items_unique").on(t.userId, t.kind, t.chain, t.target),
    index("watch_items_user_idx").on(t.userId),
  ],
);

export const schema = { users, accounts, sessions, signInNonces, watchItems };
