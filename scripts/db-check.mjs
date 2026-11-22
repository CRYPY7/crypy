// Opens the database exactly as the server does, outside Next.js, and prints the result.
// Run from the project folder: node scripts/db-check.mjs
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] === "disk" ? join(process.cwd(), ".data", "pglite-check") : undefined;
try {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  if (dir) mkdirSync(dir, { recursive: true });
  const client = dir ? new PGlite(dir) : new PGlite();
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: join(process.cwd(), "drizzle") });
  const result = await client.query("select count(*)::int as n from users");
  console.log(`database ok (${dir ? "folder .data/pglite-check" : "in memory"}): users = ${result.rows[0].n}`);
  await client.close();
} catch (error) {
  console.log(`database FAILED (${dir ? "folder" : "in memory"}):`);
  console.log(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
}
