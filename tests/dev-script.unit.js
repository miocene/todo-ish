import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

test("dev reads quoted local settings, honors overrides, and closes its tunnel", (t) => {
  const root = mkdtempSync(join(tmpdir(), "todo-dev-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const directory of ["tools", "bin"]) mkdirSync(join(root, directory));
  const script = join(root, "tools/dev.sh");
  writeFileSync(
    script,
    readFileSync(new URL("../tools/dev.sh", import.meta.url)),
  );
  const executable = (name, source) =>
    writeFileSync(join(root, "bin", name), `#!/bin/sh\n${source}`, {
      mode: 0o755,
    });
  executable(
    "ssh",
    'printf "%s\\n" "$*" > "$DEV_TEST_ROOT/ssh-args"\necho $$ > "$DEV_TEST_ROOT/ssh-pid"\nexec sleep 60\n',
  );
  executable("curl", "sleep 0.05\nexit 0\n");
  executable(
    "yarn",
    'printf "%s\\n" "$PWD" "$API_PROXY_TARGET" "$*" > "$DEV_TEST_ROOT/vite-args"\nexit "${DEV_TEST_VITE_EXIT:-0}"\n',
  );
  writeFileSync(
    join(root, ".env.local"),
    [
      'PI_SSH_TARGET="test@pi.local" # quoted value',
      "PI_DEVELOPMENT_API_PORT='3101'",
      "UNUSED=$(touch should-not-exist)",
    ].join("\n"),
  );
  const env = {
    ...process.env,
    PATH: `${join(root, "bin")}:${process.env.PATH}`,
    DEV_TEST_ROOT: root,
  };
  delete env.PI_SSH_TARGET;
  delete env.PI_DEVELOPMENT_API_PORT;
  const run = (overrides = {}) =>
    execFileSync("sh", [script], {
      cwd: tmpdir(),
      env: { ...env, ...overrides },
      encoding: "utf8",
      stdio: "pipe",
    });
  const assertClosed = () => {
    const pid = Number(readFileSync(join(root, "ssh-pid"), "utf8"));
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  };
  run();
  assert.match(
    readFileSync(join(root, "ssh-args"), "utf8"),
    /127\.0\.0\.1:3101:127\.0\.0\.1:3001 test@pi\.local/,
  );
  assert.match(
    readFileSync(join(root, "vite-args"), "utf8"),
    new RegExp(`^${root}\\nhttp://127\\.0\\.0\\.1:3101\\n`),
  );
  assert.equal(existsSync(join(root, "should-not-exist")), false);
  assertClosed();
  run({ PI_SSH_TARGET: "override@pi.local", PI_DEVELOPMENT_API_PORT: "3102" });
  assert.match(
    readFileSync(join(root, "ssh-args"), "utf8"),
    /3102:127\.0\.0\.1:3001 override@pi\.local/,
  );
  assertClosed();
  assert.throws(() => run({ DEV_TEST_VITE_EXIT: "7" }), { status: 7 });
  assertClosed();
  for (const port of ["0", "65536", "abc", "1.5", ""]) {
    rmSync(join(root, "ssh-args"));
    assert.throws(
      () => run({ PI_DEVELOPMENT_API_PORT: port }),
      /integer between 1 and 65535/,
    );
    assert.equal(existsSync(join(root, "ssh-args")), false);
    writeFileSync(join(root, "ssh-args"), "");
  }
  assert.throws(
    () => run({ PI_SSH_TARGET: "-unsafe" }),
    /safe SSH destination/,
  );
});
