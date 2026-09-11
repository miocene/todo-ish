import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

function files(directory) {
  return readdirSync(new URL(`${directory}/`, root), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? files(path) : [path];
  });
}

const sources = files("src").filter((path) => /\.(?:js|vue|css)$/.test(path));
const clientSource = sources
  .filter((path) => /\.(?:js|vue)$/.test(path))
  .map(read)
  .join("\n");
assert.doesNotMatch(
  clientSource,
  /<style\s+scoped\b/i,
  "Component styles should remain in their CSS files",
);
assert.doesNotMatch(read("src/app/filament-catalog.js"), /\.snapshot\.json/);
assert.doesNotMatch(read("src/app/floss-catalog.js"), /\.snapshot\.json/);

const iconSprite = read("src/components/JMIcon/icons.svg");
const iconNames = [...iconSprite.matchAll(/<symbol id="([^"]+)"/g)].map(
  ([, name]) => name,
);
assert.equal(
  new Set(iconNames).size,
  iconNames.length,
  "Icon IDs must be unique",
);

console.log(
  "Repository audit passed · separate component styles · API-backed catalogs · unique icon IDs",
);
