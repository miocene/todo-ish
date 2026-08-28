import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AppDataRevisionConflictError } from "../src/app-data-repository.mjs";
import { createCatalogRepository } from "../src/catalog-repository.mjs";
import { createHttpServer } from "../src/http-server.mjs";

async function withServer(repository, callback) {
  const messages = [];
  const logger = { error: (...values) => messages.push(values) };
  const server = createHttpServer(repository, logger);
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
    read: async () => ({ initializedResources: [], revisions: {} }),
    replace: async () => 1,
    ...overrides,
  };
}

test("API exposes health and validates catalogue pagination", async () => {
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

test("API rejects unsupported catalogue writes and hides internal errors", async () => {
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

test("app-data repository keeps PostgreSQL dates in the browser ISO-date contract", async () => {
  const source = await readFile(new URL("../src/app-data-repository.mjs", import.meta.url), "utf8");

  assert.match(source, /scheduled_for::text AS date/);
  assert.match(source, /work_date::text AS date/);
  assert.match(source, /occurrence\.due_on::text AS "nextDue"/);
});

test("app-data API reads state and performs revision-checked writes", async () => {
  const calls = [];
  const repository = fakeRepository({
    read: async () => ({ initializedResources: ["shopping"], revisions: { shopping: 2 } }),
    replace: async (...parameters) => {
      calls.push(parameters);
      return 3;
    },
  });

  await withServer(repository, async (origin) => {
    const read = await fetch(`${origin}/api/data`);
    assert.equal(read.status, 200);
    assert.deepEqual(await read.json(), {
      initializedResources: ["shopping"],
      revisions: { shopping: 2 },
    });

    const write = await fetch(`${origin}/api/data/shopping`, {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": '"2"' },
      body: JSON.stringify({
        tasks: [
          { id: "manual", title: "  Apples  ", completed: false },
          {
            id: "derived",
            title: "PLA Basic · Black",
            completed: false,
            source: "filament-shortage",
          },
        ],
      }),
    });

    assert.equal(write.status, 200);
    assert.equal(write.headers.get("etag"), '"3"');
    assert.deepEqual(await write.json(), { resource: "shopping", revision: 3 });
    assert.deepEqual(calls, [
      ["shopping", { tasks: [{ id: "manual", title: "Apples", completedAt: null, productLink: null }] }, 2],
    ]);
  });
});

test("app-data API validates preconditions, payloads, and revision conflicts", async () => {
  const repository = fakeRepository({
    replace: async (resource, _data, expectedRevision) => {
      throw new AppDataRevisionConflictError(resource, expectedRevision, 4);
    },
  });

  await withServer(repository, async (origin) => {
    const missingPrecondition = await fetch(`${origin}/api/data/work-tasks`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "[]",
    });
    assert.equal(missingPrecondition.status, 428);

    const invalid = await fetch(`${origin}/api/data/work-statuses`, {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": '"0"' },
      body: JSON.stringify({ "2026-02-30": "work" }),
    });
    assert.equal(invalid.status, 400);
    assert.match((await invalid.json()).error, /valid date/);

    const conflict = await fetch(`${origin}/api/data/work-tasks`, {
      method: "PUT",
      headers: { "content-type": "application/json", "if-match": '"2"' },
      body: "[]",
    });
    assert.equal(conflict.status, 409);
    assert.deepEqual(await conflict.json(), {
      error: "The work-tasks data changed after revision 2",
      currentRevision: 4,
    });
  });
});
