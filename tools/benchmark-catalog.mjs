import assert from "node:assert/strict";
import snapshot from "../backend/catalogs/dmc-floss.snapshot.json" with { type: "json" };
import { floss, flossSearchIndex } from "../src/app/floss-catalog.js";
const items = snapshot.entries.map((item) => ({ ...item, id: `dmc${item.number.toLocaleLowerCase()}` }));
floss.push(...items);
const queries = ["r", "re", "red", "b", "bl", "blue", "", "3", "31", "310"];
const baseline = (query) =>
  items
    .filter((item) => [item.id, item.number, item.colorName].join(" ").toLocaleLowerCase().includes(query))
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
const indexed = flossSearchIndex.value;
const optimized = (query) => indexed.filter((item) => item.searchText.includes(query));
for (const query of queries)
  assert.deepEqual(
    optimized(query).map((item) => item.id),
    baseline(query).map((item) => item.id),
  );
const measure = (fn) => {
  const start = performance.now();
  for (let i = 0; i < 1000; i++) fn(queries[i % queries.length]);
  return (performance.now() - start) / 1000;
};
console.log(
  JSON.stringify({
    entries: items.length,
    queries: 1000,
    baselineMilliseconds: measure(baseline),
    indexedMilliseconds: measure(optimized),
  }),
);
