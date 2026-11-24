import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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
  /** Telegram chat that receives alerts (M8 Part 3). Set by the bot when the person presses Start with their code. */
  telegramChatId: text("telegram_chat_id").unique(),
  telegramUsername: text("telegram_username"),
  telegramLinkedAt: timestamp("telegram_linked_at", { withTimezone: true }),
  /** Quiet hours in minutes after midnight in `timeZone` (approved default 23:00–07:00): alerts wait until they end. */
  quietOn: boolean("quiet_on").notNull().default(true),
  quietStart: smallint("quiet_start").notNull().default(1380),
  quietEnd: smallint("quiet_end").notNull().default(420),
  /** IANA time zone from the person's browser, used only for quiet hours. */
  timeZone: text("time_zone").notNull().default("UTC"),
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
    /** "Mute this wallet" from a Telegram alert or the page: nothing is sent for it until unmuted. */
    muted: boolean("muted").notNull().default(false),
    /** What the checker last saw (values, security summary, liquidity), to tell what changed. */
    state: jsonb("state").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("watch_items_unique").on(t.userId, t.kind, t.chain, t.target),
    index("watch_items_user_idx").on(t.userId),
  ],
);

/** One-time codes that link a Telegram chat to an account (10 minutes, single use). Only a hash is stored. */
export const telegramLinkCodes = pgTable(
  "telegram_link_codes",
  {
    codeHash: text("code_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("telegram_link_codes_user_idx").on(t.userId)],
);

/**
 * Alert history (Recent alerts). `dedupeKey` makes each event alert once even when the checker sees it twice.
 * `status`: queued (quiet hours or not sent yet), sent, failed, or no-channel (Telegram not connected).
 * Kept 90 days.
 */
export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").references(() => watchItems.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    severity: text("severity").notNull(),
    chain: text("chain").notNull().default(""),
    title: text("title").notNull(),
    details: jsonb("details").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    status: text("status").notNull().default("queued"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("alerts_dedupe").on(t.userId, t.dedupeKey),
    index("alerts_user_created_idx").on(t.userId, t.createdAt),
    index("alerts_status_idx").on(t.status),
  ],
);

/** The last block the checker finished for each chain, so a restart continues where it stopped. */
export const checkerCursors = pgTable("checker_cursors", {
  chain: text("chain").primaryKey(),
  lastBlock: bigint("last_block", { mode: "bigint" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** The Portfolio list, kept on the account when the person chooses to (same format as the browser copy). */
export const portfolios = pgTable("portfolios", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Saved token security checks for the curated token pages (SEO Phase 3): CRYPY's own report, re-run about once a day
 * by the background worker. Public data only; nothing about visitors.
 */
export const tokenChecks = pgTable("token_checks", {
  /** "<chain key>:<lower-case address>" */
  id: text("id").primaryKey(),
  chain: text("chain").notNull(),
  slug: text("slug").notNull(),
  report: jsonb("report").notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
});

/**
 * Health check results (M9 Part 5): one row per check run, kept 90 days. Read by the public status page and the admin
 * dashboard. `detail` is a short reason with keys removed; it is shown on the admin dashboard only.
 */
export const healthChecks = pgTable(
  "health_checks",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    check: text("check").notNull(),
    status: text("status").notNull(),
    ms: integer("ms"),
    detail: text("detail"),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("health_checks_checked_at_idx").on(table.checkedAt)],
);

/**
 * Status updates written by an admin for the public status page (M9 Part 5). Plain text only. `component` is a
 * status component id from lib/health/checks.ts (or null for the whole site).
 */
export const statusUpdates = pgTable(
  "status_updates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** ongoing | fixed | planned */
    state: text("state").notNull(),
    component: text("component"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    fixedAt: timestamp("fixed_at", { withTimezone: true }),
  },
  (table) => [index("status_updates_created_idx").on(table.createdAt)],
);

/**
 * Free-plan use per provider and UTC day (Alchemy in compute units, others in requests), saved every minute so a
 * restart doesn't reset the day's count, and so Alchemy's daily limit can follow the monthly plan. Provider names are
 * host names only (never URLs or keys).
 */
export const providerUsage = pgTable(
  "provider_usage",
  {
    day: text("day").notNull(),
    provider: text("provider").notNull(),
    requests: integer("requests").notNull().default(0),
    units: bigint("units", { mode: "number" }).notNull().default(0),
    backgroundUnits: bigint("background_units", { mode: "number" }).notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("provider_usage_day_provider_idx").on(table.day, table.provider)],
);

/**
 * What visitors got from each tool (stabilization S0), per 5-minute bucket: full, partial and failed requests, slow
 * ones, total time and short reason codes with counts. No addresses, hashes, IPs or anything a visitor typed.
 */
export const visitorOutcomes = pgTable(
  "visitor_outcomes",
  {
    bucket: timestamp("bucket", { withTimezone: true }).notNull(),
    tool: text("tool").notNull(),
    full: integer("full").notNull().default(0),
    partial: integer("partial").notNull().default(0),
    errors: integer("errors").notNull().default(0),
    slow: integer("slow").notNull().default(0),
    totalMs: bigint("total_ms", { mode: "number" }).notNull().default(0),
    reasons: jsonb("reasons").$type<Record<string, number>>().notNull().default({}),
  },
  (table) => [uniqueIndex("visitor_outcomes_bucket_tool_idx").on(table.bucket, table.tool)],
);

/**
 * Last good result per tool, subject and chain (stabilization S2), shown with its age when a fresh read fails. A
 * complete reading is never replaced by an incomplete one (unless it is over a day old). Wallet results are deleted 7 days after the wallet was last looked up (`used_at`); no IP
 * or visitor id is stored with them.
 */
export const savedResults = pgTable(
  "saved_results",
  {
    kind: text("kind").notNull(),
    subject: text("subject").notNull(),
    chain: text("chain").notNull(),
    data: jsonb("data").notNull(),
    /** 2 = complete reading; 1 = usable but incomplete (e.g. well-known tokens only). Never replaced by a lower one. */
    quality: smallint("quality").notNull().default(2),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("saved_results_key_idx").on(table.kind, table.subject, table.chain),
    index("saved_results_used_idx").on(table.usedAt),
  ],
);

export const schema = {
  users,
  accounts,
  sessions,
  signInNonces,
  watchItems,
  telegramLinkCodes,
  alerts,
  tokenChecks,
  healthChecks,
  statusUpdates,
  checkerCursors,
  portfolios,
  providerUsage,
  visitorOutcomes,
  savedResults,
};
