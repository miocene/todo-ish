import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function filesMatching(directory, pattern) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesMatching(path, pattern);
    return pattern.test(entry.name) ? [path] : [];
  });
}

const sourceFilesList = ["index.html", ...filesMatching("src", /\.(?:js|vue)$/)];
const source = sourceFilesList.map((file) => readFileSync(file, "utf8")).join("\n");
const cssFiles = [...filesMatching("styles", /\.css$/), ...filesMatching("src", /\.css$/)];
const css = cssFiles.map((file) => readFileSync(file, "utf8")).join("\n");

const referenced = new Set();
for (const match of source.matchAll(/class=["']([^"']+)["']/g)) {
  for (const name of match[1].split(/\s+/)) {
    if (/^[a-z][a-z0-9_-]*$/.test(name)) referenced.add(name);
  }
}
for (const match of source.matchAll(/classList\.(?:add|remove|toggle)\(["']([^"']+)["']/g)) {
  referenced.add(match[1]);
}
for (const match of source.matchAll(/["']([a-z][a-z0-9_-]*(?:__|--)[a-z0-9_-]+)["']/g)) {
  referenced.add(match[1]);
}
for (const match of css.matchAll(/view-transition-class:\s*([a-z][a-z0-9_-]+)/g)) {
  referenced.add(match[1]);
}

const defined = new Set([...css.matchAll(/\.([a-z_][a-z0-9_-]*)/gi)].map((match) => match[1]));
// These classes identify DOM elements without requiring their own CSS rule.
const structuralHooks = new Set([
  "chores-all",
  "chores-upcoming",
  "jm-day-type__option-label",
  "jm-navigation__item",
  "printing-item__field--filament",
  "project-card--printing",
  "project-card--stitching",
  "task-item__pin",
  "task-item__remove",
]);
const generatedClasses = new Set(["jm-button--ghost", "jm-button--primary", "jm-button--secondary"]);
const missing = [...referenced].filter((name) => !defined.has(name) && !structuralHooks.has(name)).sort();
const unused = [...defined]
  .filter((name) => name !== "css" && !referenced.has(name) && !generatedClasses.has(name))
  .sort();
console.log(`Referenced classes: ${referenced.size}`);
console.log(`Defined classes: ${defined.size}`);
console.log(`Referenced without CSS: ${missing.length}`);
console.log(`CSS classes without a static reference: ${unused.length}`);

// Static matching cannot prove whether dynamic Vue classes are used. Stylelint owns naming rules.
const findings = [
  ["Referenced without CSS", missing],
  ["CSS classes without a static reference", unused],
].filter(([, values]) => values.length);

if (findings.length) {
  for (const [label, values] of findings) console.log(`\n${label}:\n${values.join("\n")}`);
  console.log("CSS usage findings are informational; verify dynamic classes before removing styles.");
} else {
  console.log("CSS audit passed");
}
