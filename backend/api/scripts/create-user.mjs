import { createHash, randomBytes } from "node:crypto";
import { Pool } from "pg";
import { createAuthRepository } from "../src/auth-repository.mjs";
import { loadConfig } from "../src/config.mjs";

const [username, displayName] = process.argv.slice(2);
if (!username || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(username) || !displayName?.trim() || displayName.length > 100) {
  console.error('Usage: node scripts/create-user.mjs <username> "Display name"');
  process.exitCode = 1;
} else {
  const pool = new Pool(loadConfig().database);
  try {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await createAuthRepository(pool).provisionUser({
      user: { id: randomBytes(32).toString("base64url"), username, displayName: displayName.trim() },
      setupCode: { tokenHash: createHash("sha256").update(token).digest("base64url"), expiresAt },
    });
    console.log(`Account: ${username}\nOne-time setup code: ${token}\nExpires: ${expiresAt.toISOString()}`);
  } finally {
    await pool.end();
  }
}
