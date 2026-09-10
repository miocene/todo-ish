import assert from "node:assert/strict";
import { createAuthRepository } from "../src/auth-repository.mjs";
export async function verifyAuthCleanup(pool, userId) {
  const repository = createAuthRepository(pool);
  await pool.query(
    `INSERT INTO auth_sessions(token_hash,user_id,expires_at,last_seen_at)
    SELECT 'cleanup-' || i, $1, now() + CASE WHEN i = 3 THEN interval '1 day' ELSE interval '-1 day' END, now() - interval '1 hour'
    FROM generate_series(1,3) i`,
    [userId],
  );
  await pool.query(`INSERT INTO auth_challenges(token_hash,challenge,ceremony,expires_at)
    SELECT 'cleanup-' || i, 'challenge', 'authentication', now() - interval '1 day' FROM generate_series(1,3) i`);
  await pool.query(
    `INSERT INTO auth_setup_codes(token_hash,user_id,expires_at) VALUES ('cleanup-code',$1,now()-interval '1 day')`,
    [userId],
  );
  const counts = await repository.cleanExpired(1);
  assert.equal(counts.auth_sessions, 1);
  assert.equal(counts.auth_challenges, 1);
  assert.equal(counts.auth_setup_codes, 1);
  await repository.cleanExpired();
  assert.equal((await repository.sessionByTokenHash("cleanup-3")).id, userId);
  const seen = await pool.query(
    "SELECT last_seen_at > now() - interval '1 minute' AS recent FROM auth_sessions WHERE token_hash='cleanup-3'",
  );
  assert.equal(seen.rows[0].recent, true);
  assert.equal(await repository.sessionByTokenHash("cleanup-1"), null);
}
