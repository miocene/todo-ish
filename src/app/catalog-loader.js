import { shallowReactive } from "vue";
import { apiFetch } from "./api.js";

/** In-memory cache shared by every page. Failed attempts leave the last complete snapshot intact. */
export function createCatalog({ path, label, fetchPage = apiFetch }) {
  const items = shallowReactive([]);
  const byId = shallowReactive(new Map());
  const state = shallowReactive({ status: "idle", error: "" });
  let request;
  const catalog = {
    label,
    items,
    byId,
    state,
    load() {
      if (request) return request;
      if (state.status === "ready") return Promise.resolve(true);
      state.status = "loading";
      state.error = "";
      request = (async () => {
        try {
          const loaded = [];
          let total;
          do {
            const response = await fetchPage(
              `${path}?limit=500&offset=${loaded.length}`,
              {
                headers: { accept: "application/json" },
              },
            );
            if (!response.ok)
              throw new Error(`${label} request failed (${response.status}).`);
            const page = await response.json();
            if (
              !Array.isArray(page.items) ||
              !Number.isInteger(page.total) ||
              page.total < 0 ||
              page.items.some(
                (item) => !item || typeof item.id !== "string" || !item.id,
              )
            ) {
              throw new Error(`${label} response is invalid.`);
            }
            total = page.total;
            if (!page.items.length && loaded.length < total)
              throw new Error(`${label} pagination did not advance.`);
            loaded.push(...page.items);
          } while (loaded.length < total);
          if (
            loaded.length !== total ||
            new Set(loaded.map((item) => item.id)).size !== loaded.length
          ) {
            throw new Error(`${label} changed during loading. Please retry.`);
          }
          items.splice(0, items.length, ...loaded);
          byId.clear();
          for (const item of loaded) byId.set(item.id, item);
          state.status = "ready";
          return true;
        } catch (error) {
          state.status = "error";
          state.error = error.message || `${label} could not be loaded.`;
          return false;
        } finally {
          request = undefined;
        }
      })();
      return request;
    },
  };
  return catalog;
}
