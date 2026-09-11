import assert from "node:assert/strict";
import test from "node:test";
import { initialAppData } from "./app-data.js";
import {
  APP_DATA_RESOURCES,
  validateAppDataResource,
} from "../../backend/api/src/app-data-validation.mjs";

test("default resources are valid empty data and each caller receives its own copy", () => {
  for (const resource of APP_DATA_RESOURCES) {
    assert.doesNotThrow(() =>
      validateAppDataResource(resource, initialAppData(resource)),
    );
  }
  assert.deepEqual(initialAppData("work-tasks"), []);
  assert.deepEqual(initialAppData("todos"), { lists: [] });
  assert.deepEqual(initialAppData("printing"), { projects: [] });
  assert.deepEqual(initialAppData("filament-inventory"), {});
  const todos = initialAppData("todos");
  todos.lists.push({ id: "local" });
  assert.deepEqual(initialAppData("todos"), { lists: [] });
});
