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

function readSecret(path) {
  return readFileSync(path, "utf8").replace(/[\r\n]+$/, "");
}

export function loadConfig(environment = process.env) {
  const passwordFile = required("PGPASSWORD_FILE", environment);
  const password = readSecret(passwordFile);
  if (!password) throw new Error("The PostgreSQL password secret is empty");

  return {
    host: environment.HOST?.trim() || "0.0.0.0",
    port: positiveInteger("PORT", environment.PORT, 3000),
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
  };
}
