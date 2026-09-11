export class AuthRepositoryConflictError extends Error {}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.userId,
    username: row.username,
    displayName: row.displayName,
  };
}

function mapCredential(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    publicKey: row.publicKey,
    counter: Number(row.counter),
    deviceType: row.deviceType,
    backedUp: row.backedUp,
    transports: row.transports,
    aaguid: row.aaguid,
    user: mapUser(row),
  };
}

export function createAuthRepository(pool) {
  return {
    async provisionUser({ user, setupCode }) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query({
          text: "INSERT INTO auth_users (id, username, display_name) VALUES ($1, $2, $3) ON CONFLICT (username) DO NOTHING",
          values: [user.id, user.username, user.displayName],
        });
        const existing = await client.query({
          text: "SELECT id FROM auth_users WHERE username = $1 FOR UPDATE",
          values: [user.username],
        });
        const userId = existing.rows[0].id;
        await client.query({
          text: "DELETE FROM auth_setup_codes WHERE user_id = $1",
          values: [userId],
        });
        await client.query({
          text: "INSERT INTO auth_setup_codes (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
          values: [setupCode.tokenHash, userId, setupCode.expiresAt],
        });
        await client.query("COMMIT");
        return userId;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async firstUser() {
      const result = await pool.query(
        `SELECT id AS "userId", username, display_name AS "displayName" FROM auth_users ORDER BY created_at, id LIMIT 1`,
      );
      return mapUser(result.rows[0]);
    },

    async userForSetupCode(tokenHash) {
      const result = await pool.query({
        text: `SELECT auth_users.id AS "userId", username, display_name AS "displayName"
          FROM auth_setup_codes JOIN auth_users ON auth_users.id = auth_setup_codes.user_id
          WHERE token_hash = $1 AND expires_at > now()`,
        values: [tokenHash],
      });
      return mapUser(result.rows[0]);
    },

    async hasOwner() {
      const result = await pool.query(
        "SELECT EXISTS (SELECT 1 FROM auth_users) AS exists",
      );
      return result.rows[0].exists;
    },

    async userById(id) {
      const result = await pool.query({
        text: `
          SELECT id AS "userId", username, display_name AS "displayName"
          FROM auth_users
          WHERE id = $1
        `,
        values: [id],
      });
      return mapUser(result.rows[0]);
    },

    async credentialsForUser(userId) {
      const result = await pool.query({
        text: `
          SELECT id, user_id AS "userId", public_key AS "publicKey", counter,
                 device_type AS "deviceType", backed_up AS "backedUp", transports, aaguid
          FROM passkey_credentials
          WHERE user_id = $1
          ORDER BY created_at
        `,
        values: [userId],
      });
      return result.rows.map(mapCredential);
    },

    async credentialById(id) {
      const result = await pool.query({
        text: `
          SELECT credential.id, credential.user_id AS "userId", credential.public_key AS "publicKey",
                 credential.counter, credential.device_type AS "deviceType",
                 credential.backed_up AS "backedUp", credential.transports, credential.aaguid,
                 auth_user.username, auth_user.display_name AS "displayName"
          FROM passkey_credentials AS credential
          JOIN auth_users AS auth_user ON auth_user.id = credential.user_id
          WHERE credential.id = $1
        `,
        values: [id],
      });
      return mapCredential(result.rows[0]);
    },

    async storeChallenge(challenge) {
      await pool.query({
        text: `
          INSERT INTO auth_challenges (token_hash, challenge, ceremony, user_handle, expires_at, setup_code_hash)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        values: [
          challenge.tokenHash,
          challenge.challenge,
          challenge.ceremony,
          challenge.userHandle,
          challenge.expiresAt,
          challenge.setupCodeHash ?? null,
        ],
      });
    },

    async consumeChallenge(tokenHash, ceremony) {
      const result = await pool.query({
        text: `
          DELETE FROM auth_challenges
          WHERE token_hash = $1 AND ceremony = $2 AND expires_at > now()
          RETURNING challenge, ceremony, user_handle AS "userHandle", setup_code_hash AS "setupCodeHash"
        `,
        values: [tokenHash, ceremony],
      });
      return result.rows[0] ?? null;
    },

    async storeCredentialAndSession({
      credential,
      session,
      user,
      setupCodeHash,
    }) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("LOCK TABLE auth_users IN SHARE ROW EXCLUSIVE MODE");
        const existing = await client.query({
          text: "SELECT id FROM auth_users WHERE id = $1",
          values: [user.id],
        });
        if (!existing.rows.length) {
          const owners = await client.query(
            "SELECT id FROM auth_users LIMIT 1",
          );
          if (owners.rows.length)
            throw new AuthRepositoryConflictError(
              "The account has not been provisioned",
            );
          await client.query({
            text: "INSERT INTO auth_users (id, username, display_name) VALUES ($1, $2, $3)",
            values: [user.id, user.username, user.displayName],
          });
        }
        if (setupCodeHash) {
          const setup = await client.query({
            text: "DELETE FROM auth_setup_codes WHERE token_hash = $1 AND user_id = $2 AND expires_at > now() RETURNING user_id",
            values: [setupCodeHash, user.id],
          });
          if (!setup.rows.length)
            throw new AuthRepositoryConflictError(
              "The setup code has expired or was already used",
            );
        }
        await client.query({
          text: `
            INSERT INTO passkey_credentials
              (id, user_id, public_key, counter, device_type, backed_up, transports, aaguid)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
          values: [
            credential.id,
            user.id,
            credential.publicKey,
            credential.counter,
            credential.deviceType,
            credential.backedUp,
            credential.transports,
            credential.aaguid,
          ],
        });
        await client.query({
          text: "INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
          values: [session.tokenHash, user.id, session.expiresAt],
        });
        await client.query("COMMIT");
        return user;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async sessionByTokenHash(tokenHash) {
      const result = await pool.query({
        text: `
          WITH seen AS (
            UPDATE auth_sessions SET last_seen_at = now()
            WHERE token_hash = $1 AND expires_at > now()
              AND last_seen_at < now() - interval '5 minutes'
          )
          SELECT auth_user.id AS "userId", auth_user.username,
                 auth_user.display_name AS "displayName"
          FROM auth_sessions AS session
          JOIN auth_users AS auth_user ON auth_user.id = session.user_id
          WHERE session.token_hash = $1 AND session.expires_at > now()
        `,
        values: [tokenHash],
      });
      return mapUser(result.rows[0]);
    },

    async authenticateCredential({
      credentialId,
      counter,
      backedUp,
      deviceType,
      session,
    }) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await client.query({
          text: `
            UPDATE passkey_credentials
            SET counter = $2, backed_up = $3, device_type = $4, last_used_at = now()
            WHERE id = $1
            RETURNING user_id AS "userId"
          `,
          values: [credentialId, counter, backedUp, deviceType],
        });
        const userId = result.rows[0]?.userId;
        if (!userId)
          throw new AuthRepositoryConflictError(
            "Passkey credential no longer exists",
          );
        await client.query({
          text: "INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
          values: [session.tokenHash, userId, session.expiresAt],
        });
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async cleanExpired(limit = 500) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 500)
        throw new Error("Cleanup batch must be 1–500 rows");
      const counts = {};
      for (const table of [
        "auth_challenges",
        "auth_sessions",
        "auth_setup_codes",
      ]) {
        const result = await pool.query({
          text: `DELETE FROM ${table} WHERE token_hash IN (
            SELECT token_hash FROM ${table} WHERE expires_at <= now()
            ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED
          )`,
          values: [limit],
        });
        counts[table] = result.rowCount;
      }
      return counts;
    },

    async deleteSession(tokenHash) {
      if (!tokenHash) return;
      await pool.query({
        text: "DELETE FROM auth_sessions WHERE token_hash = $1",
        values: [tokenHash],
      });
    },
  };
}
