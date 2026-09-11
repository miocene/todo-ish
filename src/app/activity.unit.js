import assert from "node:assert/strict";
import test from "node:test";
import {
  activityLevel,
  activityYears,
  buildActivityCalendar,
  collectCompletedActivity,
  groupActivityByDay,
} from "./activity.js";

test("activity helpers group completed items and build a complete calendar year", () => {
  const items = [
    { id: "one", date: "2026-08-28", completedAt: "2026-08-28T09:00:00.000Z" },
    { id: "two", date: "2026-08-28", completedAt: "2026-08-28T10:00:00.000Z" },
    { id: "old", date: "2024-02-01", completedAt: "2024-02-01T10:00:00.000Z" },
  ];
  const groups = groupActivityByDay(items, 2026);
  const calendar = buildActivityCalendar(2026, groups);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].items.length, 2);
  assert.equal(
    calendar.days.filter((day) => day.count !== undefined).length,
    365,
  );
  assert.equal(calendar.days.find((day) => day.date === "2026-08-28").level, 2);
  assert.deepEqual(activityYears(items, 2026), [2026, 2025, 2024, 2023, 2022]);
});

test("activity levels use one shared productivity scale", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(activityLevel), [0, 1, 2, 3, 3, 4]);
});

test("Activity accepts large histories without spreading function arguments", () => {
  const items = Array.from({ length: 200_000 }, () => ({ date: "2020-02-01" }));
  assert.deepEqual(
    activityYears(items, 2026),
    [2026, 2025, 2024, 2023, 2022, 2021, 2020],
  );
});

test("Activity reads completed records without changing its snapshot", () => {
  const data = {
    "work-tasks": [
      {
        id: "work",
        title: "Done",
        date: "2026-09-01",
        checkedAt: "2026-09-03T12:00:00Z",
      },
    ],
    chores: { tasks: [], history: [] },
    todos: {
      lists: [],
      history: [
        {
          id: "retained",
          title: "Deleted",
          completedAt: "2026-09-02T12:00:00Z",
        },
      ],
    },
    shopping: { tasks: [] },
    printing: { projects: [] },
    "cross-stitch": { projects: [] },
  };
  const before = structuredClone(data);
  const reads = [];
  const items = collectCompletedActivity((resource) => {
    reads.push(resource);
    return data[resource];
  });
  assert.equal(items.length, 2);
  assert.equal(items.find((item) => item.source === "Work").date, "2026-09-01");
  assert.deepEqual(data, before);
  assert.deepEqual(reads, Object.keys(data));
});
