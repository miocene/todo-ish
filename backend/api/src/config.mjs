import { readFileSync } from "node:fs";

function required(name, environment) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function positiveInteger(name, value, fallback) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1) throw new Error(`${name} must be a positive integer`);
  return Number(value);
}

function booleanValue(name, value, fallback) {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false`);
}

function readSecret(path) {
  return readFileSync(path, "utf8").replace(/[\r\n]+$/, "");
}

function webOrigin(name, value, rpID) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must contain a valid origin`);
  }
  if (url.origin !== value || url.protocol !== "https:") {
    throw new Error(`${name} must contain an HTTPS origin without a path or trailing slash`);
  }
  if (url.hostname !== rpID && !url.hostname.endsWith(`.${rpID}`)) {
    throw new Error(`${name} must belong to the configured WebAuthn RP ID`);
  }
  return value;
}

function optionalPositiveInteger(name, value) {
  if (value === undefined || value === "") return null;
  return positiveInteger(name, value);
}

export function loadConfig(environment = process.env) {
  const passwordFile = required("PGPASSWORD_FILE", environment);
  const password = readSecret(passwordFile);
  if (!password) throw new Error("The PostgreSQL password secret is empty");
  const bootstrapToken = readSecret(required("AUTH_BOOTSTRAP_TOKEN_FILE", environment));
  if (bootstrapToken.length < 32) throw new Error("The authentication bootstrap token must be at least 32 characters");
  const rpID = required("AUTH_RP_ID", environment);
  const origin = webOrigin("AUTH_ORIGIN", required("AUTH_ORIGIN", environment), rpID);
  const port = positiveInteger("PORT", environment.PORT, 3000);
  const developmentPort = optionalPositiveInteger("DEVELOPMENT_PORT", environment.DEVELOPMENT_PORT);
  if (developmentPort === port) throw new Error("DEVELOPMENT_PORT must differ from PORT");

  return {
    developmentPort,
    host: environment.HOST?.trim() || "0.0.0.0",
    port,
    database: {
      application_name: "done-ish-api",
      connectionTimeoutMillis: 5000,
      database: required("PGDATABASE", environment),
      host: required("PGHOST", environment),
      idleTimeoutMillis: 30000,
      max: positiveInteger("PGPOOL_MAX", environment.PGPOOL_MAX, 4),
      password,
      port: positiveInteger("PGPORT", environment.PGPORT, 5432),
      user: required("PGUSER", environment),
    },
    auth: {
      bootstrapToken,
      challengeTtlSeconds: positiveInteger("AUTH_CHALLENGE_TTL_SECONDS", environment.AUTH_CHALLENGE_TTL_SECONDS, 300),
      displayName: environment.AUTH_USER_DISPLAY_NAME?.trim() || "Owner",
      origin,
      rpID,
      rpName: environment.AUTH_RP_NAME?.trim() || "Done-ish",
      secureCookies: booleanValue(
        "AUTH_SECURE_COOKIES",
        environment.AUTH_SECURE_COOKIES,
        origin.startsWith("https://"),
      ),
      sessionTtlSeconds: positiveInteger("AUTH_SESSION_TTL_SECONDS", environment.AUTH_SESSION_TTL_SECONDS, 2_592_000),
      username: environment.AUTH_USER_NAME?.trim() || "owner",
    },
  };
}
