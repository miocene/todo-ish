import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const exists = (path) => existsSync(new URL(path, root));
const read = (path) => readFileSync(new URL(path, root), "utf8");
const readJson = (path) => JSON.parse(read(path));

function clientFiles(directory = "src") {
  return readdirSync(new URL(`${directory}/`, root), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return clientFiles(path);
    return /\.(?:js|vue)$/.test(entry.name) ? [path] : [];
  });
}

const packageJson = readJson("package.json");
const runtimeDependencies = Object.keys(packageJson.dependencies || {}).sort();

assert.deepEqual(runtimeDependencies, ["vue", "vue-router", "webauthn-polyfills"]);
assert.match(packageJson.packageManager || "", /^yarn@1\./);
assert.ok(exists("yarn.lock"));
assert.deepEqual(readdirSync(new URL("styles/", root)).sort(), [
  "normalisation.css",
  "style.css",
  "variables.css",
  "views.css",
]);
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
  "styles.css",
  "variables.css",
]) {
  assert.ok(!exists(removedRootPath), `${removedRootPath} should live under backend, not at the repository root`);
}

assert.deepEqual(readdirSync(new URL("src/pages/", root)).sort(), [
  "CatalogPage.vue",
  "ChoresPage.vue",
  "ProfilePage.vue",
  "ProjectTasksPage.vue",
  "ShoppingPage.vue",
  "TodoListsPage.vue",
  "WorkPage.vue",
  "catalog-page.css",
  "profile-page.css",
  "task-pages.css",
  "work-page.css",
]);
assert.deepEqual(readdirSync(new URL("src/app/", root)).sort(), [
  "activity.js",
  "api.js",
  "app-data.js",
  "card-colors.js",
  "filament-catalog.js",
  "floss-catalog.js",
  "managed-shopping.js",
  "page-tasks.js",
  "passkeys.js",
  "printing-supplies.js",
  "router.js",
  "shopping-supplies.js",
  "stitching-supplies.js",
  "task-list.js",
  "work-calendar.js",
  "work-status.js",
  "work-tasks.js",
]);
assert.deepEqual(readdirSync(new URL("src/components/", root)).sort(), [
  "JMButton",
  "JMCalendar",
  "JMCatalogCard",
  "JMDayType",
  "JMHeader",
  "JMIcon",
  "JMNavigation",
  "JMPasskeyGate",
  "JMProjectTaskDetails",
  "JMTaskCard",
]);
assert.deepEqual(readdirSync(new URL("src/components/JMButton/", root)).sort(), ["JMButton.vue", "jm-button.css"]);
assert.deepEqual(readdirSync(new URL("src/components/JMCatalogCard/", root)).sort(), [
  "JMCatalogCard.vue",
  "jm-catalog-card.css",
]);
assert.deepEqual(readdirSync(new URL("src/components/JMHeader/", root)).sort(), ["JMHeader.vue", "jm-header.css"]);
assert.deepEqual(readdirSync(new URL("src/components/JMIcon/", root)).sort(), [
  "JMIcon.vue",
  "icons.svg",
  "jm-icon.css",
]);
const iconSprite = read("src/components/JMIcon/icons.svg");
const iconNames = [...iconSprite.matchAll(/<symbol id="icon-([^"]+)"/g)].map(([, name]) => name);
assert.deepEqual(
  iconNames.sort(),
  [
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
  ].sort(),
);
assert.doesNotMatch(iconSprite, /#333333/i);
assert.doesNotMatch(iconSprite, /id="icon-profile"/);
assert.deepEqual(readdirSync(new URL("src/components/JMNavigation/", root)).sort(), [
  "JMNavigation.vue",
  "jm-navigation.css",
]);
assert.deepEqual(readdirSync(new URL("src/components/JMProjectTaskDetails/", root)).sort(), [
  "JMPrintingTaskDetails.vue",
  "JMStitchTaskDetails.vue",
]);
assert.deepEqual(readdirSync(new URL("src/components/JMTaskCard/", root)).sort(), [
  "JMTaskCard.vue",
  "jm-task-card.css",
]);
for (const removedDirectory of ["src/data", "src/domain", "src/persistence"]) {
  assert.ok(!exists(removedDirectory), `${removedDirectory} should not remain in the client`);
}
assert.deepEqual(readdirSync(new URL("src/shared/", root)).sort(), ["date.js"]);
assert.deepEqual(readdirSync(new URL("scripts/", root)).sort(), [
  "audit_css.mjs",
  "audit_repo.mjs",
  "dev.sh",
  "prepare_github_pages.mjs",
]);

const clientSource = clientFiles().sort().map(read).join("\n");
assert.doesNotMatch(clientSource, /demo-state|catalog-api/i);
assert.doesNotMatch(clientSource.replace(read("src/app/app-data.js"), ""), /localStorage/);
assert.match(read("src/app/app-data.js"), /LEGACY_STORAGE_KEYS/);
assert.doesNotMatch(read("src/app/filament-catalog.js"), /\.snapshot\.json/);
assert.doesNotMatch(read("src/app/floss-catalog.js"), /\.snapshot\.json/);
assert.doesNotMatch(clientSource, /CataloguePage|HomePage|TodoPage/);
assert.doesNotMatch(clientSource, /<style\s+scoped\b/i);

for (const path of [
  "backend/README.md",
  "backend/api/src/catalog-repository.mjs",
  "backend/api/src/app-data-repository.mjs",
  "backend/database/schema/app-data.ts",
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

console.log("Repository audit passed · task pages routed · database-backed API preserved");
