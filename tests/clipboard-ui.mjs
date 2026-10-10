import assert from "node:assert/strict";
import { launchElectron } from "./native-documents.mjs";
import { at, drag, inspect, overlayPoint, reset } from "./ui-helpers.mjs";
import { chooseTool } from "./ui-tools.mjs";

// Integration regression: native menu roles must dispatch browser clipboard events to CAD,
// while text fields keep the platform's ordinary clipboard behavior.
const command = process.platform === "darwin" ? "Meta" : "Control";
const app = await launchElectron({
  args: ["."],
  env: { ...process.env, MAKESHIFT_TEST_HIDDEN: "1" },
});
try {
  const page = await app.firstWindow();
  page.setDefaultTimeout(30000);
  await page.setViewportSize({ width: 1280, height: 850 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.waitForFunction(() => Boolean(window.makeshiftInspect));
  assert.equal(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
    false,
  );
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("l");
  await drag(page, [-20, 0], [-10, 0]);
  await page.keyboard.press("Escape");
  await page.keyboard.press("l");
  await drag(page, [10, 0], [20, 0]);
  await page.keyboard.press("Escape");
  const point = await at(page, -15, 0);
  await page.mouse.click(point.x, point.y);
  await page.keyboard.press(`${command}+c`);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(JSON.parse(copied).geometry.sketches[0].curves.length, 1);
  await page.keyboard.press(`${command}+v`);
  await page.waitForFunction(
    () =>
      window.makeshiftInspect().document.sketches[0].curves.length === 3 &&
      window.makeshiftInspect().commands.every((c) => c.unavailable !== "Switching tools…"),
  );
  assert.equal((await inspect(page)).selectionTargets.length, 1, "Only pasted curve is selected");
  await page.keyboard.press("m");
  await page.waitForFunction(() => window.makeshiftInspect().moveMode);
  // Use the selection's Move widget: the original and copy occupy the same curve.
  const tip = await overlayPoint(page, '[data-move-marker="y"] > svg');
  const origin = await at(page, 0, 0),
    destination = await at(page, 0, 4);
  await page.mouse.move(tip.x, tip.y);
  await page.mouse.down();
  await page.mouse.move(tip.x + destination.x - origin.x, tip.y + destination.y - origin.y, {
    steps: 8,
  });
  await page.mouse.up();
  await page.waitForFunction(
    () => !window.makeshiftInspect().busy && window.makeshiftInspect().interaction === null,
  );
  const moved = (await inspect(page)).document.sketches[0].curves;
  assert.equal(moved[0].a.y, 0, "Move leaves the original curve in place");
  assert.ok(Math.abs(moved[2].a.y - 4) < 1e-7, "Move transforms the pasted selection");
  await chooseTool(page, "undo", "undo");
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 2);
  await chooseTool(page, "redo", "redo");
  assert.equal((await inspect(page)).document.sketches[0].curves.length, 3);
  await page.reload();
  await inspect(page);
  await page.getByRole("button", { name: "Tools", exact: true }).focus();
  await page.keyboard.press(`${command}+v`);
  await page.waitForFunction(
    () =>
      window.makeshiftInspect().document.sketches.reduce((n, s) => n + s.curves.length, 0) === 4,
  );
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    copied,
    "System clipboard survives renderer reload",
  );
  await createBody(page);
  await chooseTool(page, "Select all bodies", "select-all-bodies");
  await page.getByRole("button", { name: "Tools", exact: true }).focus();
  await page.keyboard.press(`${command}+c`);
  const bodyText = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(JSON.parse(bodyText).geometry.bodies.length, 1);
  await page.keyboard.press(`${command}+v`);
  await page.waitForFunction(
    () =>
      window.makeshiftInspect().document.bodies.length === 2 &&
      window.makeshiftInspect().commands.every((c) => c.unavailable !== "Switching tools…"),
  );
  assert.equal((await inspect(page)).modelingSelection.length, 1);
  await chooseTool(page, "Select all bodies", "select-all-bodies");
  await page.getByRole("button", { name: "Tools", exact: true }).focus();
  await page.keyboard.press(`${command}+c`);
  await reset(page);
  await page.getByRole("button", { name: "Tools", exact: true }).focus();
  await page.keyboard.press(`${command}+v`);
  await page.waitForFunction(
    () =>
      window.makeshiftInspect().document.bodies?.length === 2 &&
      window.makeshiftInspect().commands.every((c) => c.unavailable !== "Switching tools…"),
  );
  const pasted = (await inspect(page)).document;
  assert.equal((await inspect(page)).modelingSelection.length, 2);
  await chooseTool(page, "undo", "undo");
  assert.equal((await inspect(page)).document.bodies?.length ?? 0, 0);
  await chooseTool(page, "redo", "redo");
  assert.deepEqual((await inspect(page)).document, pasted);
  // Text fields own native paste even with geometry selected.
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  const search = page.getByRole("combobox", { name: "Find a tool" });
  await search.fill("copy");
  await search.press(`${command}+a`);
  await search.press(`${command}+c`);
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "copy");
  await search.fill("");
  await search.press(`${command}+v`);
  assert.equal(await search.inputValue(), "copy");
  await page.keyboard.press("Escape");
  assert.deepEqual((await inspect(page)).document, pasted);
  assert.deepEqual(errors, []);
  console.log(
    "Hidden Electron clipboard: curve subset, Move, reload, body sets, New, Undo/Redo and text-field ownership passed",
  );
} finally {
  await app.close();
}

async function createBody(page) {
  await reset(page);
  await chooseTool(page, "Sketch on XY", "sketch-xy");
  await page.keyboard.press("r");
  await drag(page, [-10, -5], [10, 5]);
  await page.getByRole("textbox", { name: "Width", exact: true }).fill("20");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.getByRole("textbox", { name: "Height", exact: true }).fill("10");
  await page.keyboard.press("Enter");
  await inspect(page);
  const center = await at(page, 0, 0);
  await chooseTool(page, "return to modeling", "modeling");
  await page.mouse.click(center.x, center.y);
  const distance = page.getByRole("textbox", { name: "Extrusion distance" });
  if (!(await distance.isVisible()))
    await page.getByRole("button", { name: "Drag extrusion", exact: true }).click();
  await distance.fill("5");
  await page.keyboard.press("Enter");
  await inspect(page);
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    () => !window.makeshiftInspect().busy && window.makeshiftInspect().interaction === null,
  );
  const state = await inspect(page);
  assert.equal(state.document.bodies.length, 1);
  assert.ok(Math.abs(state.document.bodies[0].volume - 1000) < 1e-7);
}
