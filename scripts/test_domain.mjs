import assert from "node:assert/strict";
import test from "node:test";
import { projectProgress } from "../src/domain/printing.js";
import { nextProjectColor, projectColor } from "../src/domain/project-color.js";
import { syncCatalogShopping } from "../src/domain/shopping.js";
import { stitchProgress, stitchStatusFromThreads } from "../src/domain/stitching.js";
import { dateKey, shiftIsoDate } from "../src/shared/date.js";

test("project colours and calendar dates stay stable independently of view order", () => {
  assert.equal(projectColor("project-a"), projectColor("project-a", 5));
  assert.equal(nextProjectColor([{ color: "#43b25d" }]), "#4d88bd");
  assert.equal(shiftIsoDate("2026-10-31", 1), "2026-11-01");
  assert.equal(dateKey("2026-08-25"), "2026-08-25");
});

test("stitch status and totals are derived from thread progress", () => {
  assert.equal(stitchStatusFromThreads({ abandoned: true, threads: [] }), "Abandoned");
  assert.equal(stitchStatusFromThreads({ threads: [] }), "Planned");
  assert.equal(stitchStatusFromThreads({ threads: [{ completedCrosses: 0, totalCrosses: 120 }] }), "Planned");
  assert.equal(stitchStatusFromThreads({ threads: [{ completedCrosses: 24, totalCrosses: 120 }] }), "In progress");
  const completed = {
    threads: [
      { completedCrosses: 120, totalCrosses: 120 },
      { completedCrosses: 80, totalCrosses: 80 },
    ],
  };
  assert.equal(stitchStatusFromThreads(completed), "Completed");
  assert.deepEqual(stitchProgress(completed), { completed: 200, total: 200, percent: 100 });
});

test("print progress ignores cancelled parts", () => {
  assert.deepEqual(
    projectProgress({
      parts: [{ status: "Done" }, { status: "Printing" }, { status: "Cancelled" }],
    }),
    { done: 1, total: 2, percent: 50 },
  );
});

test("catalogue shortages produce one idempotent shopping row per material", () => {
  const state = {
    shopping: [{ id: "milk", title: "Oat milk", linked: false }],
    stitch: [
      {
        id: "stitch-project",
        title: "Sampler",
        threads: [
          {
            id: "thread-row",
            catalogId: "dmc310",
            label: "DMC 310 · Black",
            required: 2,
          },
        ],
      },
    ],
    threadStock: [{ catalogId: "dmc310", owned: 0.5 }],
    filamentStock: [],
    printing: [
      {
        parts: [
          {
            status: "Printing",
            filamentId: "bambu-pla-basic-filament-10101",
            filamentLabel: "PLA Basic · Black",
            materialGrams: 1001,
          },
        ],
      },
    ],
  };

  syncCatalogShopping(state);
  syncCatalogShopping(state);

  assert.equal(state.shopping.length, 3);
  assert.equal(state.shopping.filter((item) => !item.linked).length, 1);
  assert.deepEqual(
    state.shopping.find((item) => item.sourceType === "thread"),
    {
      id: "shop-thread-dmc310",
      title: "DMC 310 · Black",
      quantity: 1.5,
      linked: true,
      sourceType: "thread",
      sourceId: "dmc310",
    },
  );
  assert.equal(state.shopping.find((item) => item.sourceType === "filament")?.quantity, 2);
});
