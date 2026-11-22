import { defineConfig } from "drizzle-kit";

/** Generates SQL migrations from src/server/db/schema.ts into ./drizzle (run: pnpm db:generate). */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
});
