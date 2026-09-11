import assert from "node:assert/strict";
import test from "node:test";
import {
  calendarDate,
  getWorkDateBounds,
  isoDate,
  requestedDate,
} from "./work-calendar.js";

test("work history always includes the backdating window, even with only future completions", () => {
  const bounds = getWorkDateBounds(calendarDate("2026-09-14"), [
    { date: "2026-09-15", completedAt: "2026-09-14T12:00:00Z" },
  ]);
  assert.equal(isoDate(bounds.firstDate), "2026-09-11");
  assert.equal(isoDate(bounds.firstAssignableDate), "2026-09-11");
  assert.equal(isoDate(bounds.lastDate), "2026-09-28");
});

test("old completed history is viewable without expanding the assignment window", () => {
  const bounds = getWorkDateBounds(calendarDate("2026-09-14"), [
    { date: "2026-08-01", completedAt: "2026-08-02T12:00:00Z" },
    { date: "2026-07-01", completed: false },
  ]);
  assert.equal(isoDate(bounds.firstDate), "2026-08-01");
  assert.equal(isoDate(bounds.firstAssignableDate), "2026-09-11");
  assert.equal(
    isoDate(requestedDate("2026-07-01", calendarDate("2026-09-14"), bounds)),
    "2026-08-01",
  );
  assert.equal(
    isoDate(requestedDate("2026-12-01", calendarDate("2026-09-14"), bounds)),
    "2026-09-28",
  );
  assert.equal(
    isoDate(requestedDate("2026-02-30", calendarDate("2026-09-14"), bounds)),
    "2026-09-14",
  );
});

test("backdating uses calendar days across year and daylight-saving boundaries", () => {
  for (const [today, expected] of [
    ["2027-01-01", "2026-12-29"],
    ["2026-03-30", "2026-03-27"],
    ["2026-10-26", "2026-10-23"],
  ]) {
    assert.equal(
      isoDate(getWorkDateBounds(calendarDate(today)).firstAssignableDate),
      expected,
    );
  }
});
