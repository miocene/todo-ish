import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createAuthService } from "../src/auth-service.mjs";

export async function verifySetupCodes(repository, userId) {
  const user = await repository.userById(userId);
  const hash = (value) =>
    createHash("sha256").update(value).digest("base64url");
  const issue = (token, expiresAt) =>
    repository.provisionUser({
      user,
      setupCode: { tokenHash: hash(token), expiresAt },
    });
  await issue("expired-code", new Date(Date.now() - 1000));
  assert.equal(await repository.userForSetupCode(hash("expired-code")), null);
  await issue("active-code", new Date(Date.now() + 60000));
  assert.equal(
    (await repository.userForSetupCode(hash("active-code"))).id,
    userId,
  );
  const generated = [];
  let sequence = 0;
  const service = createAuthService(
    repository,
    {
      origin: "https://todo-ish.today",
      rpID: "todo-ish.today",
      rpName: "Done-ish",
      secureCookies: true,
      username: "first",
      displayName: "First",
      bootstrapToken: "bootstrap",
      challengeTtlSeconds: 300,
      sessionTtlSeconds: 3600,
    },
    {
      async generateRegistrationOptions(options) {
        generated.push(options);
        return { challenge: `challenge-${++sequence}` };
      },
      async verifyRegistrationResponse({ response }) {
        return {
          verified: true,
          registrationInfo: {
            credential: {
              id: response.id,
              publicKey: Uint8Array.from([1, 2, 3]),
              counter: 0,
            },
            credentialDeviceType: "multiDevice",
            credentialBackedUp: true,
            aaguid: "test-aaguid",
          },
        };
      },
    },
  );
  await assert.rejects(
    service.registrationOptions({ bootstrapToken: "invalid" }),
    (error) => error.code === "invalid_setup_code",
  );
  const one = await service.registrationOptions({
    bootstrapToken: "active-code",
  });
  const two = await service.registrationOptions({
    bootstrapToken: "active-code",
  });
  assert.equal(generated[0].userName, user.username);
  const result = await service.verifyRegistration({
    cookieHeader: one.cookies[0].split(";")[0],
    response: { id: "second-passkey-one", response: {} },
  });
  assert.equal(result.body.user.id, userId);
  assert.equal(
    (await service.session(result.cookies[1].split(";")[0])).user.id,
    userId,
  );
  assert.equal(await repository.userForSetupCode(hash("active-code")), null);
  await assert.rejects(
    service.verifyRegistration({
      cookieHeader: two.cookies[0].split(";")[0],
      response: { id: "second-passkey-two", response: {} },
    }),
    (error) => error.code === "registration_conflict",
  );
  assert.equal(await repository.credentialById("second-passkey-two"), null);
  assert.equal((await repository.credentialsForUser(userId)).length, 1);
  await assert.rejects(
    service.registrationOptions({ cookieHeader: "" }),
    (error) => error.statusCode === 401,
  );
  await service.registrationOptions({
    cookieHeader: result.cookies[1].split(";")[0],
  });
  assert.equal(generated.at(-1).userName, user.username);
  assert.deepEqual(
    generated.at(-1).excludeCredentials.map((item) => item.id),
    ["second-passkey-one"],
  );
}
