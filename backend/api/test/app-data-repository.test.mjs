import assert from "node:assert/strict";
import test from "node:test";
import { createAppDataRepository, AppDataRevisionConflictError } from "../src/app-data-repository.mjs";

function fixture({ revision = 0, reject, rows } = {}) {
  const queries = [];
  let released = false;
  const client = {
    async query(query) {
      const command = typeof query === "string" ? { text: query, values: [] } : query;
      queries.push(command);
      if (reject?.(command)) throw new Error("database rejected write");
      return {
        rows:
          rows?.(command) ??
          (/SELECT revision/.test(command.text)
            ? [{ revision }]
            : /RETURNING revision/.test(command.text)
              ? [{ revision: revision + 1 }]
              : []),
      };
    },
    release() {
      released = true;
    },
  };
  return { repository: createAppDataRepository({ connect: async () => client }), queries, released: () => released };
}
const tasks = (count) =>
  Array.from({ length: count }, (_, index) => ({ id: `task-${index}`, title: "Bound 'value'", date: "2026-09-05" }));

test("100 work tasks use seven queries and bind all task values", async () => {
  const f = fixture();
  assert.equal(await f.repository.replace("work-tasks", tasks(100), 0), 1);
  assert.equal(f.queries.length, 7);
  const insert = f.queries.find(({ text }) => text.startsWith("INSERT INTO work_tasks"));
  assert.equal(insert.values.length, 500);
  assert.equal(insert.values[1], "Bound 'value'");
  assert.equal(insert.text.includes("Bound"), false);
  assert.match(insert.text, /\(\$496, \$497, \$498, \$499, \$500\)/);
  assert.equal(f.released(), true);
});

test("large resources use bounded batches and empty replacements still delete removed rows", async () => {
  const f = fixture();
  await f.repository.replace("work-tasks", tasks(1001), 0);
  assert.deepEqual(
    f.queries.filter(({ text }) => text.startsWith("INSERT INTO work_tasks")).map(({ values }) => values.length),
    [2500, 2500, 5],
  );
  const empty = fixture();
  await empty.repository.replace("work-tasks", [], 0);
  assert.ok(empty.queries.some(({ text }) => text === "DELETE FROM work_tasks"));
  assert.equal(
    empty.queries.some(({ text }) => text.startsWith("INSERT INTO work_tasks")),
    false,
  );
});

test("revision conflicts and failed batches roll back and release their connection", async () => {
  const conflict = fixture({ revision: 2 });
  await assert.rejects(conflict.repository.replace("work-tasks", tasks(1), 1), AppDataRevisionConflictError);
  assert.equal(conflict.queries.at(-1).text, "ROLLBACK");
  assert.equal(
    conflict.queries.some(({ text }) => text.startsWith("INSERT INTO work_tasks")),
    false,
  );
  const failed = fixture({ reject: ({ text }) => text.startsWith("INSERT INTO work_tasks") });
  await assert.rejects(failed.repository.replace("work-tasks", tasks(501), 0), /database rejected/);
  assert.equal(failed.queries.at(-1).text, "ROLLBACK");
  assert.equal(failed.released(), true);
});

test("chore writes bind structured schedules and current dates without deleting occurrence history", async () => {
  const f = fixture();
  const schedule = { frequency: "month", interval: 2, startDate: "2026-01-31", weekdays: [5], monthDays: [15, 31] };
  await f.repository.replace(
    "chores",
    {
      occurrenceOrder: ["chore-1"],
      tasks: [{ id: "chore-1", title: "Filter", details: "Monthly", nextDue: "2026-03-15", schedule }],
    },
    0,
  );
  const insert = f.queries.find(({ text }) => text.startsWith("INSERT INTO chores"));
  assert.equal(insert.values[3], JSON.stringify(schedule));
  assert.equal(insert.values[4], "2026-03-15");
  assert.match(insert.text, /schedule = coalesce\(EXCLUDED.schedule, chores.schedule\)/);
  assert.equal(
    f.queries.some(({ text }) => text.startsWith("DELETE FROM chore_occurrences")),
    false,
  );
});

test("chore deletion archives definitions and offline completions insert without overwriting history", async () => {
  const f = fixture();
  await f.repository.replace(
    "chores",
    {
      tasks: [],
      occurrenceOrder: [],
      history: [
        { id: "offline", title: "Sweep", details: "Daily", nextDue: "2026-02-01", completedAt: "2026-02-02T12:00:00Z" },
      ],
    },
    0,
  );
  assert.ok(
    f.queries.some(
      ({ text, values }) => text.startsWith("UPDATE chores SET enabled = false") && values[0].length === 0,
    ),
  );
  assert.equal(
    f.queries.some(({ text }) => text.startsWith("DELETE FROM chores")),
    false,
  );
  const history = f.queries.find(({ text }) => text.startsWith("INSERT INTO chore_occurrences"));
  assert.match(history.text, /ON CONFLICT \(chore_id, due_on\) DO NOTHING/);
  assert.equal(history.values[0], "offline");
});

test("reading chores includes archived and previous occurrences without duplicating current completions", async () => {
  const completedAt = "2026-02-02T12:00:00Z";
  const current = {
    id: "one",
    title: "Sweep",
    details: "Daily",
    nextDue: "2026-02-02",
    completedAt,
    occurrencePosition: 0,
  };
  const f = fixture({
    rows: ({ text }) =>
      text.includes("WHERE chores.enabled")
        ? [current]
        : text.includes("JOIN chores ON chores.id")
          ? [current, { ...current, nextDue: "2026-02-01" }, { ...current, id: "archived" }]
          : undefined,
  });
  const state = await f.repository.read();
  assert.equal(state.pages.chores.tasks.length, 1);
  assert.equal(state.pages.chores.history.length, 2);
  assert.deepEqual(
    state.pages.chores.history.map((item) => item.id),
    ["one", "archived"],
  );
});

test("todo list deletion protects General and preserves detached completed tasks", async () => {
  const f = fixture();
  await f.repository.replace(
    "todos",
    { lists: [], history: [{ id: "offline", title: "Done", completedAt: "2026-02-02T12:00:00Z" }] },
    0,
  );
  const detach = f.queries.find(({ text }) => text.startsWith("UPDATE todo_items SET list_id = NULL"));
  assert.match(detach.text, /completed_at IS NOT NULL/);
  assert.ok(f.queries.indexOf(detach) < f.queries.findIndex(({ text }) => text.startsWith("DELETE FROM todo_items")));
  const tasks = f.queries.find(({ text }) => text.startsWith("DELETE FROM todo_items"));
  assert.match(tasks.text, /list_id IS NOT NULL/);
  assert.match(tasks.text, /list_id <> 'general' AND completed_at IS NULL/);
  const lists = f.queries.find(({ text }) => text.startsWith("DELETE FROM todo_lists"));
  assert.match(lists.text, /id <> 'general'/);
  const history = f.queries.find(({ text }) => text.startsWith("INSERT INTO todo_items"));
  assert.equal(history.values[1], null);
  assert.match(history.text, /WHERE todo_items.list_id IS NULL/);
});

test("todo history reads independently of active lists", async () => {
  const f = fixture({
    rows: ({ text }) =>
      text.includes("FROM todo_items")
        ? [{ id: "past", listId: null, title: "Done", completedAt: "2026-02-02T12:00:00Z" }]
        : undefined,
  });
  const data = await f.repository.read();
  assert.deepEqual(data.pages.todos.lists, []);
  assert.equal(data.pages.todos.history[0].title, "Done");
});

test("explicit history replacement removes undone completions after detaching deleted tasks", async () => {
  const f = fixture();
  await f.repository.replace(
    "todos",
    {
      lists: [],
      history: [],
      replaceHistory: true,
    },
    0,
  );
  const cleanup = f.queries.find(
    ({ text }) => text === "DELETE FROM todo_items WHERE list_id IS NULL AND NOT (id = ANY($1::text[]))",
  );
  assert.deepEqual(cleanup.values, [[]]);
  assert.ok(f.queries.indexOf(cleanup) > f.queries.findIndex(({ text }) => text.startsWith("DELETE FROM todo_lists")));
});

test("legacy history additions never trigger authoritative history deletion", async () => {
  const f = fixture();
  await f.repository.replace(
    "todos",
    {
      lists: [],
      history: [{ id: "kept", title: "Done", completedAt: "2026-02-02T12:00:00Z" }],
    },
    0,
  );
  assert.equal(
    f.queries.some(({ text }) => text.startsWith("DELETE FROM todo_items WHERE list_id IS NULL")),
    false,
  );
});
