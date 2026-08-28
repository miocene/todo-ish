import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { AuthRepositoryConflictError } from "./auth-repository.mjs";

const REGISTRATION_CEREMONY = "registration";
const AUTHENTICATION_CEREMONY = "authentication";
const defaultWebAuthn = {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
};

export class AuthError extends Error {
  constructor(message, statusCode = 400, code = "auth_error") {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function tokenHash(token) {
  return createHash("sha256").update(token).digest("base64url");
}

function randomToken() {
  return randomBytes(32).toString("base64url");
}

function cookieValue(cookieHeader, name) {
  if (!cookieHeader) return "";
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return "";
}

function bootstrapTokenMatches(received, expected) {
  const receivedHash = createHash("sha256")
    .update(received || "")
    .digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(receivedHash, expectedHash);
}

function expiry(seconds) {
  return new Date(Date.now() + seconds * 1000);
}

function publicUser(user) {
  return { username: user.username, displayName: user.displayName };
}

export function createAuthService(repository, config, webAuthn = defaultWebAuthn) {
  const cookiePrefix = config.secureCookies ? "__Host-" : "";
  const challengeCookieName = `${cookiePrefix}doneish_challenge`;
  const sessionCookieName = `${cookiePrefix}doneish_session`;
  const secureAttribute = config.secureCookies ? "; Secure" : "";

  function cookie(name, value, maxAge) {
    return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureAttribute}`;
  }

  function clearCookie(name) {
    return cookie(name, "", 0);
  }

  async function storeChallenge({ challenge, ceremony, userHandle }) {
    const token = randomToken();
    await repository.storeChallenge({
      tokenHash: tokenHash(token),
      challenge,
      ceremony,
      userHandle,
      expiresAt: expiry(config.challengeTtlSeconds),
    });
    return cookie(challengeCookieName, token, config.challengeTtlSeconds);
  }

  async function consumeChallenge(cookieHeader, ceremony) {
    const token = cookieValue(cookieHeader, challengeCookieName);
    if (!token) throw new AuthError("The passkey request has expired. Try again.", 400, "challenge_missing");
    const challenge = await repository.consumeChallenge(tokenHash(token), ceremony);
    if (!challenge) throw new AuthError("The passkey request has expired. Try again.", 400, "challenge_expired");
    return challenge;
  }

  function createSession() {
    const token = randomToken();
    return {
      token,
      tokenHash: tokenHash(token),
      expiresAt: expiry(config.sessionTtlSeconds),
    };
  }

  async function authenticatedUser(cookieHeader) {
    const token = cookieValue(cookieHeader, sessionCookieName);
    if (!token) return null;
    return repository.sessionByTokenHash(tokenHash(token));
  }

  async function requireUser(cookieHeader) {
    const user = await authenticatedUser(cookieHeader);
    if (!user) throw new AuthError("Authentication required", 401, "authentication_required");
    return user;
  }

  return {
    async session(cookieHeader) {
      const user = await authenticatedUser(cookieHeader);
      return {
        authenticated: Boolean(user),
        bootstrapRequired: user ? false : !(await repository.hasOwner()),
        user: user ? publicUser(user) : null,
      };
    },

    async requireUser(cookieHeader) {
      return requireUser(cookieHeader);
    },

    async registrationOptions({ bootstrapToken, cookieHeader }) {
      const ownerExists = await repository.hasOwner();
      let user;
      if (ownerExists) {
        user = await requireUser(cookieHeader);
      } else {
        if (!bootstrapTokenMatches(bootstrapToken, config.bootstrapToken)) {
          throw new AuthError("The setup code is invalid", 401, "invalid_bootstrap_token");
        }
        user = {
          id: randomToken(),
          username: config.username,
          displayName: config.displayName,
        };
      }

      const credentials = ownerExists ? await repository.credentialsForUser(user.id) : [];
      const options = await webAuthn.generateRegistrationOptions({
        rpName: config.rpName,
        rpID: config.rpID,
        userID: Buffer.from(user.id, "base64url"),
        userName: user.username,
        userDisplayName: user.displayName,
        timeout: config.challengeTtlSeconds * 1000,
        attestationType: "none",
        excludeCredentials: credentials.map((credential) => ({
          id: credential.id,
          transports: credential.transports,
        })),
        authenticatorSelection: {
          residentKey: "required",
          requireResidentKey: true,
          userVerification: "required",
        },
      });
      const challengeCookie = await storeChallenge({
        challenge: options.challenge,
        ceremony: REGISTRATION_CEREMONY,
        userHandle: user.id,
      });
      return { body: options, cookies: [challengeCookie] };
    },

    async verifyRegistration({ cookieHeader, response }) {
      const challenge = await consumeChallenge(cookieHeader, REGISTRATION_CEREMONY);
      let verification;
      try {
        verification = await webAuthn.verifyRegistrationResponse({
          response,
          expectedChallenge: challenge.challenge,
          expectedOrigin: config.origin,
          expectedRPID: config.rpID,
          requireUserVerification: true,
        });
      } catch {
        throw new AuthError("The passkey could not be verified", 400, "registration_failed");
      }
      if (!verification.verified) {
        throw new AuthError("The passkey could not be verified", 400, "registration_failed");
      }

      const existingUser = await repository.userById(challenge.userHandle);
      const user = existingUser ?? {
        id: challenge.userHandle,
        username: config.username,
        displayName: config.displayName,
      };
      const { registrationInfo } = verification;
      const session = createSession();
      try {
        await repository.storeCredentialAndSession({
          user,
          credential: {
            id: registrationInfo.credential.id,
            publicKey: Buffer.from(registrationInfo.credential.publicKey).toString("base64url"),
            counter: registrationInfo.credential.counter,
            transports: response.response?.transports ?? [],
            deviceType: registrationInfo.credentialDeviceType,
            backedUp: registrationInfo.credentialBackedUp,
            aaguid: registrationInfo.aaguid,
          },
          session,
        });
      } catch (error) {
        if (error instanceof AuthRepositoryConflictError || error?.code === "23505") {
          throw new AuthError("This passkey is already registered", 409, "credential_exists");
        }
        throw error;
      }
      return {
        body: { authenticated: true, user: publicUser(user) },
        cookies: [clearCookie(challengeCookieName), cookie(sessionCookieName, session.token, config.sessionTtlSeconds)],
      };
    },

    async authenticationOptions() {
      if (!(await repository.hasOwner())) {
        throw new AuthError("Complete passkey setup first", 409, "bootstrap_required");
      }
      const options = await webAuthn.generateAuthenticationOptions({
        rpID: config.rpID,
        allowCredentials: [],
        timeout: config.challengeTtlSeconds * 1000,
        userVerification: "required",
      });
      const challengeCookie = await storeChallenge({
        challenge: options.challenge,
        ceremony: AUTHENTICATION_CEREMONY,
        userHandle: null,
      });
      return { body: options, cookies: [challengeCookie] };
    },

    async verifyAuthentication({ cookieHeader, response }) {
      const challenge = await consumeChallenge(cookieHeader, AUTHENTICATION_CEREMONY);
      const credential = typeof response?.id === "string" ? await repository.credentialById(response.id) : null;
      if (!credential) throw new AuthError("Passkey not found", 404, "credential_not_found");

      let verification;
      try {
        verification = await webAuthn.verifyAuthenticationResponse({
          response,
          expectedChallenge: challenge.challenge,
          expectedOrigin: config.origin,
          expectedRPID: config.rpID,
          requireUserVerification: true,
          credential: {
            id: credential.id,
            publicKey: Buffer.from(credential.publicKey, "base64url"),
            counter: credential.counter,
            transports: credential.transports,
          },
        });
      } catch {
        throw new AuthError("The passkey could not be verified", 401, "authentication_failed");
      }
      if (!verification.verified) {
        throw new AuthError("The passkey could not be verified", 401, "authentication_failed");
      }

      const session = createSession();
      const { authenticationInfo } = verification;
      await repository.authenticateCredential({
        credentialId: credential.id,
        counter: authenticationInfo.newCounter,
        backedUp: authenticationInfo.credentialBackedUp,
        deviceType: authenticationInfo.credentialDeviceType,
        session,
      });
      return {
        body: { authenticated: true, user: publicUser(credential.user) },
        cookies: [clearCookie(challengeCookieName), cookie(sessionCookieName, session.token, config.sessionTtlSeconds)],
      };
    },

    async logout(cookieHeader) {
      const token = cookieValue(cookieHeader, sessionCookieName);
      await repository.deleteSession(token ? tokenHash(token) : "");
      return {
        body: { authenticated: false },
        cookies: [clearCookie(challengeCookieName), clearCookie(sessionCookieName)],
      };
    },
  };
}
