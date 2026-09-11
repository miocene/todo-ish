import assert from "node:assert/strict";
import test from "node:test";

test("todo history replacement requires an explicit complete snapshot", async () => {
  const { validateAppDataResource } =
    await import("../backend/api/src/app-data-validation.mjs");
  assert.throws(
    () => validateAppDataResource("todos", { lists: [], replaceHistory: true }),
    /history/,
  );
  assert.deepEqual(
    validateAppDataResource("todos", {
      lists: [],
      history: [],
      replaceHistory: true,
    }),
    {
      lists: [],
      history: [],
      replaceHistory: true,
    },
  );
  assert.deepEqual(validateAppDataResource("todos", { lists: [] }), {
    lists: [],
  });
});

test("shopping validation saves purchases and history but excludes unfinished shortages", async () => {
  const { validateAppDataResource } =
    await import("../backend/api/src/app-data-validation.mjs");
  const purchase = {
    id: "purchase",
    title: "Two spools",
    completedAt: "2026-09-09T10:00:00Z",
    source: "filament-shortage",
    filamentId: "pla",
    quantity: 2,
  };
  const value = validateAppDataResource("shopping", {
    tasks: [
      purchase,
      ...Array.from({ length: 2001 }, (_, i) => ({
        id: `derived-${i}`,
        source: "filament-shortage",
      })),
    ],
    history: [{ id: "milk", title: "Milk", completedAt: purchase.completedAt }],
  });
  assert.equal(value.tasks.length, 1);
  assert.equal(value.tasks[0].quantity, 2);
  assert.equal(value.history[0].title, "Milk");
  assert.throws(
    () =>
      validateAppDataResource("shopping", {
        tasks: [{ ...purchase, quantity: 0 }],
      }),
    /quantity/,
  );
  assert.throws(
    () =>
      validateAppDataResource("shopping", {
        tasks: [purchase],
        history: [purchase],
      }),
    /distinct/,
  );
});

test("shopping links accept only absolute HTTP and HTTPS URLs, including imported purchases", async () => {
  const { validateAppDataResource } =
    await import("../backend/api/src/app-data-validation.mjs");
  for (const item of [
    { id: "manual", title: "Milk" },
    {
      id: "purchase",
      title: "Floss",
      completedAt: "2026-09-09T12:00:00Z",
      source: "floss-shortage",
      flossId: "dmc310",
      quantity: 1,
    },
  ]) {
    for (const productLink of [
      "https://example.com/item?q=1",
      "http://example.com",
      null,
      "",
    ]) {
      assert.doesNotThrow(() =>
        validateAppDataResource("shopping", {
          tasks: [{ ...item, productLink }],
        }),
      );
    }
    for (const productLink of [
      "javascript:alert(1)",
      "data:text/html,test",
      "//example.com",
      "/item",
      "not a URL",
    ]) {
      assert.throws(
        () =>
          validateAppDataResource("shopping", {
            tasks: [{ ...item, productLink }],
          }),
        /productLink.*HTTP/,
      );
    }
  }
});
