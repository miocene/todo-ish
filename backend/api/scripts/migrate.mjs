import { readFile } from "node:fs/promises";
import { Client } from "pg";
import { runMigrations } from "../src/migrations.mjs";

const password = (
  await readFile(process.env.PGPASSWORD_FILE, "utf8")
).trimEnd();
if (!password) throw new Error("The migration password secret is empty");
const client = new Client({
  password,
  options: process.env.PGOPTIONS,
  connectionTimeoutMillis: 5000,
});
await client.connect();
try {
  await runMigrations(
    client,
    process.env.MIGRATION_DIRECTORY ?? "/migrations",
    {
      adoptLegacy: process.env.MIGRATION_ADOPT_LEGACY_CHECKSUMS === "1",
    },
  );
} finally {
  await client.end();
}
