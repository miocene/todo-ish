import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("pre-push runs lint, formatting, and tests in order and stops on failure", (t) => {
  const root = mkdtempSync(join(tmpdir(), "todo-pre-push-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "git"),
    '#!/bin/sh\nprintf "%s\\n" "$HOOK_TEST_ROOT"\n',
    { mode: 0o755 },
  );
  writeFileSync(
    join(bin, "yarn"),
    '#!/bin/sh\nprintf "%s\\n" "$PWD" "$*" >> "$HOOK_TEST_ROOT/calls"\ncat > "$HOOK_TEST_ROOT/input"\nif [ "$1" = "$HOOK_TEST_FAILURE" ]; then exit 1; fi\nexit 0\n',
    { mode: 0o755 },
  );
  const checks = ["lint", "format:check", "test"];
  for (const failure of ["", ...checks]) {
    writeFileSync(join(root, "calls"), "");
    const result = spawnSync(
      "sh",
      [new URL("../.githooks/pre-push", import.meta.url).pathname],
      {
        cwd: tmpdir(),
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          HOOK_TEST_ROOT: root,
          HOOK_TEST_FAILURE: failure,
        },
        input: "refs/heads/main local refs/heads/main remote\n",
        encoding: "utf8",
      },
    );
    assert.equal(result.status, failure ? 1 : 0, result.stderr);
    const completed = failure
      ? checks.slice(0, checks.indexOf(failure) + 1)
      : checks;
    assert.equal(
      readFileSync(join(root, "calls"), "utf8"),
      completed.map((check) => `${root}\n${check}\n`).join(""),
    );
    assert.equal(readFileSync(join(root, "input"), "utf8"), "");
  }
});
