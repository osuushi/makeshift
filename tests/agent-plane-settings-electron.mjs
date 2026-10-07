import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { launchElectron } from "./native-documents.mjs";
import { inspect, settled } from "./ui-helpers.mjs";

const run = promisify(execFile);
const app = await launchElectron({
  args: ["."],
  env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" },
});
try {
  const page = await app.firstWindow();
  await settled(page);
  await page.evaluate(() =>
    window.makeshiftAgent.request({
      kind: "configure",
      preferences: {
        preset: "custom",
        executable: "/bin/sh",
        args: ["-i"],
        env: {},
      },
    }),
  );
  await page.getByRole("button", { name: "Open agent terminal" }).click();
  await page.locator(".agent-status").filter({ hasText: "Running" }).waitFor();
  const workspace = (await page.evaluate(() => window.makeshiftAgent.request({ kind: "read" })))
    .workspace;
  const path = join(workspace, "settings-test-env.txt");
  await page.locator(".agent-screen textarea").focus();
  await page.keyboard.type(
    'printf "%s\\n" "$MAKESHIFT_ENDPOINT" "$MAKESHIFT_CAPABILITY" > settings-test-env.txt',
  );
  await page.keyboard.press("Enter");
  let values;
  for (let attempts = 0; attempts < 100; attempts++) {
    try {
      values = (await readFile(path, "utf8")).trimEnd().split("\n");
      if (values.length === 2) break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(values?.length, 2);
  await rm(path);
  const env = { ...process.env, MAKESHIFT_ENDPOINT: values[0], MAKESHIFT_CAPABILITY: values[1] };
  const query = async (...args) =>
    JSON.parse(
      (
        await run(process.execPath, [resolve(".build/host/agent-cli/main.js"), ...args], {
          cwd: workspace,
          env,
          timeout: 15000,
        })
      ).stdout,
    );
  const original = await query("settings");
  const before = (await inspect(page)).document;
  const history = await page.evaluate(() => window.makeshiftHistory());
  await page.getByRole("button", { name: "Application settings" }).click();
  const changed = await query(
    "settings",
    JSON.stringify({
      canonicalPlanes: { angleCutoff: 0.6, fadeWidth: 0.2 },
      viewDisplay: { gridLineWidth: 2 },
    }),
  );
  assert.equal(changed.canonicalPlanes.angleCutoff, 0.6);
  assert.equal(await page.getByRole("slider", { name: "Angle cutoff", exact: true }).count(), 0);
  assert.equal(
    await page.getByRole("slider", { name: "Grid line thickness", exact: true }).inputValue(),
    "2",
  );
  await assert.rejects(
    () => query("settings", '{"viewDisplay":{"grid":0.1},"canonicalPlanes":{"fadeWidth":-1}}'),
    /finite number/,
  );
  assert.deepEqual(await query("settings"), changed, "Invalid patch applies no fields");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await writeFile(
    join(workspace, "settings-view.ts"),
    "const current = await makeshift.settings(); await makeshift.settings({canonicalPlanes:{angleCutoff:current.canonicalPlanes.angleCutoff - 0.1}});",
  );
  assert.equal((await query("view", "settings-view.ts")).result.canonicalPlanes.angleCutoff, 0.5);
  assert.deepEqual((await inspect(page)).document, before);
  assert.deepEqual(
    await page.evaluate(() => window.makeshiftHistory()),
    history,
    "Preferences stay outside Undo",
  );
  await page.reload();
  await settled(page);
  assert.equal((await query("settings")).canonicalPlanes.angleCutoff, 0.5);
  await query("settings", JSON.stringify(original));
  console.log(
    "Hidden Electron: real agent CLI, typed view settings, IPC, dialog refresh, atomic validation, persistence and unchanged geometry/Undo passed",
  );
} finally {
  await app.close();
}
