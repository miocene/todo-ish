import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const exists = (path) => existsSync(new URL(path, root));
const read = (path) => readFileSync(new URL(path, root), "utf8");
const readJson = (path) => JSON.parse(read(path));

const packageJson = readJson("package.json");
const runtimeDependencies = Object.keys(packageJson.dependencies || {}).sort();

assert.deepEqual(runtimeDependencies, ["vue", "vue-router"]);
assert.match(packageJson.packageManager || "", /^yarn@1\./);
assert.ok(exists("yarn.lock"));
assert.ok(exists("variables.css"), "The shared CSS variables should be preserved");

for (const removedRootPath of [
  "catalogs",
  "deploy",
  "drizzle.config.ts",
  "pyproject.toml",
  "requirements-dev.txt",
  "server",
]) {
  assert.ok(!exists(removedRootPath), `${removedRootPath} should live under backend, not at the repository root`);
}

assert.deepEqual(readdirSync(new URL("src/pages/", root)).sort(), ["CalendarPage.vue"]);
assert.deepEqual(readdirSync(new URL("src/app/", root)).sort(), ["router.js"]);
for (const removedDirectory of ["src/components", "src/data", "src/domain", "src/persistence", "src/shared"]) {
  assert.ok(!exists(removedDirectory), `${removedDirectory} should not remain in the calendar-only client`);
}

const clientSource = ["src/App.vue", "src/main.js", "src/app/router.js", "src/pages/CalendarPage.vue"]
  .map(read)
  .join("\n");
assert.doesNotMatch(clientSource, /mock|demo-state|localStorage|catalog-api/i);
assert.doesNotMatch(clientSource, /CataloguePage|HomePage|TodoPage|WorkPage/);
assert.doesNotMatch(clientSource, /<style\s+scoped\b/i);

for (const path of [
  "backend/README.md",
  "backend/api/src/catalog-repository.mjs",
  "backend/catalogs/catalogs.js",
  "backend/database/schema/catalogs.ts",
  "backend/database/migrations/0000_catalogs.sql",
  "backend/deploy/raspberry-pi/web/Dockerfile.dockerignore",
]) {
  assert.ok(exists(path), `${path} should be preserved`);
}

assert.match(
  read("backend/deploy/raspberry-pi/compose.web.yaml"),
  /dockerfile: backend\/deploy\/raspberry-pi\/web\/Dockerfile/,
);
assert.match(
  read("backend/deploy/raspberry-pi/web/Dockerfile"),
  /COPY --chown=101:101 backend\/deploy\/raspberry-pi\/web\/nginx\.conf/,
);

console.log("Repository audit passed · calendar-only client · catalog server preserved");
