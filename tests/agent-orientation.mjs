import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { guide as referenceGuide } from "../.build/host/agent-cli/guide.js";
import { startupGuide } from "../.build/host/agent-cli/startup-guide.js";
import { orientationOverrides } from "../.build/host/host/agent-orientation.js";
import { workspaceTrustOverride } from "../.build/host/host/agent-settings.js";
import { readPortableArchive } from "../.build/host/model/portable-archive.js";
import { launchElectron, openDocument, saveDocument } from "./native-documents.mjs";
import { drag, reset, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

const run = promisify(execFile);
const root = await mkdtemp(join(tmpdir(), "makeshift-orientation-test-"));
const codex = process.env.MAKESHIFT_CODEX_EXECUTABLE;
assert(codex, "Set MAKESHIFT_CODEX_EXECUTABLE to verify installed Codex orientation.");
const app = await launchElectron({
  args: ["."],
  env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" },
});
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(10000);
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
  const first = await environment(page);
  const guide = await readFile(join(first.cwd, "AGENTS.md"), "utf8");
  assert.equal(guide, startupGuide);
  await terminal(
    page,
    "makeshift help > help.txt; makeshift docs > docs.txt; makeshift types > types.txt; makeshift status > status.json",
  );
  await until(async () => JSON.parse(await readFile(join(first.cwd, "status.json"), "utf8")));
  assert.equal(
    JSON.parse(await readFile(join(first.cwd, "status.json"), "utf8")).application,
    "Makeshift",
  );
  assert.match(
    await readFile(join(first.cwd, "help.txt"), "utf8"),
    /Inspection, selection control/,
  );
  assert.equal(await readFile(join(first.cwd, "docs.txt"), "utf8"), `${referenceGuide}\n`);
  assert.match(await readFile(join(first.cwd, "types.txt"), "utf8"), /interface MakeshiftStatus/);
  assert.equal(await readFile(first.env.MAKESHIFT_DOCS, "utf8"), referenceGuide);
  assert.equal(first.env.MAKESHIFT_WORKSPACE, first.cwd);

  // Actual sandbox, real bundled Electron-as-Node launcher, no network exception.
  const home = join(root, "codex");
  await mkdir(home);
  await writeFile(
    join(home, "config.toml"),
    'cli_auth_credentials_store="file"\ncheck_for_update_on_startup=false\n',
  );
  await writeFile(join(home, "auth.json"), '{"OPENAI_API_KEY":"sk-test-not-a-real-key"}');
  const env = { ...first.env, CODEX_HOME: home };
  for (const key of Object.keys(env))
    if ((key.startsWith("CODEX_") && key !== "CODEX_HOME") || key.startsWith("OPENAI_"))
      delete env[key];
  const options = { cwd: first.cwd, env, timeout: 20000, maxBuffer: 4 * 1024 * 1024 };
  const sandbox = await run(
    codex,
    ["sandbox", "-c", 'sandbox_mode="workspace-write"', "--", "/bin/sh", "-c", "makeshift status"],
    options,
  );
  assert.equal(JSON.parse(sandbox.stdout).document.name, "Untitled");
  await writeFile(
    join(first.cwd, "sandbox-script.ts"),
    `
const s = await makeshift.createSketch({plane:"XY",curves:[{kind:"circle",center:{x:0,y:0},radius:4}]});
await makeshift.extrude({sources:s.profiles,distance:3,mode:"new"});
throw new Error("sandbox script rollback");
`,
  );
  const beforeScript = await page.evaluate(() => window.makeshiftInspect().document);
  await assert.rejects(
    () =>
      run(
        codex,
        [
          "sandbox",
          "-c",
          'sandbox_mode="workspace-write"',
          "--",
          "/bin/sh",
          "-c",
          "makeshift run sandbox-script.ts",
        ],
        options,
      ),
    /sandbox script rollback/,
  );
  assert.deepEqual(await page.evaluate(() => window.makeshiftInspect().document), beforeScript);
  const prompt = await run(
    codex,
    [
      "debug",
      "prompt-input",
      ...orientationOverrides(env),
      ...(await workspaceTrustOverride(first.cwd)),
    ],
    options,
  );
  assert.match(prompt.stdout, /You are running inside Makeshift/);
  assert.match(prompt.stdout, /Working in Makeshift/);
  assert.match(prompt.stdout, /older absolute workspace paths are stale/);
  assert.match(prompt.stdout, /Execute a known operation directly/);
  console.log(
    "PASS actual Codex: guidance in model-visible input; bundled CLI works inside workspace-write sandbox (no model prompt sent)",
  );

  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -6], [10, 6]);
  await settled(page);
  const model = await page.evaluate(() => JSON.stringify(window.makeshiftInspect().document));
  const file = join(root, "first.makeshift"),
    copy = join(root, "renamed.makeshift");
  await saveDocument(page, file);
  assert.equal((await status(first)).document.name, "first.makeshift");
  await saveDocument(page, copy);
  assert.deepEqual((await status(first)).document, {
    name: "renamed.makeshift",
    saved: true,
    edited: false,
    units: "mm",
  });
  const archive = readPortableArchive(await readFile(copy));
  assert(archive.files["workspace/AGENTS.md"]);
  assert(
    !Object.keys(archive.files).some((path) =>
      /makeshift\.d\.ts|makeshift\.md|makeshift\.cmd|\.request|\.response/.test(path),
    ),
  );
  await assert.rejects(
    () => status({ ...first, env: { ...first.env, MAKESHIFT_CAPABILITY: "wrong" } }),
    /Invalid Makeshift connection/,
  );
  assert.equal(
    await page.evaluate(() => JSON.stringify(window.makeshiftInspect().document)),
    model,
  );

  // User guidance must survive restart byte-for-byte; old launch stays disconnected.
  const custom = "# My drawing\nKeep the wall at 3 mm.\n";
  await writeFile(join(first.cwd, "AGENTS.md"), custom);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await until(
    async () =>
      !(await page.evaluate(() => window.makeshiftAgent.request({ kind: "read" }))).running,
  );
  await assert.rejects(() => status(first), /connection has closed/);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.locator(".agent-status").filter({ hasText: "Running" }).waitFor();
  const restarted = await environment(page);
  assert.notEqual(restarted.env.MAKESHIFT_ENDPOINT, first.env.MAKESHIFT_ENDPOINT);
  assert.equal(await readFile(join(first.cwd, "AGENTS.md"), "utf8"), custom);
  await assert.rejects(() => status(first), /connection has closed/);

  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async (_w, o) => ({
      response: o.buttons?.[0] === "Stop and continue" ? 0 : 2,
    });
  });
  await reset(page);
  await until(
    async () => (await page.evaluate(() => window.makeshiftDocument.status())).path === null,
  );
  await assert.rejects(() => status(restarted), /connection has closed/);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.locator(".agent-status").filter({ hasText: "Running" }).waitFor();
  const second = await environment(page);
  assert.match((await status(second)).document.name, /^Untitled(?: \d+)?$/);
  await openDocument(page, file);
  await until(
    async () => (await page.evaluate(() => window.makeshiftDocument.status())).path === file,
  );
  await assert.rejects(() => status(second), /connection has closed/);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.locator(".agent-status").filter({ hasText: "Running" }).waitFor();
  const opened = await environment(page);
  assert.equal((await status(opened)).document.name, "first.makeshift");
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await until(
    async () =>
      !(await page.evaluate(() => window.makeshiftAgent.request({ kind: "read" }))).running,
  );
  await until(() => page.getByRole("button", { name: "Start", exact: true }).isEnabled());
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
    dialog.showMessageBox = async () => ({ response: 0 });
  }, dirname(first.cwd));
  const recovered = await page.evaluate(() => window.makeshiftAgent.request({ kind: "recover" }));
  assert(!recovered.error, recovered.error);
  await assert.rejects(() => status(opened), /connection has closed/);
  assert.equal(await readFile(join(recovered.workspace, "AGENTS.md"), "utf8"), custom);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.locator(".agent-status").filter({ hasText: "Running" }).waitFor();
  await terminal(page, "makeshift status; touch review-ready");
  await until(async () => {
    await readFile(join(recovered.workspace, "review-ready"));
    return true;
  });
  // The shell marker precedes the terminal's next output poll/paint.
  await page.waitForTimeout(300);
  await mkdir(".cache/sketch-review", { recursive: true });
  await page.screenshot({ path: ".cache/sketch-review/agent-orientation.png" });
  console.log(
    "PASS hidden Electron: terminal discovery/status, real geometry, Save As, preserved guidance, revoked restart/New/Open/recovery connections",
  );
} catch (error) {
  console.error(error);
  throw error;
} finally {
  const page = await app.firstWindow();
  await until(
    async () => !(await page.evaluate(() => window.makeshiftAgent.request({ kind: "stop" }))).error,
  ).catch(() => {});
  await app
    .evaluate(({ dialog }) => {
      dialog.showMessageBox = async (_w, o) => ({
        response: o.buttons?.[0] === "Stop and continue" ? 0 : 2,
      });
    })
    .catch(() => {});
  await app.close();
  await rm(root, { recursive: true, force: true });
}

async function terminal(page, text) {
  await page.locator(".agent-screen textarea").focus();
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
}
async function environment(page) {
  const cwd = (await page.evaluate(() => window.makeshiftAgent.request({ kind: "read" })))
    .workspace;
  const file = join(cwd, "orientation-env.txt");
  await rm(file, { force: true });
  await terminal(
    page,
    'printf "%s\\n" "$MAKESHIFT_CLI" "$MAKESHIFT_ENDPOINT" "$MAKESHIFT_CAPABILITY" "$MAKESHIFT_DOCS" "$MAKESHIFT_API_TYPES" "$MAKESHIFT_WORKSPACE" "$PATH" > orientation-env.txt',
  );
  let values;
  await until(async () => {
    values = (await readFile(file, "utf8")).trimEnd().split("\n");
    return values.length === 7;
  });
  await rm(file);
  const keys = [
    "MAKESHIFT_CLI",
    "MAKESHIFT_ENDPOINT",
    "MAKESHIFT_CAPABILITY",
    "MAKESHIFT_DOCS",
    "MAKESHIFT_API_TYPES",
    "MAKESHIFT_WORKSPACE",
    "PATH",
  ];
  return {
    cwd,
    env: { ...process.env, ...Object.fromEntries(keys.map((key, i) => [key, values[i]])) },
  };
}
async function status({ cwd, env }) {
  const result = await run(process.execPath, [resolve(".build/host/agent-cli/main.js"), "status"], {
    cwd,
    env,
  });
  return JSON.parse(result.stdout);
}
async function until(test) {
  for (let i = 0; i < 200; i++) {
    try {
      const result = await test();
      if (result) return result;
    } catch {}
    await new Promise((r) => setTimeout(r, 30));
  }
  throw new Error("Timed out waiting for orientation check.");
}
