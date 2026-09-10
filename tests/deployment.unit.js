import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { stageRelease } from "../tools/stage-release.mjs";
test("deployment stages committed manifest inputs without ignored notes or working-tree edits", (t) => {
  const root = mkdtempSync(join(tmpdir(), "todo-release-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, "repo");
  mkdirSync(repo);
  mkdirSync(join(repo, "tools"));
  mkdirSync(join(repo, "src"));
  writeFileSync(join(repo, "tools/deploy-source.txt"), "src\n");
  writeFileSync(join(repo, "src/app.js"), "committed");
  const git = (...args) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
  git("init", "-q");
  git("add", ".");
  git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture");
  writeFileSync(join(repo, "src/app.js"), "uncommitted");
  writeFileSync(join(repo, "src/ignored.txt"), "not committed");
  writeFileSync(join(repo, "local-notes.md"), "private");
  const destination = join(root, "release");
  const revision = stageRelease(repo, destination);
  assert.equal(readFileSync(join(destination, "src/app.js"), "utf8"), "committed");
  assert.equal(existsSync(join(destination, "src/ignored.txt")), false);
  assert.equal(existsSync(join(destination, "local-notes.md")), false);
  assert.equal(readFileSync(join(destination, "REVISION"), "utf8"), revision + "\n");
});

test("deploy reads local Pi settings, honors environment overrides and forwards checksum adoption", (t) => {
  const root = mkdtempSync(join(tmpdir(), "todo-deploy-settings-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const directory of ["backend/scripts", "tools", "bin"]) mkdirSync(join(root, directory), { recursive: true });
  const script = join(root, "backend/scripts/deploy_raspberry_pi.sh");
  writeFileSync(script, readFileSync(new URL("../backend/scripts/deploy_raspberry_pi.sh", import.meta.url)));
  const revision = "a".repeat(40);
  writeFileSync(join(root, "tools/stage-release.mjs"), `process.stdout.write("${revision}");`);
  const log = join(root, "calls.txt");
  const executable = (name, contents) =>
    writeFileSync(join(root, "bin", name), "#!/bin/sh\n" + contents, { mode: 0o755 });
  executable("git", `if [ "$1" = rev-parse ]; then echo '${revision}'; fi\n`);
  executable("yarn", "exit 0\n");
  for (const tool of ["ssh", "rsync"]) executable(tool, 'printf "%s\\n" "$*" >> "$DEPLOY_CALLS_FILE"\n');
  writeFileSync(
    join(root, ".env.local"),
    [
      'PI_SSH_TARGET="test@pi.local"',
      'PI_LAN_ADDRESS="192.0.2.10"',
      "PI_APP_DIR=custom-app",
      "PI_ADOPT_LEGACY_CHECKSUMS=1",
      "UNUSED=$(touch should-not-exist)",
    ].join("\n"),
  );
  const env = { ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH}`, DEPLOY_CALLS_FILE: log };
  for (const key of ["PI_SSH_TARGET", "PI_LAN_ADDRESS", "PI_APP_DIR", "PI_ADOPT_LEGACY_CHECKSUMS"]) delete env[key];
  const run = (overrides = {}) =>
    execFileSync("sh", [script], { cwd: root, env: { ...env, ...overrides }, encoding: "utf8", stdio: "pipe" });
  assert.match(run(), /Legacy migration checksum adoption: 1/);
  assert.match(
    readFileSync(log, "utf8"),
    /test@pi.local MIGRATION_ADOPT_LEGACY_CHECKSUMS=1 sh 'custom-app\/releases\//,
  );
  assert.match(readFileSync(log, "utf8"), /'192\.0\.2\.10'/);
  assert.equal(existsSync(join(root, "should-not-exist")), false);
  writeFileSync(log, "");
  assert.match(run({ PI_ADOPT_LEGACY_CHECKSUMS: "0", PI_SSH_TARGET: "override@pi.local" }), /checksum adoption: 0/);
  assert.match(readFileSync(log, "utf8"), /override@pi.local MIGRATION_ADOPT_LEGACY_CHECKSUMS=0/);
  writeFileSync(log, "");
  assert.throws(() => run({ PI_ADOPT_LEGACY_CHECKSUMS: "yes" }), /must be 0 or 1/);
  assert.equal(readFileSync(log, "utf8"), "");
});
