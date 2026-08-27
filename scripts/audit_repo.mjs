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
assert.deepEqual(readdirSync(new URL("styles/", root)).sort(), ["normalisation.css", "style.css", "variables.css"]);
assert.match(
  read("styles/style.css"),
  /^@import url\("\.\/variables\.css"\);\n@import url\("\.\/normalisation\.css"\);/,
);

for (const removedRootPath of [
  "catalogs",
  "deploy",
  "drizzle.config.ts",
  "normalisation.css",
  "pyproject.toml",
  "requirements-dev.txt",
  "server",
  "style.css",
  "variables.css",
]) {
  assert.ok(!exists(removedRootPath), `${removedRootPath} should live under backend, not at the repository root`);
}

assert.deepEqual(readdirSync(new URL("src/pages/", root)).sort(), ["WorkPage.vue"]);
assert.deepEqual(readdirSync(new URL("src/app/", root)).sort(), ["router.js"]);
assert.deepEqual(readdirSync(new URL("src/components/", root)).sort(), ["JMHeader", "JMNavigation"]);
assert.deepEqual(readdirSync(new URL("src/components/JMHeader/", root)).sort(), ["JMHeader.vue", "jm-header.css"]);
assert.deepEqual(readdirSync(new URL("src/components/JMNavigation/", root)).sort(), [
  "JMNavigation.vue",
  "jm-navigation.css",
]);
for (const removedDirectory of ["src/data", "src/domain", "src/persistence", "src/shared"]) {
  assert.ok(!exists(removedDirectory), `${removedDirectory} should not remain in the work-only client`);
}

const clientSource = [
  "src/App.vue",
  "src/main.js",
  "src/app/router.js",
  "src/components/JMHeader/JMHeader.vue",
  "src/components/JMNavigation/JMNavigation.vue",
  "src/pages/WorkPage.vue",
]
  .map(read)
  .join("\n");
assert.doesNotMatch(clientSource, /mock|demo-state|localStorage|catalog-api/i);
assert.doesNotMatch(clientSource, /CataloguePage|HomePage|TodoPage/);
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
assert.match(read("backend/deploy/raspberry-pi/web/Dockerfile"), /COPY styles \.\/styles/);

console.log("Repository audit passed · work-only client · catalog server preserved");
