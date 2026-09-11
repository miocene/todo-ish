import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AppDataRevisionConflictError } from "../src/app-data-repository.mjs";
import { AuthError } from "../src/auth-service.mjs";
import { createCatalogRepository } from "../src/catalog-repository.mjs";
import { createHttpServer } from "../src/http-server.mjs";

async function withServer(
  repository,
  callback,
  authService = fakeAuthService(),
  options = {},
) {
  const messages = [];
  const logger = { error: (...values) => messages.push(values) };
  const server = createHttpServer(repository, authService, {
    ...options,
    logger,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();

  try {
    await callback(`http://127.0.0.1:${port}`, messages);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

function fakeAuthService(overrides = {}) {
  return {
    session: async () => ({
      authenticated: true,
      bootstrapRequired: false,
      user: { displayName: "Owner" },
    }),
    requireUser: async () => ({
      id: "owner",
      username: "owner",
      displayName: "Owner",
    }),
    registrationOptions: async () => ({ body: {}, cookies: [] }),
    verifyRegistration: async () => ({ body: {}, cookies: [] }),
    authenticationOptions: async () => ({ body: {}, cookies: [] }),
    verifyAuthentication: async () => ({ body: {}, cookies: [] }),
    logout: async () => ({ body: { authenticated: false }, cookies: [] }),
    ...overrides,
  };
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

    const response = await fetch(
      `${origin}/api/catalogs/filaments?q=blue&family=PLA%20Basic&limit=25&offset=5`,
    );
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
    assert.deepEqual(await invalid.json(), {
      error: "limit must be an integer between 1 and 500",
    });
  });
});

test("API protects application data and catalogues with the authenticated session", async () => {
  const authService = fakeAuthService({
    requireUser: async () => {
      throw new AuthError(
        "Authentication required",
        401,
        "authentication_required",
      );
    },
  });

  await withServer(
    fakeRepository(),
    async (origin) => {
      const session = await fetch(`${origin}/api/auth/session`);
      assert.equal(session.status, 200);

      const data = await fetch(`${origin}/api/data`);
      assert.equal(data.status, 401);
      assert.deepEqual(await data.json(), {
        error: "Authentication required",
        code: "authentication_required",
      });
    },
    authService,
  );
});

test("API allows credentialed browser requests only from the configured site origin", async () => {
  const allowedOrigin = "https://todo-ish.today";

  await withServer(
    fakeRepository(),
    async (origin) => {
      const session = await fetch(`${origin}/api/auth/session`, {
        headers: { origin: allowedOrigin },
      });
      assert.equal(session.status, 200);
      assert.equal(
        session.headers.get("access-control-allow-origin"),
        allowedOrigin,
      );
      assert.equal(
        session.headers.get("access-control-allow-credentials"),
        "true",
      );
      assert.equal(session.headers.get("vary"), "Origin");

      const preflight = await fetch(
        `${origin}/api/auth/authentication/options`,
        {
          method: "OPTIONS",
          headers: {
            origin: allowedOrigin,
            "access-control-request-method": "POST",
            "access-control-request-headers": "content-type",
          },
        },
      );
      assert.equal(preflight.status, 204);
      assert.match(
        preflight.headers.get("access-control-allow-methods"),
        /POST/,
      );
      assert.match(
        preflight.headers.get("access-control-allow-headers"),
        /content-type/,
      );

      const foreignOrigin = await fetch(`${origin}/api/auth/session`, {
        headers: { origin: "https://attacker.example" },
      });
      assert.equal(foreignOrigin.status, 403);
      assert.equal(
        foreignOrigin.headers.get("access-control-allow-origin"),
        null,
      );

      const missingOrigin = await fetch(
        `${origin}/api/auth/authentication/options`,
        { method: "POST" },
      );
      assert.equal(missingOrigin.status, 403);
      assert.deepEqual(await missingOrigin.json(), {
        error: "Origin header is required",
      });
    },
    fakeAuthService(),
    { allowedOrigin },
  );
});

test("private development server bypasses session auth and browser-origin checks", async () => {
  const authService = fakeAuthService({
    session: async (_cookie, authenticationBypass) => ({
      authenticated: authenticationBypass,
    }),
    requireUser: async (_cookie, authenticationBypass) => {
      if (!authenticationBypass)
        throw new AuthError(
          "Authentication required",
          401,
          "authentication_required",
        );
      return { username: "julia", displayName: "Julia" };
    },
  });

  await withServer(
    fakeRepository(),
    async (origin) => {
      const session = await fetch(`${origin}/api/auth/session`);
      assert.equal(session.status, 200);
      assert.deepEqual(await session.json(), { authenticated: true });

      const data = await fetch(`${origin}/api/data`);
      assert.equal(data.status, 200);

      const post = await fetch(`${origin}/api/auth/authentication/options`, {
        method: "POST",
      });
      assert.equal(post.status, 200);
    },
    authService,
    { authenticationBypass: true },
  );
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
  const source = await readFile(
    new URL("../src/app-data-repository.mjs", import.meta.url),
    "utf8",
  );

  assert.match(source, /scheduled_for::text AS date/);
  assert.match(source, /work_date::text AS date/);
  assert.match(source, /occurrence\.due_on::text AS "nextDue"/);
});

test("app-data API reads state and performs revision-checked writes", async () => {
  const calls = [];
  const repository = fakeRepository({
    read: async () => ({
      initializedResources: ["shopping"],
      revisions: { shopping: 2 },
    }),
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
      headers: {
        "content-type": "application/json",
        "if-match": '"2"',
        "x-shopping-stock": "atomic-v1",
      },
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
      [
        "shopping",
        {
          tasks: [
            {
              id: "manual",
              title: "Apples",
              completedAt: null,
              productLink: null,
            },
          ],
        },
        2,
        "owner",
      ],
    ]);
  });
});

test("app-data API preserves card colors and validates their format", async () => {
  const calls = [];
  const repository = fakeRepository({
    replace: async (resource, value) => {
      calls.push({ resource, value });
      return 1;
    },
  });
  await withServer(repository, async (origin) => {
    const write = (resource, value) =>
      fetch(`${origin}/api/data/${resource}`, {
        method: "PUT",
        headers: { "content-type": "application/json", "if-match": '"0"' },
        body: JSON.stringify(value),
      });
    const colors = {
      "work-day:2026-09-04": 42,
      "work-day:2026-09-05": 5,
      backlog: 17,
      "chores-today": 34,
      "chores-all": 41,
    };
    assert.equal((await write("colors", colors)).status, 200);
    const todos = {
      lists: [{ id: "general", title: "General", color: 5, tasks: [] }],
    };
    assert.equal((await write("todos", todos)).status, 200);
    assert.deepEqual(calls, [
      { resource: "colors", value: colors },
      { resource: "todos", value: todos },
    ]);
    for (const color of [0, 43, -1, 1.5, "1", null])
      assert.equal((await write("colors", { backlog: color })).status, 400);
    assert.equal((await write("colors", { backlog: "#2765EC" })).status, 200);
    assert.deepEqual(calls.at(-1), {
      resource: "colors",
      value: { backlog: (parseInt("2765EC", 16) % 42) + 1 },
    });
    assert.equal(
      (await write("colors", { ...colors, "work-day:2026-09-05": "red" }))
        .status,
      400,
    );
    assert.equal(
      (await write("colors", { ...colors, "work-day:2026-02-30": 42 })).status,
      400,
    );
    assert.equal((await write("colors", { today: 42 })).status, 400);
    assert.equal(
      (await write("todos", { lists: [{ ...todos.lists[0], color: "red" }] }))
        .status,
      400,
    );
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
      headers: {
        "content-type": "application/json",
        "if-match": '"2"',
        "x-shopping-stock": "atomic-v1",
      },
      body: "[]",
    });
    assert.equal(conflict.status, 409);
    assert.deepEqual(await conflict.json(), {
      error: "The work-tasks data changed after revision 2",
      currentRevision: 4,
    });
  });
});

test("data requests use the authenticated account and reject stale tabs after an account switch", async () => {
  const calls = [];
  const repository = fakeRepository({
    read: async (id) => {
      calls.push(["read", id]);
      return { userId: id };
    },
    replace: async (...args) => {
      calls.push(args);
      return 1;
    },
  });
  await withServer(repository, async (origin) => {
    assert.equal(
      (
        await fetch(`${origin}/api/data`, {
          headers: { "x-app-user-id": "other" },
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await fetch(`${origin}/api/data/preferences`, {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            "if-match": '"0"',
            "x-app-user-id": "other",
          },
          body: JSON.stringify({ hiddenNavigation: [] }),
        })
      ).status,
      401,
    );
    assert.deepEqual(calls, []);
    const response = await fetch(`${origin}/api/data/preferences`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "if-match": '"0"',
        "x-app-user-id": "owner",
      },
      body: JSON.stringify({ hiddenNavigation: ["printing"], userId: "other" }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(calls[0], [
      "preferences",
      { hiddenNavigation: ["printing"] },
      0,
      "owner",
    ]);
  });
});

test("registration options reject malformed JSON shapes before authentication work", async () => {
  await withServer(
    fakeRepository(),
    async (origin, messages) => {
      for (const body of [null, [], "token", 42, true]) {
        const response = await fetch(
          `${origin}/api/auth/registration/options`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        assert.equal(response.status, 400);
        assert.deepEqual(await response.json(), {
          error: "Registration options must be an object",
        });
      }
      assert.deepEqual(messages, []);
    },
    fakeAuthService({
      registrationOptions: () => {
        throw new Error("Malformed input reached auth");
      },
    }),
  );
});

test("authentication flood returns Retry-After without trusting forwarded addresses", async () => {
  const { createAuthRequestLimit } =
    await import("../src/auth-request-limit.mjs");
  let now = 0;
  await withServer(
    fakeRepository(),
    async (origin) => {
      const request = () =>
        fetch(`${origin}/api/auth/authentication/options`, {
          method: "POST",
          headers: { "x-forwarded-for": String(Math.random()) },
        });
      assert.equal((await request()).status, 200);
      const limited = await request();
      assert.equal(limited.status, 429);
      assert.equal(limited.headers.get("retry-after"), "2");
      assert.equal((await fetch(`${origin}/api/auth/session`)).status, 200);
      now = 2000;
      assert.equal((await request()).status, 200);
    },
    fakeAuthService(),
    { authRequestLimit: createAuthRequestLimit({ burst: 1, now: () => now }) },
  );
});
