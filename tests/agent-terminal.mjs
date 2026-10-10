import assert from "node:assert/strict";
import { access, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { agentMenuRoute } from "./agent-menu.mjs";
import { launchElectron } from "./native-documents.mjs";
import { corners, drag, pointEquals, settled } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

await mkdir(".cache/sketch-review", { recursive: true });
const app = await launchElectron({
  args: ["."],
  env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" },
});
try {
  const page = await app.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.evaluate(() =>
    window.makeshiftAgent.request({
      kind: "configure",
      preferences: {
        preset: "custom",
        executable: "/not-a-makeshift-executable",
        args: [],
        env: {},
      },
    }),
  );
  await page.getByRole("button", { name: "Open agent terminal" }).click();
  await page.locator(".agent-message").filter({ hasText: "Could not start" }).waitFor();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Executable", { exact: true }).fill("/bin/sh");
  await page.getByLabel("Arguments · one per line").fill("-i");
  await page
    .getByLabel("Environment · NAME=value, one per line")
    .fill("MAKESHIFT_TERMINAL_CHECK=retained");
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await waitAgent(page, (status) => status.running);
  const first = await page.evaluate(() => window.makeshiftAgent.request({ kind: "settings" }));
  assert(first.workspace);
  const input = page.locator(".agent-screen textarea");
  await input.focus();
  await page.keyboard.type('printf "%s" "$MAKESHIFT_TERMINAL_CHECK" > terminal-check.txt');
  await page.keyboard.press("Enter");
  await waitFile(join(first.workspace, "terminal-check.txt"));
  assert.equal(await readFile(join(first.workspace, "terminal-check.txt"), "utf8"), "retained");
  // Supply test clipboard data without reading or modifying the user's clipboard.
  await app.evaluate(({ clipboard }) => {
    clipboard.readText = () => 'printf "paste worked" > paste-check.txt';
  });
  await page.keyboard.press("Meta+v");
  await page.keyboard.press("Enter");
  await waitFile(join(first.workspace, "paste-check.txt"));
  assert.equal(await readFile(join(first.workspace, "paste-check.txt"), "utf8"), "paste worked");
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await chooseTool(page, "rectangle", "rectangle");
  await drag(page, [-10, -6], [10, 6]);
  pointEquals((await corners(page))[2], [10, 6]);
  await page.getByRole("textbox", { name: "Width", exact: true }).fill("24");
  await page.keyboard.press("Enter");
  await settled(page);
  await chooseTool(page, "undo", "undo");
  pointEquals((await corners(page))[2], [10, 6]);
  await chooseTool(page, "redo", "redo");
  await settled(page);
  await input.focus();
  const before = await page.evaluate(() => JSON.stringify(window.makeshiftInspect().document));
  await page.keyboard.type("mrs");
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Meta+z");
  assert.equal(
    await page.evaluate(() => JSON.stringify(window.makeshiftInspect().document)),
    before,
  );
  await page.getByRole("button", { name: "Change agent dock position" }).click();
  assert.equal(await page.locator(".agent-dock").getAttribute("data-side"), "bottom");
  const splitter = page.getByRole("separator", { name: "Resize agent pane" });
  await splitter.focus();
  await page.keyboard.press("ArrowUp");
  await page.getByRole("button", { name: "Collapse agent terminal" }).click();
  assert.equal(
    (await page.evaluate(() => window.makeshiftAgent.request({ kind: "settings" }))).running,
    true,
  );
  await page.getByRole("button", { name: "Expand agent terminal" }).click();
  await agentMenuRoute(page);
  await input.focus();
  await page.keyboard.type('printf "GHOSTTY TERMINAL READY\\n"; touch rendered.txt');
  await page.keyboard.press("Enter");
  await waitFile(join(first.workspace, "rendered.txt"));
  await page.screenshot({ path: ".cache/sketch-review/agent-terminal-electron.png" });
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await waitAgent(page, (status) => !status.running);
  await access(join(first.workspace, "terminal-check.txt"));
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await waitAgent(page, (status) => status.running);
  assert.equal(
    (await page.evaluate(() => window.makeshiftAgent.request({ kind: "settings" }))).workspace,
    first.workspace,
  );
  const opened = app.waitForEvent("window");
  await chooseTool(page, "new document", "new");
  const independent = await opened;
  await settled(independent);
  assert.equal(
    (await page.evaluate(() => window.makeshiftAgent.request({ kind: "settings" }))).running,
    true,
  );
  assert.equal(
    (await independent.evaluate(() => window.makeshiftAgent.request({ kind: "settings" }))).running,
    false,
  );
  assert.equal(
    (await independent.evaluate(() => window.makeshiftAgent.request({ kind: "settings" })))
      .workspace,
    null,
  );
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await waitAgent(page, (status) => !status.running);
  await access(join(first.workspace, "terminal-check.txt"));
  assert.deepEqual(errors, []);
  console.log(
    "PASS hidden Electron terminal: real PTY input, env/cwd, collapse, resize, stop/restart, independent New window, retained files",
  );
} finally {
  const page = app.windows()[0];
  if (page && !page.isClosed()) {
    await page.evaluate(() => window.makeshiftAgent.request({ kind: "stop" })).catch(() => {});
    await page.waitForFunction(() => !window.makeshiftInspect().busy).catch(() => {});
  }
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBox = async (_window, options) => ({
      response: options.buttons?.[0] === "Save" ? 2 : 0,
    });
  });
  await app.close();
}

async function waitFile(path) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await access(path);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(`Terminal command did not create ${path}`);
}

async function waitAgent(page, predicate) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const status = await page.evaluate(() => window.makeshiftAgent.request({ kind: "settings" }));
    if (!status.error && predicate(status)) return status;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Agent did not reach its expected lifecycle state.");
}
