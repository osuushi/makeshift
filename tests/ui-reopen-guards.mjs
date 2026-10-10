import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { electronSession } from "./native-documents.mjs";
import { plate } from "./ui-body-fillet.mjs";
import { inspect } from "./ui-helpers.mjs";
import { button, completed } from "./ui-reopen-cycle.mjs";
import { chooseTool, toolEnabled } from "./ui-tools.mjs";

async function unchanged(page, document, history) {
  const state = await inspect(page);
  assert.deepEqual(state.document, document);
  assert.equal(state.interaction, null);
  assert.deepEqual(await page.evaluate(() => window.makeshiftHistory()), history);
}
export async function reopenFocusGuards(page, name) {
  await plate(page);
  await button(page, "Select Body 1").click();
  const document = (await inspect(page)).document;
  const history = await page.evaluate(() => window.makeshiftHistory());
  assert.equal(await toolEnabled(page, "reopen last operation", "reopen-operation"), true);
  await button(page, "More tools").focus();
  await page.keyboard.press("Meta+r");
  await unchanged(page, document, history);
  await button(page, "Select Body 1").dblclick();
  const input = page.getByRole("textbox", { name: "Name for Body 1", exact: true });
  await input.press("Meta+r");
  assert.ok(await input.isVisible());
  assert.deepEqual((await inspect(page)).document, document);
  await input.press("Escape");
  await page.locator("#world canvas").focus();
  await page
    .locator("#world canvas")
    .dispatchEvent("keydown", { key: "r", metaKey: true, isComposing: true });
  await unchanged(page, document, history);
  await page.keyboard.press("Meta+f");
  await page.getByRole("combobox", { name: "Find a tool", exact: true }).press("Meta+r");
  assert.ok(await page.getByRole("dialog", { name: "Find a tool", exact: true }).isVisible());
  await page.keyboard.press("Escape");
  await unchanged(page, document, history);
  await button(page, "Color for Body 1").click();
  const dialog = page.getByRole("dialog", { name: "Appearance of Body 1", exact: true });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).focus();
  await page.keyboard.press("Meta+r");
  assert.ok(await dialog.isVisible());
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await unchanged(page, document, history);
  await terminalGuard(page, document, history);
  await button(page, "Select Body 1").dblclick();
  await input.fill("Renamed body");
  await input.press("Enter");
  const renamed = (await completed(page)).document;
  assert.equal(
    await toolEnabled(page, "reopen last operation", "reopen-operation"),
    false,
    "newer changed metadata blocks earlier Extrude",
  );
  const renamedHistory = await page.evaluate(() => window.makeshiftHistory());
  assert.equal(
    renamedHistory.findLast((entry) => entry.state === "applied" && entry.outcome === "changed")
      .operation.kind,
    "rename-entity",
  );
  await page.locator("#world canvas").focus();
  await page.keyboard.press("Meta+r");
  await unchanged(page, renamed, renamedHistory);
  await chooseTool(page, "undo", "undo");
  await completed(page);
  assert.equal(await toolEnabled(page, "reopen last operation", "reopen-operation"), true);
  console.log(
    `${name}: field/button/menu/dialog/composition guards and latest unsupported metadata barrier passed`,
  );
}
export async function reopenCompositeGuard(page, name) {
  await plate(page);
  const before = (await inspect(page)).document;
  const request = {
    kind: "transform-bodies",
    transform: {
      ids: [before.bodies[0].id],
      pivot: before.bodies[0].center,
      axis: [0, 0, 1],
      angle: 5,
      translation: [1, 2, 0],
      duplicate: false,
    },
  };
  // Actual public owner/API input; this unsupported composite has no ordinary single-gesture UI producer.
  const reply = await page.evaluate(
    async (request) =>
      window.makeshiftModel
        ? window.makeshiftModel(request)
        : (
            await fetch("/sketch-api", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(request),
            })
          ).json(),
    request,
  );
  assert.equal(reply.error, undefined);
  const accepted = reply.view.data;
  assert.notDeepEqual(accepted, before);
  const history = await page.evaluate(async () => {
    const request = { kind: "read-history" };
    const reply = window.makeshiftModel
      ? await window.makeshiftModel(request)
      : await (
          await fetch("/sketch-api", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
          })
        ).json();
    return reply.history;
  });
  assert.ok(history);
  assert.equal(
    history.findLast((entry) => entry.state === "applied" && entry.outcome === "changed").operation
      .kind,
    "transform-bodies",
  );
  assert.deepEqual(
    history.findLast((entry) => entry.state === "applied" && entry.outcome === "changed").operation
      .parameters.transform,
    request.transform,
  );
  await page.reload();
  await page.waitForFunction(() => Boolean(window.makeshiftInspect));
  await unchanged(page, accepted, history);
  assert.equal(await toolEnabled(page, "reopen last operation", "reopen-operation"), false);
  await page.locator("#world canvas").focus();
  await page.keyboard.press("Meta+r");
  await unchanged(page, accepted, history);
  console.log(
    `${name}: accepted native composite API input blocks earlier eligible operations; actual Cmd-R leaves owner history unchanged`,
  );
}
async function terminalGuard(page, document, history) {
  if (!electronSession(page)) return;
  const configured = await page.evaluate(() =>
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
  assert.equal(configured.error, undefined);
  try {
    await button(page, "Open agent terminal").click();
    const status = await waitAgentStatus(page, true);
    const workspace = status.workspace;
    console.log("electron: successful terminal startup snapshot", JSON.stringify(status));
    const terminal = page.locator(".agent-screen textarea");
    await terminal.focus();
    await page.keyboard.type(
      "stty -icanon -echo; printf ready > reopen-key-ready; dd bs=1 count=1 of=reopen-key.bin 2>/dev/null; stty icanon echo",
    );
    await page.keyboard.press("Enter");
    await waitFile(join(workspace, "reopen-key-ready"));
    await page.keyboard.press("Control+r");
    assert.deepEqual(
      await waitFile(join(workspace, "reopen-key.bin")),
      Buffer.from([18]),
      "real terminal receives Ctrl-R byte",
    );
    await unchanged(page, document, history);
    await page.keyboard.press("Meta+r");
    await unchanged(page, document, history);
    await button(page, "Collapse agent terminal").click();
    console.log(
      "electron: real PTY Ctrl-R input and terminal Cmd-R leave modeling history untouched",
    );
  } finally {
    const stopped = await page.evaluate(() => window.makeshiftAgent.request({ kind: "stop" }));
    assert.equal(stopped.error, undefined);
    await waitAgentStatus(page, false);
  }
}
/** Await each real lifecycle reply; this SDK's waitForFunction treats async predicates as truthy. */
async function waitAgentStatus(page, running) {
  const end = Date.now() + 120000;
  let status;
  while (Date.now() < end) {
    status = await page.evaluate(async () => {
      const reply = await window.makeshiftAgent.request({ kind: "settings" });
      return {
        error: reply.error,
        running: reply.running,
        workspace: reply.workspace,
        exitCode: reply.exitCode,
      };
    });
    if (status.error && status.error !== "An agent lifecycle operation is already in progress.")
      throw new Error(`Agent lifecycle failed: ${JSON.stringify(status)}`);
    if (
      !status.error &&
      status.running === running &&
      (!running || (typeof status.workspace === "string" && status.workspace.length > 0))
    )
      return status;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Agent did not reach running=${running}: ${JSON.stringify(status)}`);
}
async function waitFile(path) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    try {
      const value = await readFile(path);
      if (value.length) return value;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Owned terminal did not produce ${path}`);
}

export async function reopenHostReload(page) {
  const session = electronSession(page);
  if (!session) return;
  const before = (await completed(page)).document;
  const history = await page.evaluate(() => window.makeshiftHistory());
  const reload = await session.app.evaluate(({ Menu }) => {
    const view = Menu.getApplicationMenu().items.find((item) => item.label === "View");
    return view.submenu.items
      .filter((item) => ["reload", "forcereload"].includes(item.role?.toLowerCase()))
      .map((item) => ({ role: item.role.toLowerCase(), accelerator: item.accelerator }));
  });
  assert.deepEqual(reload, [
    { role: "reload", accelerator: "CmdOrCtrl+Shift+R" },
    { role: "forcereload", accelerator: "CmdOrCtrl+Alt+Shift+R" },
  ]);
  await page.locator("#world canvas").focus();
  // CDP key injection reaches DOM listeners but bypasses hidden Electron host input interception.
  await page.keyboard.press("Meta+Shift+r");
  await unchanged(page, before, history);
  console.log(
    "electron: injected Shift-Cmd-R leaves renderer document/history unchanged; physical OS accelerator delivery unverified",
  );
  const loaded = page.waitForEvent("load");
  await session.app.evaluate(({ Menu, BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    const view = Menu.getApplicationMenu().items.find((item) => item.label === "View");
    const reload = view.submenu.items.find((item) => item.role?.toLowerCase() === "reload");
    // MenuItem role dispatch requires explicit window/contents in an unfocused hidden test.
    reload.click({}, window, window.webContents);
  });
  await loaded;
  await page.waitForFunction(() => Boolean(window.makeshiftInspect));
  await unchanged(page, before, history);
  console.log(
    "electron: real native Reload menu invocation loads renderer and preserves exact owner document/history",
  );
}
