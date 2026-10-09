import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { runtimeNames } from "./ui-runtime.mjs";

test("UI runtime selection preserves defaults and rejects unsupported/empty routes", () => {
  const previous = process.env.MAKESHIFT_TEST_BROWSER;
  try {
    delete process.env.MAKESHIFT_TEST_BROWSER;
    assert.deepEqual(runtimeNames(), ["electron"]);
    assert.deepEqual(runtimeNames(undefined, ["chromium", "webkit", "electron"]), ["electron"]);
    assert.deepEqual(runtimeNames(["chromium", "webkit"]), ["chromium"]);
    assert.deepEqual(runtimeNames(undefined, ["chromium"]), ["electron"]);
    assert.deepEqual(runtimeNames(["chromium", "webkit"], ["webkit"]), ["webkit"]);
    assert.throws(() => runtimeNames([]), /at least one/);
    assert.throws(() => runtimeNames(["chromium"], ["webkit"]), /supported and nonempty/);
    for (const name of ["chromium", "webkit", "electron"]) {
      process.env.MAKESHIFT_TEST_BROWSER = name;
      assert.deepEqual(runtimeNames(), [name]);
    }
    assert.throws(() => runtimeNames(["chromium", "webkit"]), /Unsupported/);
  } finally {
    if (previous === undefined) delete process.env.MAKESHIFT_TEST_BROWSER;
    else process.env.MAKESHIFT_TEST_BROWSER = previous;
  }
});
test("ordinary standalone launchers fail before running any route for a typo", () => {
  for (const path of [
    "tests/focus-loss-ui.mjs",
    "tests/calculation-ui.mjs",
    "tests/cad-tool-composition-ui.mjs",
    "tests/construction-plane-ui.mjs",
    "tests/offset-move-capture-ui.mjs",
    "tests/current-tools-ui.mjs",
    "tests/entity-range-ui.mjs",
    "tests/shell-ui.mjs",
    "tests/trim-ui.mjs",
    "tests/loft-ui.mjs",
    "tests/canonical-planes-ui.mjs",
    "tests/native-export-ui.mjs",
    "tests/agent-loft.mjs",
  ]) {
    const result = spawnSync(process.execPath, [path], {
      env: { ...process.env, MAKESHIFT_TEST_BROWSER: "chromuim" },
      encoding: "utf8",
      timeout: 15000,
    });
    assert.equal(result.status, 1, path);
    assert.match(result.stderr, /Unsupported MAKESHIFT_TEST_BROWSER: chromuim/, path);
  }
});
