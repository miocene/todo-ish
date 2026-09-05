import assert from "node:assert/strict";
import test from "node:test";
import { createCatalog } from "../src/app/catalog-loader.js";
const page = (items, total = items.length) => ({ ok: true, json: async () => ({ items, total }) });

test("catalog requests are shared, paginated, and cached across callers", async () => {
  let release;
  const calls = [];
  const catalog = createCatalog({
    path: "/catalog",
    label: "Test catalog",
    fetchPage: (url) => {
      calls.push(url);
      return calls.length === 1
        ? new Promise((resolve) => {
            release = resolve;
          })
        : page([{ id: "b" }], 2);
    },
  });
  const first = catalog.load();
  assert.equal(catalog.load(), first);
  release(page([{ id: "a" }], 2));
  assert.equal(await first, true);
  assert.deepEqual(
    catalog.items.map((item) => item.id),
    ["a", "b"],
  );
  assert.match(calls[1], /offset=1$/);
  assert.equal(catalog.byId.get("b").id, "b");
  await catalog.load();
  assert.equal(calls.length, 2);
});

test("a failed later page publishes no partial catalog and can be retried", async () => {
  let fail = true;
  const catalog = createCatalog({
    path: "/catalog",
    label: "Test catalog",
    fetchPage: async (url) =>
      url.endsWith("offset=0") ? page([{ id: "a" }], 2) : fail ? page([], 2) : page([{ id: "b" }], 2),
  });
  assert.equal(await catalog.load(), false);
  assert.equal(catalog.state.status, "error");
  assert.equal(catalog.items.length, 0);
  fail = false;
  assert.equal(await catalog.load(), true);
  assert.equal(catalog.state.error, "");
  assert.equal(catalog.items.length, 2);
});
