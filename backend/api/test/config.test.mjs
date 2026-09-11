import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadConfig } from "../src/config.mjs";

async function testEnvironment(overrides = {}) {
  const directory = await mkdtemp(join(tmpdir(), "done-ish-config-"));
  const passwordFile = join(directory, "postgres-password");
  const bootstrapTokenFile = join(directory, "bootstrap-token");
  await writeFile(passwordFile, "database-password\n");
  await writeFile(
    bootstrapTokenFile,
    "bootstrap-token-that-is-at-least-32-characters\n",
  );
  return {
    cleanup: () => rm(directory, { recursive: true }),
    environment: {
      AUTH_BOOTSTRAP_TOKEN_FILE: bootstrapTokenFile,
      AUTH_ORIGIN: "https://todo-ish.today",
      AUTH_RP_ID: "todo-ish.today",
      PGDATABASE: "todo",
      PGHOST: "postgres",
      PGPASSWORD_FILE: passwordFile,
      PGUSER: "todo_runtime",
      ...overrides,
    },
  };
}

test("API config enables a separate private development port", async () => {
  const fixture = await testEnvironment({ DEVELOPMENT_PORT: "3001" });
  try {
    const config = loadConfig(fixture.environment);
    assert.equal(config.auth.origin, "https://todo-ish.today");
    assert.equal(config.port, 3000);
    assert.equal(config.developmentPort, 3001);
  } finally {
    await fixture.cleanup();
  }
});

test("authentication config rejects invalid production origins", async () => {
  for (const value of [
    "http://todo-ish.today",
    "https://todo-ish.today/path",
    "https://attacker.example",
  ]) {
    const fixture = await testEnvironment({ AUTH_ORIGIN: value });
    try {
      assert.throws(
        () => loadConfig(fixture.environment),
        /must contain an HTTPS origin|must belong to/,
      );
    } finally {
      await fixture.cleanup();
    }
  }
});

test("API config rejects a development port that collides with the public port", async () => {
  const fixture = await testEnvironment({ DEVELOPMENT_PORT: "3000" });
  try {
    assert.throws(
      () => loadConfig(fixture.environment),
      /DEVELOPMENT_PORT must differ from PORT/,
    );
  } finally {
    await fixture.cleanup();
  }
});
