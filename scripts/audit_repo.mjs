import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const exists = (path) => existsSync(new URL(path, root));
const readJson = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const filesIn = (directory, extension) =>
  readdirSync(new URL(`${directory}/`, root), { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return filesIn(path, extension);
    return entry.name.endsWith(extension) ? [path] : [];
  });
const packageJson = readJson("package.json");
const runtimeDependencies = Object.keys(packageJson.dependencies || {}).sort();
const developmentDependencies = Object.keys(packageJson.devDependencies || {}).sort();

assert.match(packageJson.packageManager || "", /^yarn@1\./, "The repository should use Yarn Classic");
assert.ok(exists("yarn.lock"), "The Yarn lockfile is required");
assert.ok(!exists("package-lock.json") && !exists("pnpm-lock.yaml"), "Do not mix package managers");

assert.deepEqual(runtimeDependencies, ["vue", "vue-router"], "Keep runtime dependencies limited to Vue and Vue Router");
assert.match(packageJson.dependencies.vue, /^[~^]?3\./, "The application requires Vue 3");
assert.match(packageJson.dependencies["vue-router"], /^[~^]?4(?:\.|$)/, "The application requires Vue Router 4");
assert.deepEqual(
  developmentDependencies,
  [
    "@eslint/js",
    "@playwright/test",
    "@vitejs/plugin-vue",
    "eslint",
    "eslint-config-prettier",
    "eslint-plugin-vue",
    "globals",
    "prettier",
    "stylelint",
    "stylelint-config-standard",
    "vite",
    "vue-eslint-parser",
  ],
  "Keep development tooling explicit and reviewed",
);

const packageNames = [...runtimeDependencies, ...developmentDependencies].join(" ");
for (const forbidden of ["tailwind", "sass", "less", "stylus", "postcss"]) {
  assert.doesNotMatch(packageNames, new RegExp(forbidden, "i"), `${forbidden} should not be added`);
}

for (const path of ["variables.css", "normalisation.css", "styles.css"]) {
  assert.ok(exists(path), `${path} should keep its CSS responsibility explicit`);
}
assert.ok(!exists("data.js"), "Application state should not live in a root-level data monolith");
for (const path of ["src/pages", "src/components"]) {
  const files = readdirSync(new URL(`${path}/`, root)).filter((file) => file.endsWith(".vue"));
  assert.ok(files.length > 0, `${path} should contain Vue single-file components`);
}
for (const path of ["src/components/JMButton/JMButton.vue", "src/components/JMButton/jm-button.css"]) {
  assert.ok(exists(path), `${path} should keep JMButton self-contained`);
}
for (const path of ["src/components/JMHeader/JMHeader.vue", "src/components/JMHeader/jm-header.css"]) {
  assert.ok(exists(path), `${path} should keep JMHeader self-contained`);
}
for (const path of ["src/components/JMCalendar/JMCalendar.vue", "src/components/JMCalendar/jm-calendar.css"]) {
  assert.ok(exists(path), `${path} should keep JMCalendar self-contained`);
}
for (const path of [
  "src/components/JMIcon/JMIcon.vue",
  "src/components/JMIcon/jm-icon.css",
  "src/components/JMIcon/icons.svg",
]) {
  assert.ok(exists(path), `${path} should keep JMIcon self-contained`);
}
const iconSprite = readFileSync(new URL("src/components/JMIcon/icons.svg", root), "utf8");
for (const name of [
  "home",
  "make",
  "todo",
  "plus",
  "catalogues",
  "search",
  "chevron-left",
  "chevron-right",
  "check",
  "star",
  "kebab-menu",
  "edit",
  "close",
  "star-fill",
  "settings",
  "shopping-bag",
  "calendar",
  "printer",
  "yarn",
]) {
  assert.match(iconSprite, new RegExp(`id="icon-${name}"`), `The icon sprite should include ${name}`);
}
for (const path of filesIn("src", ".vue")) {
  const component = readFileSync(new URL(path, root), "utf8");
  assert.doesNotMatch(component, /<script\s+setup\b/, `${path} should use the Vue Options API`);
  assert.match(component, /export\s+default\s*{/, `${path} should declare an Options API component`);
}
for (const path of ["src/data", "src/domain", "src/persistence"]) {
  assert.ok(exists(path), `${path} should contain its part of the data layer`);
}

console.log(
  `Repository audit passed · ${runtimeDependencies.length} runtime dependencies · ${developmentDependencies.length} development dependencies`,
);
