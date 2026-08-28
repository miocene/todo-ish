import assert from "node:assert/strict";
import test from "node:test";
import { AuthError, createAuthService } from "../src/auth-service.mjs";

const config = {
  bootstrapToken: "bootstrap-token-that-is-at-least-32-characters",
  challengeTtlSeconds: 300,
  displayName: "Julia",
  origin: "https://todo-ish.today",
  rpID: "todo-ish.today",
  rpName: "Done-ish",
  secureCookies: true,
  sessionTtlSeconds: 3600,
  username: "julia",
};

function fakeRepository(overrides = {}) {
  let challenge;
  return {
    hasOwner: async () => false,
    userById: async () => null,
    credentialsForUser: async () => [],
    credentialById: async () => null,
    storeChallenge: async (value) => {
      challenge = value;
    },
    consumeChallenge: async (_tokenHash, ceremony) =>
      challenge?.ceremony === ceremony
        ? { challenge: challenge.challenge, ceremony, userHandle: challenge.userHandle }
        : null,
    storeCredentialAndSession: async () => {},
    sessionByTokenHash: async () => null,
    authenticateCredential: async () => {},
    deleteSession: async () => {},
    ...overrides,
  };
}

test("passkey bootstrap requires the one-time setup token", async () => {
  const service = createAuthService(fakeRepository(), config, {});

  await assert.rejects(
    service.registrationOptions({ bootstrapToken: "wrong", cookieHeader: "" }),
    (error) => error instanceof AuthError && error.statusCode === 401 && error.code === "invalid_bootstrap_token",
  );
});

test("passkey bootstrap stores a verified credential and creates a secure session", async () => {
  const calls = [];
  const repository = fakeRepository({
    storeCredentialAndSession: async (value) => calls.push(value),
  });
  const webAuthn = {
    async generateRegistrationOptions(options) {
      calls.push({ registrationOptions: options });
      return { challenge: "registration-challenge", rp: { id: options.rpID } };
    },
    async verifyRegistrationResponse(options) {
      calls.push({ registrationVerification: options });
      return {
        verified: true,
        registrationInfo: {
          aaguid: "00000000-0000-0000-0000-000000000000",
          credential: { id: "credential-id", publicKey: Uint8Array.from([1, 2, 3]), counter: 0 },
          credentialDeviceType: "multiDevice",
          credentialBackedUp: true,
        },
      };
    },
  };
  const service = createAuthService(repository, config, webAuthn);

  const options = await service.registrationOptions({
    bootstrapToken: config.bootstrapToken,
    cookieHeader: "",
  });
  assert.equal(options.body.challenge, "registration-challenge");
  assert.match(options.cookies[0], /^__Host-doneish_challenge=/);
  assert.match(options.cookies[0], /HttpOnly; SameSite=Strict/);
  assert.match(options.cookies[0], /; Secure$/);

  const result = await service.verifyRegistration({
    cookieHeader: options.cookies[0].split(";", 1)[0],
    response: { id: "credential-id", response: { transports: ["internal"] } },
  });
  assert.deepEqual(result.body, {
    authenticated: true,
    user: { username: "julia", displayName: "Julia" },
  });
  assert.match(result.cookies[1], /^__Host-doneish_session=/);

  const stored = calls.find((call) => call.credential);
  assert.equal(stored.credential.publicKey, "AQID");
  assert.deepEqual(stored.credential.transports, ["internal"]);
  assert.equal(stored.credential.deviceType, "multiDevice");
  assert.equal(stored.user.username, "julia");

  const generated = calls.find((call) => call.registrationOptions).registrationOptions;
  assert.equal(generated.rpID, "todo-ish.today");
  assert.equal(generated.authenticatorSelection.residentKey, "required");
  assert.equal(generated.authenticatorSelection.userVerification, "required");
  assert.ok(generated.userID instanceof Uint8Array);
});

test("passkey authentication verifies the stored public key and rotates the session", async () => {
  const calls = [];
  const user = { id: "owner-id", username: "julia", displayName: "Julia" };
  const credential = {
    id: "credential-id",
    userId: user.id,
    publicKey: "AQID",
    counter: 4,
    deviceType: "multiDevice",
    backedUp: true,
    transports: ["internal"],
    user,
  };
  const repository = fakeRepository({
    hasOwner: async () => true,
    credentialById: async (id) => (id === credential.id ? credential : null),
    authenticateCredential: async (value) => calls.push(value),
  });
  const webAuthn = {
    async generateAuthenticationOptions(options) {
      calls.push({ authenticationOptions: options });
      return { challenge: "authentication-challenge", rpId: options.rpID };
    },
    async verifyAuthenticationResponse(options) {
      calls.push({ authenticationVerification: options });
      return {
        verified: true,
        authenticationInfo: {
          newCounter: 5,
          credentialDeviceType: "multiDevice",
          credentialBackedUp: true,
        },
      };
    },
  };
  const service = createAuthService(repository, config, webAuthn);

  const options = await service.authenticationOptions();
  const result = await service.verifyAuthentication({
    cookieHeader: options.cookies[0].split(";", 1)[0],
    response: { id: credential.id },
  });

  assert.equal(result.body.authenticated, true);
  assert.equal(calls.find((call) => call.authenticationOptions).authenticationOptions.allowCredentials.length, 0);
  const verification = calls.find((call) => call.authenticationVerification).authenticationVerification;
  assert.deepEqual([...verification.credential.publicKey], [1, 2, 3]);
  assert.equal(verification.requireUserVerification, true);
  assert.equal(calls.find((call) => call.credentialId).counter, 5);
});
