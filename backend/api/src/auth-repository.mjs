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
    async hasOwner() {
      const result = await pool.query("SELECT EXISTS (SELECT 1 FROM auth_users) AS exists");
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
      await pool.query("DELETE FROM auth_challenges WHERE expires_at <= now()");
      await pool.query({
        text: `
          INSERT INTO auth_challenges (token_hash, challenge, ceremony, user_handle, expires_at)
          VALUES ($1, $2, $3, $4, $5)
        `,
        values: [
          challenge.tokenHash,
          challenge.challenge,
          challenge.ceremony,
          challenge.userHandle,
          challenge.expiresAt,
        ],
      });
    },

    async consumeChallenge(tokenHash, ceremony) {
      const result = await pool.query({
        text: `
          DELETE FROM auth_challenges
          WHERE token_hash = $1 AND ceremony = $2 AND expires_at > now()
          RETURNING challenge, ceremony, user_handle AS "userHandle"
        `,
        values: [tokenHash, ceremony],
      });
      return result.rows[0] ?? null;
    },

    async storeCredentialAndSession({ credential, session, user }) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("LOCK TABLE auth_users IN SHARE ROW EXCLUSIVE MODE");
        const ownerResult = await client.query(
          `SELECT id AS "userId", username, display_name AS "displayName" FROM auth_users LIMIT 1`,
        );
        const owner = mapUser(ownerResult.rows[0]);
        if (owner && owner.id !== user.id) {
          throw new AuthRepositoryConflictError("A different owner is already registered");
        }
        if (!owner) {
          await client.query({
            text: "INSERT INTO auth_users (id, username, display_name) VALUES ($1, $2, $3)",
            values: [user.id, user.username, user.displayName],
          });
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
        return owner ?? user;
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

    async authenticateCredential({ credentialId, counter, backedUp, deviceType, session }) {
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
        if (!userId) throw new AuthRepositoryConflictError("Passkey credential no longer exists");
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

    async deleteSession(tokenHash) {
      if (!tokenHash) return;
      await pool.query({ text: "DELETE FROM auth_sessions WHERE token_hash = $1", values: [tokenHash] });
    },
  };
}
