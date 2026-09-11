import assert from "node:assert/strict";
import { emptyResource, resourceFromState } from "../src/app-data-contract.mjs";
import {
  HISTORY_RESOURCES,
  historyDelta,
  validateHistoryDelta,
  splitHistory,
} from "../src/history-transport.mjs";
const completedAt = "2026-09-10T12:00:00.000Z";
export async function verifyHistoryTransport(repository, userId) {
  for (const resource of HISTORY_RESOURCES) {
    let state = await repository.read(userId);
    const empty = emptyResource(resource);
    // Reset legacy fixtures before testing the patch path.
    await repository.replace(
      resource,
      resource === "work-tasks"
        ? []
        : { ...empty, history: [], replaceHistory: true },
      state.revisions[resource],
      userId,
    );
    state = await repository.read(userId);
    const base = resourceFromState(state, resource);
    const history = Array.from({ length: 1001 }, (_, i) => ({
      id: `h-${i}`,
      title: `歴史 ${i}`,
      completedAt,
      ...(resource === "work-tasks" && {
        archived: true,
        date: null,
        checkedAt: completedAt,
      }),
      ...(resource === "chores" && { details: "Daily", nextDue: "2026-09-01" }),
    }));
    const next = resource === "work-tasks" ? history : { ...base, history };
    await repository.patch(
      resource,
      validateHistoryDelta(resource, historyDelta(resource, base, next)),
      state.revisions[resource],
      userId,
    );
    state = await repository.read(userId, {
      resources: [resource],
      history: "omit",
    });
    assert.equal(
      splitHistory(resource, resourceFromState(state, resource)).history.length,
      0,
    );
    assert.deepEqual(state.includedResources, [resource]);
    const first = await repository.history(resource, userId, 0, 500);
    const second = await repository.history(
      resource,
      userId,
      first.nextOffset,
      500,
    );
    const last = await repository.history(
      resource,
      userId,
      second.nextOffset,
      500,
    );
    assert.equal(first.items.length, 500);
    assert.equal(second.items.length, 500);
    assert.equal(last.items.length, 1);
    assert.equal(last.nextOffset, null);
    assert.equal(
      new Set(
        [...first.items, ...second.items, ...last.items].map((item) => item.id),
      ).size,
      1001,
    );
    assert.equal(first.revision, state.revisions[resource]);
    const full = resourceFromState(await repository.read(userId), resource);
    const edited =
      resource === "work-tasks"
        ? full.slice(1)
        : { ...full, history: full.history.slice(1) };
    await repository.patch(
      resource,
      validateHistoryDelta(resource, historyDelta(resource, full, edited)),
      first.revision,
      userId,
    );
    assert.equal(
      splitHistory(
        resource,
        resourceFromState(await repository.read(userId), resource),
      ).history.length,
      1000,
    );
    await assert.rejects(
      repository.patch(
        resource,
        validateHistoryDelta(resource, historyDelta(resource, full, edited)),
        first.revision,
        userId,
      ),
      /changed after revision/,
    );
  }
  // The intermediate uncheck never reaches the API; deleting must still undo it.
  let state = await repository.read(userId);
  const previous = {
    lists: [
      {
        id: "undo-list",
        title: "List",
        tasks: [{ id: "undo", title: "Completed", completedAt }],
      },
    ],
    history: [],
    replaceHistory: true,
  };
  await repository.replace("todos", previous, state.revisions.todos, userId);
  state = await repository.read(userId);
  await repository.patch(
    "todos",
    validateHistoryDelta(
      "todos",
      historyDelta("todos", state.pages.todos, { lists: [] }),
    ),
    state.revisions.todos,
    userId,
  );
  assert.equal((await repository.read(userId)).pages.todos.history, undefined);
}
