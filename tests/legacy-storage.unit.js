import assert from "node:assert/strict";
import test from "node:test";
import { archiveLegacyResource, legacyStorageExport } from "../src/app/legacy-storage.js";
test("legacy migration retains originals and archives each version without losing corrupt records", () => {
  const entries = new Map([["legacy", '{"tasks":[]}']]);
  const storage = { getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
  archiveLegacyResource(storage, "owner", "legacy");
  archiveLegacyResource(storage, "owner", "legacy");
  assert.equal(entries.get("legacy"), '{"tasks":[]}');
  assert.equal(JSON.parse(entries.get("done-ish.legacy-backup.v1:owner")).entries.length, 1);
  entries.set("legacy", "{");
  archiveLegacyResource(storage, "owner", "legacy");
  assert.equal(JSON.parse(entries.get("done-ish.legacy-backup.v1:owner")).entries.length, 2);
  entries.set("done-ish.legacy-backup.v1:owner", "broken");
  assert.throws(() => archiveLegacyResource(storage, "owner", "legacy"));
  const backup = legacyStorageExport(storage, "owner", ["legacy"]);
  assert.equal(backup.archive, "broken");
  assert.equal(backup.originals[0].raw, "{");
  assert.equal(entries.get("legacy"), "{");
});
test("failed archive writes do not erase the original local data", () => {
  const original = "keep me";
  const storage = {
    getItem: (key) => (key === "legacy" ? original : null),
    setItem: () => {
      throw new Error("quota");
    },
  };
  assert.throws(() => archiveLegacyResource(storage, "owner", "legacy"), /quota/);
  assert.equal(storage.getItem("legacy"), original);
});
