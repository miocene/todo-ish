import "webauthn-polyfills";
import { apiFetch } from "./api.js";

const RP_ID = "todo-ish.today";

export class PasskeyRequestError extends Error {
  constructor(message, status = 0, code = "request_failed") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(path, options = {}) {
  let response;
  try {
    response = await apiFetch(path, {
      ...options,
      headers: { accept: "application/json", ...options.headers },
    });
  } catch {
    throw new PasskeyRequestError("The home server could not be reached.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new PasskeyRequestError(body.error || "The passkey request failed.", response.status, body.code);
  }
  return body;
}

function jsonPost(path, body) {
  return request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function passkeysSupported() {
  return Boolean(
    window.PublicKeyCredential &&
    navigator.credentials?.create &&
    navigator.credentials?.get &&
    PublicKeyCredential.parseCreationOptionsFromJSON &&
    PublicKeyCredential.parseRequestOptionsFromJSON,
  );
}

export function getSession() {
  return request("/auth/session");
}

export async function createPasskey(bootstrapToken = "") {
  const optionsJSON = await jsonPost("/auth/registration/options", { token: bootstrapToken });
  const publicKey = PublicKeyCredential.parseCreationOptionsFromJSON(optionsJSON);
  const credential = await navigator.credentials.create({ publicKey });
  if (!credential) throw new PasskeyRequestError("No passkey was created.");
  const encoded = credential.toJSON();

  try {
    return await jsonPost("/auth/registration/verify", encoded);
  } catch (error) {
    if (PublicKeyCredential.signalUnknownCredential) {
      await PublicKeyCredential.signalUnknownCredential({ rpId: RP_ID, credentialId: encoded.id }).catch(() => {});
    }
    throw error;
  }
}

export async function authenticateWithPasskey() {
  const optionsJSON = await jsonPost("/auth/authentication/options", {});
  const publicKey = PublicKeyCredential.parseRequestOptionsFromJSON(optionsJSON);
  const credential = await navigator.credentials.get({ publicKey });
  if (!credential) throw new PasskeyRequestError("No passkey was selected.");
  const encoded = credential.toJSON();

  try {
    return await jsonPost("/auth/authentication/verify", encoded);
  } catch (error) {
    if (error.status === 404 && PublicKeyCredential.signalUnknownCredential) {
      await PublicKeyCredential.signalUnknownCredential({ rpId: RP_ID, credentialId: encoded.id }).catch(() => {});
    }
    throw error;
  }
}

export function signOut() {
  return request("/auth/session", { method: "DELETE" });
}
