import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { AppDataRevisionConflictError } from "../src/app-data-repository.mjs";

export async function verifyAtomicPurchases(repository, first, second) {
  const write = async (user, resource, value) =>
    repository.replace(resource, value, (await repository.read(user)).revisions[resource], user);
  const purchase = (catalogId, quantity = 1) => ({
    id: randomUUID(),
    title: "Purchase",
    source: "filament-shortage",
    filamentId: catalogId,
    quantity,
    completedAt: new Date().toISOString(),
  });
  for (const user of [first, second]) await write(user, "shopping", { tasks: [], history: [] });
  await write(first, "filament-inventory", {});
  const buys = [purchase("concurrent"), purchase("concurrent")];
  const revision = (await repository.read(first)).revisions.shopping;
  const writes = await Promise.allSettled(
    [first, second].map((user, index) =>
      repository.replace("shopping", { tasks: [buys[index]], history: [] }, revision, user),
    ),
  );
  assert.equal(writes.filter((result) => result.status === "fulfilled").length, 1);
  const loser = writes.findIndex((result) => result.status === "rejected");
  assert.ok(writes[loser].reason instanceof AppDataRevisionConflictError);
  await write([first, second][loser], "shopping", { tasks: [buys[loser]], history: [] });
  assert.equal((await repository.read(first)).inventories.filament.concurrent, 2);
  // A lost response followed by resubmission cannot apply the purchase twice.
  await write(first, "shopping", { tasks: [buys[0]], history: [] });
  assert.equal((await repository.read(first)).inventories.filament.concurrent, 2);
  // Deleting a completed row retains history and stock.
  await write(first, "shopping", { tasks: [], history: [buys[0]] });
  assert.equal((await repository.read(first)).inventories.filament.concurrent, 2);
  // Reverse after someone consumed the stock; never subtract more than exists.
  await write(first, "filament-inventory", { concurrent: 0 });
  await write(first, "shopping", { tasks: [], history: [] });
  assert.equal((await repository.read(first)).inventories.filament.concurrent ?? 0, 0);
  await assert.rejects(write(first, "shopping", { tasks: [buys[0]], history: [] }), /cannot be changed or reused/);
  assert.equal((await repository.read(second)).pages.shopping.tasks[0].id, buys[1].id);
  // A failure after an earlier stock adjustment rolls back the purchase receipts too.
  await write(first, "filament-inventory", { full: 10_000_000 });
  const failed = [purchase("room"), purchase("full")];
  await assert.rejects(write(first, "shopping", { tasks: failed, history: [] }), /inventory limit/);
  let state = await repository.read(first);
  assert.equal(state.inventories.filament.room, undefined);
  assert.equal(state.pages.shopping.tasks.length, 0);
  await write(first, "filament-inventory", {});
  await write(first, "shopping", { tasks: failed, history: [] });
  state = await repository.read(first);
  assert.equal(state.inventories.filament.room, 1);
  assert.equal(state.inventories.filament.full, 1);
}
