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
const cssFiles = ["variables.css", "normalisation.css", "styles.css", ...filesMatching("src", /\.css$/)];
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
const missing = [...referenced].filter((name) => !defined.has(name)).sort();
const unused = [...defined].filter((name) => !referenced.has(name)).sort();
const bemName = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:__[a-z0-9]+(?:-[a-z0-9]+)*)?(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?$/;
const invalidNames = [...new Set([...referenced, ...defined])].filter((name) => !bemName.test(name)).sort();
const nonBemState = [...defined].filter((name) => /^(?:is|has)-/.test(name)).sort();

console.log(`Referenced classes: ${referenced.size}`);
console.log(`Defined classes: ${defined.size}`);
console.log(`Referenced without CSS: ${missing.length}`);
console.log(`CSS classes without a static reference: ${unused.length}`);
console.log(`Invalid BEM names: ${invalidNames.length}`);
console.log(`Non-BEM state classes: ${nonBemState.length}`);

const failures = [
  ["Referenced without CSS", missing],
  ["CSS classes without a static reference", unused],
  ["Invalid BEM names", invalidNames],
  ["Non-BEM state classes", nonBemState],
].filter(([, values]) => values.length);

if (failures.length) {
  for (const [label, values] of failures) console.error(`\n${label}:\n${values.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("CSS audit passed");
}
