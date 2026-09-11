import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = new URL("../", import.meta.url);
const exists = (path) => existsSync(new URL(path, root));
const read = (path) => readFileSync(new URL(path, root), "utf8");

function files(directory) {
  return readdirSync(new URL(`${directory}/`, root), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? files(path) : [path];
  });
}

for (const path of ["catalogs", "src/data", "src/domain", "src/persistence"]) {
  assert.ok(
    !exists(path),
    `${path} was retired; keep backend data and active client modules in their current locations`,
  );
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

for (const path of [
  "backend/database/schema/app-data.ts",
  "backend/database/schema/catalogs.ts",
  "backend/database/migrations/0000_catalogs.sql",
  "backend/deploy/raspberry-pi/web/Dockerfile.dockerignore",
]) {
  assert.ok(exists(path), `${path} should be preserved`);
}
assert.match(
  read("backend/deploy/raspberry-pi/web/Dockerfile"),
  /COPY styles \.\/styles/,
);

// Use the bundler's resolved graph, including lazy routes, instead of maintaining a filename inventory.
await build({
  root: fileURLToPath(root),
  logLevel: "error",
  // Include explicitly enabled development fixtures when checking reachability.
  define: {
    "import.meta.env.DEV": "true",
    "import.meta.env.VITE_DEMO_DATA": '"true"',
  },
  build: { write: false },
  plugins: [
    {
      name: "audit-client-reachability",
      generateBundle() {
        const modules = new Set(
          [...this.getModuleIds()].map((id) => id.split("?")[0]),
        );
        const unused = sources.filter(
          (path) => !modules.has(fileURLToPath(new URL(path, root))),
        );
        assert.deepEqual(
          unused,
          [],
          `Client files outside the application import graph:\n${unused.join("\n")}`,
        );
      },
    },
  ],
});
console.log(
  "Repository audit passed · imports resolve · client files are reachable · backend boundaries preserved",
);
