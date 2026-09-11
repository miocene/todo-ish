import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultChoreSchedule,
  scheduleFromChore,
  nextChoreDate,
  advanceCompletedChore,
} from "./chore-schedule.js";
import { validateAppDataResource } from "../../backend/api/src/app-data-validation.mjs";

const schedule = (changes = {}) => ({
  ...defaultChoreSchedule("2026-01-05"),
  ...changes,
});

test("daily intervals use calendar days across daylight saving changes", () => {
  const value = schedule({
    frequency: "day",
    interval: 3,
    startDate: "2026-03-28",
  });
  assert.equal(nextChoreDate(value, "2026-03-28"), "2026-03-28");
  assert.equal(nextChoreDate(value, "2026-03-29"), "2026-03-31");
});
test("weekly intervals are anchored to Monday with multiple weekdays", () => {
  const value = schedule({ interval: 2, weekdays: [0, 2, 6] });
  assert.equal(nextChoreDate(value, "2026-01-06"), "2026-01-07");
  assert.equal(nextChoreDate(value, "2026-01-08"), "2026-01-11");
  assert.equal(nextChoreDate(value, "2026-01-12"), "2026-01-19");
});
test("monthly dates clamp to month-end and overlapping dates occur once", () => {
  const value = schedule({ frequency: "month", monthDays: [15, 30, 31] });
  assert.equal(nextChoreDate(value, "2026-02-16"), "2026-02-28");
  assert.equal(nextChoreDate(value, "2026-03-01"), "2026-03-15");
  assert.equal(nextChoreDate(value, "2028-02-16"), "2028-02-29");
  assert.equal(nextChoreDate(value, "2026-04-16"), "2026-04-30");
});
test("monthly intervals cross years without moving the anchor", () => {
  const value = schedule({
    frequency: "month",
    interval: 2,
    startDate: "2025-10-31",
    monthDays: [31],
  });
  assert.equal(nextChoreDate(value, "2025-11-01"), "2025-12-31");
  assert.equal(nextChoreDate(value, "2026-01-01"), "2026-02-28");
});
test("legacy weekday names remain weekly and explicit intervals survive", () => {
  for (const [details, weekday, interval] of [
    ["Every Saturday", 5, 1],
    ["Every Wednesday", 2, 1],
    ["Every 2 weeks on Sunday", 6, 2],
  ]) {
    const value = scheduleFromChore(
      { details, nextDue: "2026-01-05" },
      "2026-01-06",
    );
    assert.equal(value.frequency, "week");
    assert.deepEqual(value.weekdays, [weekday]);
    assert.equal(value.interval, interval);
  }
});
test("completed chores stay checked today and advance the next day; unfinished chores stay due", () => {
  const task = {
    schedule: schedule({ frequency: "day" }),
    nextDue: "2026-01-05",
    completed: true,
    completedAt: new Date("2026-01-07T12:00:00").toISOString(),
  };
  assert.equal(advanceCompletedChore(task, "2026-01-07"), false);
  assert.equal(advanceCompletedChore(task, "2026-01-08"), true);
  assert.equal(task.nextDue, "2026-01-08");
  assert.equal(task.completed, false);
  assert.equal(task.completedAt, undefined);
  assert.equal(advanceCompletedChore(task, "2026-02-01"), false);
  assert.equal(task.nextDue, "2026-01-08");
});
const chores = (value) => ({
  occurrenceOrder: ["chore-1"],
  tasks: [
    {
      id: "chore-1",
      title: "Plants",
      details: "Weekly",
      completed: false,
      nextDue: "2026-01-05",
      schedule: value,
    },
  ],
});
test("API validates schedules and preserves legacy chores without one", () => {
  const value = schedule({ weekdays: [4, 0] });
  assert.deepEqual(
    validateAppDataResource("chores", chores(value)).tasks[0].schedule.weekdays,
    [0, 4],
  );
  assert.doesNotThrow(() =>
    validateAppDataResource("chores", chores(undefined)),
  );
  for (const invalid of [
    false,
    { frequency: "year" },
    { interval: 0 },
    { interval: 1.5 },
    { interval: 1000 },
    { weekdays: [] },
    { weekdays: [7] },
    { weekdays: [0, 0] },
    { monthDays: [0] },
    { monthDays: [32] },
    { monthDays: [] },
    { startDate: "2026-02-30" },
  ]) {
    assert.throws(() =>
      validateAppDataResource(
        "chores",
        chores(invalid === false ? false : schedule(invalid)),
      ),
    );
  }
});

test("legacy conversion handles fortnightly weekdays and leaves unknown rules unconfirmed", () => {
  const chore = { nextDue: "2026-02-01", details: "Every other Saturday" };
  assert.deepEqual(scheduleFromChore(chore, "2026-02-02"), {
    frequency: "week",
    interval: 2,
    startDate: "2026-02-01",
    weekdays: [5],
    monthDays: [1],
  });
  for (const details of [
    "When needed",
    "Yearly",
    "Every month on 1 and 15",
    "Every 0 days",
  ]) {
    assert.equal(scheduleFromChore({ ...chore, details }, "2026-02-02"), null);
  }
});

test("schedule equality ignores inactive selections but detects active recurrence changes", async () => {
  const { sameChoreSchedule } = await import("./chore-schedule.js");
  const daily = schedule({ frequency: "day" });
  assert.equal(
    sameChoreSchedule(daily, { ...daily, monthDays: [31], weekdays: [6] }),
    true,
  );
  assert.equal(sameChoreSchedule(daily, { ...daily, interval: 2 }), false);
  assert.equal(
    sameChoreSchedule(
      schedule({ weekdays: [0, 2] }),
      schedule({ weekdays: [2, 0] }),
    ),
    true,
  );
  assert.equal(
    sameChoreSchedule(schedule({ weekdays: [0] }), schedule({ weekdays: [2] })),
    false,
  );
});

test("retained occurrences are unique, survive deletion, and current unchecking takes precedence", async () => {
  const { retainChoreCompletion, completedChoreOccurrences } =
    await import("./chore-schedule.js");
  const task = {
    id: "one",
    title: "Sweep",
    details: "Daily",
    nextDue: "2026-02-01",
    completed: true,
    completedAt: "2026-02-02T12:00:00Z",
  };
  const chores = { tasks: [task] };
  retainChoreCompletion(chores, task);
  retainChoreCompletion(chores, task);
  assert.equal(chores.history.length, 1);
  assert.equal(completedChoreOccurrences(chores).length, 1);
  delete task.completedAt;
  assert.equal(completedChoreOccurrences(chores).length, 0);
  chores.tasks = [];
  assert.equal(completedChoreOccurrences(chores).length, 1);
  assert.equal(completedChoreOccurrences(chores)[0].id, "one:2026-02-01");
});
