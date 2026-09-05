import assert from "node:assert/strict";
import test from "node:test";
import { createDayClock } from "../src/app/clock.js";
import { isIsoDate, shiftIsoDate } from "../src/shared/date.js";

test("the shared day clock rolls over, catches up after sleep, and cleans up", () => {
  let date = new Date(2026, 11, 31, 23, 59, 50);
  const events = new EventTarget();
  const visibility = new EventTarget();
  const pending = new Map();
  let id = 0;
  const clock = createDayClock({
    now: () => date,
    events,
    visibility,
    timers: {
      setTimeout: (callback, delay) => {
        pending.set(++id, { callback, delay });
        return id;
      },
      clearTimeout: (key) => pending.delete(key),
    },
  });
  clock.start();
  clock.start();
  assert.equal(pending.size, 1);
  assert.equal(pending.values().next().value.delay, 10100);
  date = new Date(2027, 0, 1, 0, 0, 1);
  pending.values().next().value.callback();
  assert.equal(clock.state.today, "2027-01-01");
  date = new Date(2027, 0, 4, 10);
  visibility.dispatchEvent(new Event("visibilitychange"));
  assert.equal(clock.state.today, "2027-01-04");
  date = new Date(2027, 0, 5, 10);
  events.dispatchEvent(new Event("focus"));
  assert.equal(clock.state.today, "2027-01-05");
  clock.stop();
  assert.equal(pending.size, 0);
  date = new Date(2027, 0, 6);
  events.dispatchEvent(new Event("focus"));
  assert.equal(clock.state.today, "2027-01-05");
});

test("calendar dates validate leap days and shift by local days across DST", () => {
  const oldTimezone = process.env.TZ;
  try {
    process.env.TZ = "Europe/Amsterdam";
    assert.equal(shiftIsoDate("2026-03-28", 2), "2026-03-30");
    assert.equal(shiftIsoDate("2026-10-24", 2), "2026-10-26");
    assert.equal(isIsoDate("2024-02-29"), true);
    assert.equal(isIsoDate("2026-02-29"), false);
    assert.equal(isIsoDate("2026-04-31"), false);
  } finally {
    if (oldTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = oldTimezone;
  }
});
