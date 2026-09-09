import { expect, test as base } from "@playwright/test";
import { APP_DATA_RESOURCES, validateAppDataResource } from "../backend/api/src/app-data-validation.mjs";
import filamentCatalog from "../backend/catalogs/bambu-filaments.snapshot.json" with { type: "json" };
import flossCatalog from "../backend/catalogs/dmc-floss.snapshot.json" with { type: "json" };

const appDataByPage = new WeakMap();

function emptyAppData(values, revisions) {
  return {
    initializedResources: Object.keys(values),
    revisions,
    workTasks: values["work-tasks"] ?? [],
    workStatuses: values["work-statuses"] ?? {},
    colors: values["colors"] ?? {},
    pages: {
      chores: values.chores ?? { occurrenceOrder: [], tasks: [] },
      todos: values.todos ?? { lists: [] },
      shopping: values.shopping ?? { tasks: [] },
      printing: values.printing ?? { projects: [] },
      crossStitch: values["cross-stitch"] ?? { projects: [] },
    },
    inventories: {
      filament: values["filament-inventory"] ?? {},
      floss: values["floss-inventory"] ?? {},
    },
  };
}

const test = base.extend({
  appData: [
    async ({ page }, use) => {
      const values = {};
      const revisions = Object.fromEntries(APP_DATA_RESOURCES.map((resource) => [resource, 0]));
      let supportsColors = true;
      const writeFailures = new Map();
      const validationErrors = [];
      let session = {
        authenticated: true,
        bootstrapRequired: false,
        user: { username: "owner", displayName: "Owner" },
      };
      const controller = {
        get: (resource) => values[resource],
        validationErrors,
        setWriteFailure: (resource, status) => writeFailures.set(resource, status),
        set: (resource, value) => {
          values[resource] = value;
        },
        setSession: (value) => {
          session = value;
        },
        setColorSupport: (value) => {
          supportsColors = value;
        },
      };
      appDataByPage.set(page, controller);

      await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const json = (body, status = 200, headers = {}) =>
          route.fulfill({ status, headers, contentType: "application/json", body: JSON.stringify(body) });

        if (request.method() === "GET" && url.pathname === "/api/auth/session") {
          await json(session);
          return;
        }

        if (request.method() === "GET" && url.pathname === "/api/data") {
          const data = emptyAppData(values, { ...revisions });
          if (!supportsColors) {
            delete data.colors;
            delete data.revisions.colors;
            data.initializedResources = data.initializedResources.filter((resource) => resource !== "colors");
          }
          await json(data);
          return;
        }

        const resourceMatch = /^\/api\/data\/([a-z-]+)$/.exec(url.pathname);
        if (request.method() === "PUT" && resourceMatch) {
          const resource = resourceMatch[1];
          if (writeFailures.get(resource)) {
            await json({ error: "Simulated save failure" }, writeFailures.get(resource));
            return;
          }
          if (!supportsColors && resource === "colors") {
            await json({ error: "Not Found" }, 404);
            return;
          }
          const expectedRevision = Number(/^"(\d+)"$/.exec(request.headers()["if-match"] || "")?.[1]);
          if (expectedRevision !== revisions[resource]) {
            await json({ error: "Revision conflict", currentRevision: revisions[resource] }, 409);
            return;
          }
          const submittedValue = request.postDataJSON();
          try {
            validateAppDataResource(resource, submittedValue);
          } catch (error) {
            validationErrors.push(error.message);
            await json({ error: error.message }, 400);
            return;
          }
          if (!supportsColors && resource === "todos") {
            for (const list of submittedValue.lists) delete list.color;
          }
          values[resource] =
            resource === "shopping" ? { tasks: submittedValue.tasks.filter((task) => !task.source) } : submittedValue;
          revisions[resource] += 1;
          await json({ resource, revision: revisions[resource] }, 200, { etag: `"${revisions[resource]}"` });
          return;
        }

        if (request.method() === "GET" && url.pathname === "/api/catalogs/filaments") {
          const offset = Number(url.searchParams.get("offset") || 0);
          const limit = Number(url.searchParams.get("limit") || 100);
          await json({
            total: filamentCatalog.entries.length,
            items: filamentCatalog.entries.slice(offset, offset + limit),
          });
          return;
        }

        if (request.method() === "GET" && url.pathname === "/api/catalogs/floss") {
          const offset = Number(url.searchParams.get("offset") || 0);
          const limit = Number(url.searchParams.get("limit") || 100);
          const entries = flossCatalog.entries.map((thread) => ({
            ...thread,
            id: `dmc${thread.number.toLocaleLowerCase()}`,
          }));
          await json({ total: entries.length, items: entries.slice(offset, offset + limit) });
          return;
        }

        await json({ error: "Not found" }, 404);
      });
      await use(controller);
    },
    { auto: true },
  ],
});

export { test, expect, appDataByPage };
