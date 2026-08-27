import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogRepository } from "../src/catalog-repository.mjs";
import { createCatalogHttpServer } from "../src/http-server.mjs";

async function withServer(repository, callback) {
  const messages = [];
  const logger = { error: (...values) => messages.push(values) };
  const server = createCatalogHttpServer(repository, logger);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    await callback(`http://127.0.0.1:${port}`, messages);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

function fakeRepository(overrides = {}) {
  return {
    health: async () => ({ status: "ok" }),
    summary: async () => ({ catalogs: [] }),
    filaments: async (parameters) => ({ catalog: "filament", parameters }),
    floss: async (parameters) => ({ catalog: "floss", parameters }),
    ...overrides,
  };
}

test("catalog API exposes health and validates pagination", async () => {
  await withServer(fakeRepository(), async (origin) => {
    const health = await fetch(`${origin}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });
    assert.equal(health.headers.get("cache-control"), "no-store");

    const response = await fetch(`${origin}/api/catalogs/filaments?q=blue&family=PLA%20Basic&limit=25&offset=5`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      catalog: "filament",
      parameters: {
        family: "PLA Basic",
        limit: 25,
        offset: 5,
        query: "blue",
      },
    });
    assert.equal(response.headers.get("cache-control"), "private, max-age=60");

    const invalid = await fetch(`${origin}/api/catalogs/floss?limit=501`);
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: "limit must be an integer between 1 and 500" });
  });
});

test("catalog API rejects writes and hides internal errors", async () => {
  const repository = fakeRepository({
    summary: async () => {
      throw new Error("database hostname and secret details");
    },
  });

  await withServer(repository, async (origin, messages) => {
    const write = await fetch(`${origin}/api/catalogs`, { method: "POST" });
    assert.equal(write.status, 405);
    assert.equal(write.headers.get("allow"), "GET, HEAD");

    const failure = await fetch(`${origin}/api/catalogs`);
    assert.equal(failure.status, 500);
    assert.deepEqual(await failure.json(), { error: "Internal server error" });
    assert.equal(messages.length, 1);
  });
});

test("repository keeps user filters in PostgreSQL parameters", async () => {
  const calls = [];
  const pool = {
    async query(config) {
      calls.push(config);
      return {
        rows: [
          {
            importedAt: "2026-08-26T21:00:00.000Z",
            entryCount: 265,
            total: 1,
            items: [{ id: "safe" }],
          },
        ],
      };
    },
  };
  const repository = createCatalogRepository(pool);
  const injection = "' OR true --";

  const result = await repository.filaments({
    family: "PLA Basic",
    limit: 10,
    offset: 0,
    query: injection,
  });

  assert.equal(calls.length, 1);
  assert.doesNotMatch(calls[0].text, /OR true --/);
  assert.deepEqual(calls[0].values, [injection, "PLA Basic", 10, 0]);
  assert.equal(result.catalog, "filament");
  assert.equal(result.total, 1);
});
