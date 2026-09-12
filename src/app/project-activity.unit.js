import assert from "node:assert/strict";
import test from "node:test";
import { recordProjectActivity } from "./project-activity.js";
import {
  collectCompletedActivity,
  groupActivityByDay,
  buildActivityCalendar,
} from "./activity.js";
import { validateAppDataResource } from "../../backend/api/src/app-data-validation.mjs";

test("project activity records creation and saved stitch deltas, grouped per project and day", () => {
  const history = [];
  const project = {
    id: "project-1",
    title: "Flowers",
    tasks: [
      { id: "red", crossesDone: 10 },
      { id: "blue", crossesDone: 5 },
    ],
  };
  const first = "2026-09-10T12:00:00Z";
  recordProjectActivity(history, project, undefined, true, first);
  const previous = structuredClone(project);
  project.tasks[0].crossesDone = 30;
  recordProjectActivity(history, project, previous, true, first);
  recordProjectActivity(history, project, project, true, first);
  const correction = structuredClone(project);
  project.tasks[1].crossesDone = 2;
  recordProjectActivity(history, project, correction, true, first);
  const beforeRemoval = structuredClone(project);
  project.tasks.pop();
  recordProjectActivity(history, project, beforeRemoval, true, first);
  assert.equal(history.length, 4);
  const printing = [];
  recordProjectActivity(
    printing,
    { id: "print", title: "Vase", tasks: [] },
    undefined,
    false,
    first,
  );
  const data = {
    "work-tasks": [],
    chores: { tasks: [] },
    todos: { lists: [] },
    shopping: { tasks: [] },
    printing: { projects: [], history: printing },
    "cross-stitch": { projects: [], history },
  };
  // Events survive validation and project deletion through retained history.
  data["cross-stitch"] = validateAppDataResource(
    "cross-stitch",
    data["cross-stitch"],
  );
  const items = collectCompletedActivity((resource) => data[resource]);
  assert.deepEqual(items.map((item) => item.title).sort(), [
    "Created project: Flowers",
    "Created project: Vase",
    "Flowers - 32 stitches",
  ]);
  assert.equal(items.find((item) => item.stitches).icon, "yarn");
  const days = groupActivityByDay(items, 2026);
  assert.equal(days[0].stitches, 32);
  assert.equal(
    buildActivityCalendar(2026, days).days.find(
      (day) => day.date === days[0].date,
    ).count,
    3,
  );
});

test("progress on different days records separate deltas", () => {
  const history = [];
  const project = {
    id: "p",
    title: "Bird",
    tasks: [{ id: "a", crossesDone: 20 }],
  };
  recordProjectActivity(
    history,
    project,
    { tasks: [{ id: "a", crossesDone: 10 }] },
    true,
    "2026-09-10T12:00:00Z",
  );
  recordProjectActivity(
    history,
    project,
    { tasks: [{ id: "a", crossesDone: 15 }] },
    true,
    "2026-09-11T12:00:00Z",
  );
  assert.deepEqual(
    history.map((item) => item.event.stitches),
    [10, 5],
  );
});
