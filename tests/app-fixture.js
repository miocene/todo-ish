import {
  applyHistoryDelta,
  HISTORY_RESOURCES,
  splitHistory,
  validateHistoryDelta,
} from "../backend/api/src/history-transport.mjs";
import {
  emptyResource,
  setStateResource,
} from "../backend/api/src/app-data-contract.mjs";
import { expect, test as base } from "@playwright/test";
import {
  APP_DATA_RESOURCES,
  validateAppDataResource,
} from "../backend/api/src/app-data-validation.mjs";
import filamentCatalog from "../backend/catalogs/bambu-filaments.snapshot.json" with { type: "json" };
import flossCatalog from "../backend/catalogs/dmc-floss.snapshot.json" with { type: "json" };

const appDataByPage = new WeakMap();

function emptyAppData(values, revisions, userId = "owner") {
  const state = {
    userId,
    revisionTransport: 1,
    legacyOwner: userId === "owner",
    initializedResources: Object.keys(values),
    revisions,
  };
  for (const resource of APP_DATA_RESOURCES)
    setStateResource(
      state,
      resource,
      values[resource] ?? emptyResource(resource),
    );
  return state;
}

const test = base.extend({
  appData: [
    async ({ page }, use, testInfo) => {
      const diagnostics = [];
      const record = (message) => {
        diagnostics.push(message);
        if (diagnostics.length > 50) diagnostics.shift();
      };
      page.on("pageerror", (error) => record(`Page error: ${error.message}`));
      page.on("requestfailed", (request) =>
        record(
          `Request failed: ${request.url()} ${request.failure()?.errorText}`,
        ),
      );
      page.on("console", (message) => {
        if (message.type() === "error")
          record(`Console error: ${message.text()}`);
      });
      const values = {};
      const revisions = Object.fromEntries(
        APP_DATA_RESOURCES.map((resource) => [resource, 0]),
      );
      let supportsColors = true;
      const writeFailures = new Map();
      const validationErrors = [];
      let session = {
        authenticated: true,
        bootstrapRequired: false,
        user: { id: "owner", username: "owner", displayName: "Owner" },
      };
      const controller = {
        get: (resource) => values[resource],
        validationErrors,
        setWriteFailure: (resource, status) =>
          writeFailures.set(resource, status),
        set: (resource, value) => {
          values[resource] = value;
        },
        update: (resource, value) => {
          values[resource] = value;
          revisions[resource] += 1;
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
          route.fulfill({
            status,
            headers,
            contentType: "application/json",
            body: JSON.stringify(body),
          });

        if (
          request.method() === "GET" &&
          url.pathname === "/api/auth/session"
        ) {
          await json(session);
          return;
        }

        if (
          request.method() === "GET" &&
          url.pathname === "/api/data/revisions"
        ) {
          await json({ userId: session.user?.id, revisions: { ...revisions } });
          return;
        }
        if (request.method() === "GET" && url.pathname === "/api/data") {
          const data = emptyAppData(values, { ...revisions }, session.user?.id);
          if (!supportsColors) {
            delete data.colors;
            delete data.revisions.colors;
            data.initializedResources = data.initializedResources.filter(
              (resource) => resource !== "colors",
            );
          }
          if (url.searchParams.get("history") === "omit") {
            data.historyTransport = 1;
            for (const resource of HISTORY_RESOURCES)
              setStateResource(
                data,
                resource,
                splitHistory(
                  resource,
                  values[resource] ?? emptyResource(resource),
                ).active,
              );
          }
          await json(data);
          return;
        }
        const historyMatch = /^\/api\/data\/history\/([a-z-]+)$/.exec(
          url.pathname,
        );
        if (request.method() === "GET" && historyMatch) {
          const resource = historyMatch[1];
          const history = splitHistory(
            resource,
            values[resource] ?? emptyResource(resource),
          ).history;
          const offset = Number(url.searchParams.get("offset") || 0);
          const items = history.slice(offset, offset + 500);
          await json({
            userId: session.user?.id,
            resource,
            revision: revisions[resource],
            items,
            nextOffset: items.length === 500 ? offset + 500 : null,
          });
          return;
        }

        const resourceMatch = /^\/api\/data\/([a-z-]+)$/.exec(url.pathname);
        if (request.method() === "PUT" && resourceMatch) {
          const resource = resourceMatch[1];
          if (writeFailures.get(resource)) {
            await json(
              { error: "Simulated save failure" },
              writeFailures.get(resource),
            );
            return;
          }
          if (!supportsColors && resource === "colors") {
            await json({ error: "Not Found" }, 404);
            return;
          }
          const expectedRevision = Number(
            /^"(\d+)"$/.exec(request.headers()["if-match"] || "")?.[1],
          );
          if (expectedRevision !== revisions[resource]) {
            await json(
              {
                error: "Revision conflict",
                currentRevision: revisions[resource],
              },
              409,
            );
            return;
          }
          let submittedValue = request.postDataJSON();
          try {
            if (request.headers()["x-history-mode"] === "patch-v1") {
              validateHistoryDelta(resource, submittedValue);
              submittedValue = applyHistoryDelta(
                resource,
                values[resource] ?? emptyResource(resource),
                submittedValue,
              );
              if (["chores", "todos"].includes(resource))
                submittedValue = {
                  ...submittedValue,
                  history: submittedValue.history ?? [],
                  replaceHistory: true,
                };
            }
            validateAppDataResource(resource, submittedValue);
          } catch (error) {
            validationErrors.push(error.message);
            await json({ error: error.message }, 400);
            return;
          }
          if (!supportsColors && resource === "todos") {
            for (const list of submittedValue.lists) delete list.color;
          }
          if (resource === "chores") {
            const current = new Set(
              submittedValue.tasks.map((item) => `${item.id}:${item.nextDue}`),
            );
            const history = new Map(
              [
                ...(submittedValue.replaceHistory
                  ? []
                  : (values.chores?.history ?? [])),
                ...(submittedValue.replaceHistory
                  ? []
                  : (values.chores?.tasks ?? []).filter(
                      (item) => item.completedAt,
                    )),
                ...(submittedValue.history ?? []),
              ].map((item) => [`${item.id}:${item.nextDue}`, item]),
            );
            for (const key of current) history.delete(key);
            delete submittedValue.replaceHistory;
            if (history.size) submittedValue.history = [...history.values()];
            else delete submittedValue.history;
          }
          if (resource === "todos") {
            const previous = values.todos ?? { lists: [] };
            const general = previous.lists.find(
              (list) => list.id === "general",
            );
            if (
              general &&
              !submittedValue.lists.some((list) => list.id === "general")
            )
              submittedValue.lists.unshift(general);
            const remainingTasks = new Set(
              submittedValue.lists.flatMap((list) =>
                list.tasks.map((task) => task.id),
              ),
            );
            const history =
              submittedValue.replaceHistory === true
                ? new Map(submittedValue.history.map((task) => [task.id, task]))
                : new Map(
                    [
                      ...(previous.history ?? []),
                      ...previous.lists.flatMap((list) =>
                        list.tasks.filter(
                          (task) =>
                            task.completedAt && !remainingTasks.has(task.id),
                        ),
                      ),
                      ...(submittedValue.history ?? []),
                    ].map((task) => [task.id, task]),
                  );
            for (const id of remainingTasks) history.delete(id);
            if (history.size) submittedValue.history = [...history.values()];
            else delete submittedValue.history;
            delete submittedValue.replaceHistory;
          }
          if (resource === "shopping") {
            const purchases = (data) =>
              new Map(
                [...(data?.tasks ?? []), ...(data?.history ?? [])]
                  .filter((item) => item.source && item.completedAt)
                  .map((item) => [item.id, item]),
              );
            const before = purchases(values.shopping);
            const after = purchases(submittedValue);
            const changes = [
              ...[...before.values()]
                .filter((item) => !after.has(item.id))
                .map((item) => ({ item, direction: -1 })),
              ...[...after.values()]
                .filter((item) => !before.has(item.id))
                .map((item) => ({ item, direction: 1 })),
            ];
            const affected = new Set(
              changes.map(({ item }) =>
                item.source === "filament-shortage"
                  ? "filament-inventory"
                  : "floss-inventory",
              ),
            );
            if ([...affected].some((key) => writeFailures.get(key))) {
              await json({ error: "Simulated atomic stock failure" }, 503);
              return;
            }
            for (const { item, direction } of changes) {
              const key =
                item.source === "filament-shortage"
                  ? "filament-inventory"
                  : "floss-inventory";
              const id = item.filamentId ?? item.flossId;
              values[key] ??= {};
              values[key][id] = Math.max(
                0,
                (values[key][id] ?? 0) + direction * item.quantity,
              );
            }
            for (const key of affected) revisions[key] += 1;
          }
          values[resource] = submittedValue;
          revisions[resource] += 1;
          await json({ resource, revision: revisions[resource] }, 200, {
            etag: `"${revisions[resource]}"`,
          });
          return;
        }

        if (
          request.method() === "GET" &&
          url.pathname === "/api/catalogs/filaments"
        ) {
          const offset = Number(url.searchParams.get("offset") || 0);
          const limit = Number(url.searchParams.get("limit") || 100);
          await json({
            total: filamentCatalog.entries.length,
            items: filamentCatalog.entries.slice(offset, offset + limit),
          });
          return;
        }

        if (
          request.method() === "GET" &&
          url.pathname === "/api/catalogs/floss"
        ) {
          const offset = Number(url.searchParams.get("offset") || 0);
          const limit = Number(url.searchParams.get("limit") || 100);
          const entries = flossCatalog.entries.map((thread) => ({
            ...thread,
            id: `dmc${thread.number.toLocaleLowerCase()}`,
          }));
          await json({
            total: entries.length,
            items: entries.slice(offset, offset + limit),
          });
          return;
        }

        await json({ error: "Not found" }, 404);
      });
      try {
        await use(controller);
      } finally {
        if (testInfo.status !== testInfo.expectedStatus) {
          const content = await page
            .locator("body")
            .innerText({ timeout: 1000 })
            .catch(() => "Page unavailable");
          await testInfo.attach("browser-diagnostics", {
            body: JSON.stringify(
              { url: page.url(), diagnostics, page: content.slice(0, 20_000) },
              null,
              2,
            ),
            contentType: "application/json",
          });
        }
      }
      expect(validationErrors, "Unexpected API validation failures").toEqual(
        [],
      );
    },
    { auto: true },
  ],
});

async function advisory(check) {
  try {
    await check(expect.configure({ timeout: 250 }));
  } catch (error) {
    if (!error.matcherResult) throw error;
    const description = error.message;
    test.info().annotations.push({ type: "warning", description });
    console.warn(`[quality warning] ${description.split("\n")[0]}`);
  }
}

export { test, expect, appDataByPage, advisory };
