import assert from "node:assert/strict";
import { createAppDataRepository } from "../src/app-data-repository.mjs";
import { exportAccountData, previewAccountImport } from "../src/data-transfer.mjs";
export async function verifyDataTransfer(repository, pool, first, second) {
  const account = { id: first, username: first };
  let state = await repository.read(first);
  await repository.replace(
    "shopping",
    {
      tasks: [
        {
          id: "restore-purchase",
          title: "A spool",
          source: "filament-shortage",
          filamentId: "restore-spool",
          quantity: 1,
          completedAt: "2026-09-10T12:00:00.000Z",
        },
        { id: "shared-milk", title: "Milk" },
      ],
      history: [],
    },
    state.revisions.shopping,
    first,
  );
  state = await repository.read(first);
  const data = exportAccountData(account, state);
  assert.ok(data.private.shopping.tasks.every((item) => item.source));
  assert.ok(data.shared.shopping.tasks.every((item) => !item.source));
  const otherBefore = exportAccountData({ id: second, username: second }, await repository.read(second)).private;
  assert.throws(() => previewAccountImport({ id: second, username: second }, state, data), /another account/);
  const remap = previewAccountImport({ id: second, username: second }, await repository.read(second), data, {
    allowAccountRemap: true,
  });
  assert.equal(remap.account.id, second);
  await repository.replace("filament-inventory", {}, state.revisions["filament-inventory"], first);
  state = await repository.read(first);
  const preview = previewAccountImport(account, state, data, { mode: "replace" });
  assert.equal(preview.includeShared, false);
  assert.equal("filament-inventory" in preview.resources, false);
  assert.deepEqual((await repository.read(first)).revisions, state.revisions, "preview must not mutate data");
  await repository.restore(preview);
  let restored = await repository.read(first);
  assert.deepEqual(exportAccountData(account, restored).private, data.private);
  assert.deepEqual(restored.inventories.filament, {}, "historical purchases do not refill consumed stock");
  assert.deepEqual(
    exportAccountData({ id: second, username: second }, await repository.read(second)).private,
    otherBefore,
  );
  await assert.rejects(repository.restore(preview), /changed after revision/);
  const all = previewAccountImport(account, restored, data, { mode: "replace", includeShared: true });
  await repository.restore(all);
  restored = await repository.read(first);
  assert.equal(restored.inventories.filament["restore-spool"], 1);
  await repository.replace("shopping", restored.pages.shopping, restored.revisions.shopping, first);
  assert.equal(
    (await repository.read(first)).inventories.filament["restore-spool"],
    1,
    "normal saves recognize restored receipts",
  );
  const invalid = structuredClone(data);
  invalid.shared.shopping.tasks[0].productLink = "javascript:alert(1)";
  assert.throws(() => previewAccountImport(account, restored, invalid, { includeShared: true }), /HTTP/);
  // Merge keeps existing rows while restoring incoming IDs and their latest values.
  const incoming = structuredClone(data);
  incoming.private["work-tasks"] = [{ id: "new-import", title: "Imported", date: null }];
  const merged = previewAccountImport(account, await repository.read(first), incoming);
  assert.ok(merged.resources["work-tasks"].length > 1);
  await repository.restore(merged);
  const beforeFailure = await repository.read(first);
  const failPlan = previewAccountImport(account, beforeFailure, incoming, { mode: "replace" });
  const failing = createAppDataRepository({
    connect: async () => {
      const client = await pool.connect();
      return {
        release: () => client.release(),
        query: (query, ...args) => {
          const text = typeof query === "string" ? query : query.text;
          if (text.startsWith("DELETE FROM completed_project_tasks")) throw new Error("simulated import failure");
          return client.query(query, ...args);
        },
      };
    },
  });
  await assert.rejects(failing.restore(failPlan), /simulated import failure/);
  assert.deepEqual(await repository.read(first), beforeFailure, "failed imports roll back every resource and revision");
}
