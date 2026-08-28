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

assert.deepEqual(readdirSync(new URL("src/pages/", root)).sort(), [
  "CatalogPage.vue",
  "ChoresPage.vue",
  "PlaceholderPage.vue",
  "ProjectTasksPage.vue",
  "ShoppingPage.vue",
  "TodoListsPage.vue",
  "WorkPage.vue",
  "catalog-page.css",
  "task-pages.css",
]);
assert.deepEqual(readdirSync(new URL("src/app/", root)).sort(), [
  "filament-catalog.js",
  "floss-catalog.js",
  "page-tasks.js",
  "printing-supplies.js",
  "router.js",
  "stitching-supplies.js",
  "task-drafts.js",
  "work-calendar.js",
  "work-status.js",
  "work-tasks.mock.js",
]);
assert.deepEqual(readdirSync(new URL("src/components/", root)).sort(), [
  "JMButton",
  "JMHeader",
  "JMIcon",
  "JMNavigation",
  "JMTaskCard",
]);
assert.deepEqual(readdirSync(new URL("src/components/JMButton/", root)).sort(), ["JMButton.vue", "jm-button.css"]);
assert.deepEqual(readdirSync(new URL("src/components/JMHeader/", root)).sort(), ["JMHeader.vue", "jm-header.css"]);
assert.deepEqual(readdirSync(new URL("src/components/JMIcon/", root)).sort(), [
  "JMIcon.vue",
  "icons.svg",
  "jm-icon.css",
]);
const iconSprite = read("src/components/JMIcon/icons.svg");
const iconNames = [...iconSprite.matchAll(/<symbol id="icon-([^"]+)"/g)].map(([, name]) => name);
assert.deepEqual(iconNames, [
  "chevron-up",
  "chevron-right",
  "chevron-down",
  "chevron-left",
  "check",
  "work",
  "user",
  "spinner",
  "pto",
  "chores",
  "todo",
  "shopping",
  "sick-leave",
  "work-trip",
  "printer",
  "weekend",
  "yarn",
  "holiday",
  "catalog",
  "grip",
  "pin",
  "pinned",
  "remove",
  "conference",
  "arrow-left",
  "arrow-right",
  "arrow-up",
  "arrow-down",
  "search",
  "close",
]);
assert.doesNotMatch(iconSprite, /#333333/i);
assert.doesNotMatch(iconSprite, /id="icon-profile"/);
assert.deepEqual(readdirSync(new URL("src/components/JMNavigation/", root)).sort(), [
  "JMNavigation.vue",
  "jm-navigation.css",
]);
assert.deepEqual(readdirSync(new URL("src/components/JMTaskCard/", root)).sort(), [
  "JMTaskCard.vue",
  "jm-task-card.css",
]);
for (const removedDirectory of ["src/data", "src/domain", "src/persistence", "src/shared"]) {
  assert.ok(!exists(removedDirectory), `${removedDirectory} should not remain in the client`);
}

const clientSource = [
  "src/App.vue",
  "src/main.js",
  "src/app/filament-catalog.js",
  "src/app/floss-catalog.js",
  "src/app/printing-supplies.js",
  "src/app/stitching-supplies.js",
  "src/app/router.js",
  "src/app/task-drafts.js",
  "src/components/JMButton/JMButton.vue",
  "src/components/JMHeader/JMHeader.vue",
  "src/components/JMIcon/JMIcon.vue",
  "src/components/JMNavigation/JMNavigation.vue",
  "src/components/JMTaskCard/JMTaskCard.vue",
  "src/pages/CatalogPage.vue",
  "src/pages/ChoresPage.vue",
  "src/pages/PlaceholderPage.vue",
  "src/pages/ProjectTasksPage.vue",
  "src/pages/ShoppingPage.vue",
  "src/pages/TodoListsPage.vue",
  "src/pages/WorkPage.vue",
]
  .map(read)
  .join("\n");
assert.doesNotMatch(clientSource, /demo-state|localStorage|catalog-api/i);
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

console.log("Repository audit passed · task pages routed · catalog server preserved");
