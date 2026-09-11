import assert from "node:assert/strict";
import { AppDataRevisionConflictError } from "../src/app-data-repository.mjs";
import { validateAppDataResource } from "../src/app-data-validation.mjs";

export async function verifyMultiUserData(repository, first, second) {
  const write = async (user, resource, value) => {
    const state = await repository.read(user);
    return repository.replace(
      resource,
      validateAppDataResource(resource, value),
      state.revisions[resource],
      user,
    );
  };
  const completedAt = "2026-09-09T12:00:00.000Z";
  for (const user of [first, second]) {
    await write(user, "work-tasks", [
      { id: "same-work", title: user, date: null },
    ]);
    await write(user, "work-statuses", {
      "2026-09-09": user === first ? "pto" : "work",
    });
    await write(user, "colors", { backlog: user === first ? 37 : 28 });
    await write(user, "todos", {
      lists: [
        {
          id: "general",
          title: "General",
          tasks: [{ id: "same-todo", title: user }],
        },
      ],
      history: [],
      replaceHistory: true,
    });
    await write(user, "printing", {
      projects: [
        {
          id: "same-project",
          title: user,
          color: 37,
          tasks: [{ id: "same-part", title: user, filaments: [] }],
        },
      ],
      history: [],
    });
    await write(user, "cross-stitch", {
      projects: [{ id: "same-stitch", title: user, color: 37, tasks: [] }],
      history: [],
    });
    await write(user, "preferences", {
      hiddenNavigation: user === first ? ["printing"] : ["work", "catalog"],
    });
  }
  for (const user of [first, second]) {
    const state = await repository.read(user);
    assert.equal(state.workTasks[0].title, user);
    assert.equal(
      state.pages.todos.lists.find((list) => list.id === "general").tasks[0]
        .title,
      user,
    );
    assert.equal(state.pages.printing.projects[0].title, user);
    assert.equal(state.pages.crossStitch.projects[0].title, user);
    assert.equal(
      state.workStatuses["2026-09-09"],
      user === first ? "pto" : "work",
    );
    assert.equal(state.colors.backlog, user === first ? 37 : 28);
    assert.deepEqual(
      state.preferences.hiddenNavigation,
      user === first ? ["printing"] : ["work", "catalog"],
    );
  }
  await write(second, "printing", { projects: [], history: [] });
  assert.equal(
    (await repository.read(first)).pages.printing.projects.length,
    1,
  );
  await write(second, "work-tasks", []);
  assert.equal((await repository.read(first)).workTasks.length, 1);

  await write(first, "chores", {
    occurrenceOrder: ["shared-chore"],
    tasks: [
      {
        id: "shared-chore",
        title: "Plants",
        details: "Weekly",
        nextDue: "2026-09-09",
      },
    ],
  });
  const chores = (await repository.read(second)).pages.chores;
  assert.equal(chores.tasks[0].title, "Plants");
  Object.assign(chores.tasks[0], { completed: true, completedAt });
  await write(second, "chores", chores);
  assert.equal(
    (await repository.read(first)).pages.chores.tasks[0].completed,
    true,
  );
  await write(second, "chores", { tasks: [], occurrenceOrder: [] });
  assert.equal((await repository.read(first)).pages.chores.tasks.length, 0);

  const purchase = {
    id: "first-purchase",
    title: "Personal filament",
    source: "filament-shortage",
    filamentId: "pla",
    quantity: 2,
    completedAt,
  };
  await write(first, "shopping", {
    tasks: [{ id: "shared-item", title: "Milk" }, purchase],
    history: [],
  });
  const secondShopping = (await repository.read(second)).pages.shopping;
  assert.deepEqual(
    secondShopping.tasks.map((item) => item.id),
    ["shared-item"],
  );
  Object.assign(secondShopping.tasks[0], { completed: true, completedAt });
  const secondPurchase = {
    id: "second-purchase",
    title: "Personal floss",
    source: "floss-shortage",
    flossId: "dmc",
    quantity: 1,
    completedAt,
  };
  secondShopping.tasks.push(secondPurchase);
  await write(second, "shopping", secondShopping);
  const firstShopping = (await repository.read(first)).pages.shopping;
  assert.equal(
    firstShopping.tasks.find((item) => item.id === "shared-item").completed,
    true,
  );
  assert.ok(firstShopping.tasks.some((item) => item.id === purchase.id));
  assert.ok(!firstShopping.tasks.some((item) => item.id === secondPurchase.id));
  await write(second, "shopping", { tasks: [], history: [secondPurchase] });
  assert.deepEqual(
    (await repository.read(first)).pages.shopping.tasks.map((item) => item.id),
    [purchase.id],
  );
  assert.equal(
    (await repository.read(first)).pages.shopping.history,
    undefined,
  );
  await write(first, "shopping", { tasks: [], history: [purchase] });
  assert.deepEqual(
    (await repository.read(second)).pages.shopping.history.map(
      (item) => item.id,
    ),
    [secondPurchase.id],
  );

  const stale = await repository.read(first);
  await write(second, "shopping", {
    tasks: [{ id: "new-shared", title: "Bread" }],
    history: [secondPurchase],
  });
  await assert.rejects(
    repository.replace(
      "shopping",
      { tasks: [] },
      stale.revisions.shopping,
      first,
    ),
    AppDataRevisionConflictError,
  );
  assert.equal(
    (await repository.read(first)).pages.shopping.tasks[0].title,
    "Bread",
  );
  for (const resource of ["filament-inventory", "floss-inventory"]) {
    await write(first, resource, { shared: 2 });
    const key = resource === "filament-inventory" ? "filament" : "floss";
    assert.equal((await repository.read(second)).inventories[key].shared, 2);
    await write(second, resource, { shared: 3 });
    assert.equal((await repository.read(first)).inventories[key].shared, 3);
  }
  await assert.rejects(repository.read(), /authenticated user ID/);
  await assert.rejects(
    repository.replace("shopping", { tasks: [] }, 0),
    /authenticated user ID/,
  );
}
